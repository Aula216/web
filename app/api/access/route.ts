import {
  accessErrorResponse,
  collaboratorForRequest,
  initialAdminEmail,
  requireApprovedCollaborator,
} from "../../authz";

type Payload = Record<string, unknown>;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    const { identity, collaborator, db } = await collaboratorForRequest(request);
    if (!identity) {
      return Response.json({ authenticated: false }, { status: 401 });
    }

    const isAdmin = collaborator?.status === "approved" && collaborator.role === "admin";
    const collaborators = isAdmin
      ? (
          await db
            .prepare(`
              SELECT id, email, name, position, role, status, auth_provider,
                google_sub, avatar_url,
                requested_at, approved_at, approved_by, last_seen_at
              FROM collaborators
              ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                requested_at DESC
            `)
            .all()
        ).results
      : [];

    return Response.json({
      authenticated: true,
      identity,
      collaborator,
      collaborators,
      ownerEmail: isAdmin ? initialAdminEmail() : null,
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return Response.json({ error: "No se pudo comprobar el acceso." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Payload;
    const action = textValue(payload.action);

    if (action === "register") {
      const { identity, collaborator, db } = await collaboratorForRequest(request);
      if (!identity) {
        return Response.json({ error: "Inicia sesión para registrarte." }, { status: 401 });
      }
      if (collaborator?.status === "approved") {
        return Response.json({ ok: true, collaborator });
      }

      const position = "Colaborador";
      await db
        .prepare(`
          INSERT INTO collaborators (email, name, position, role, status)
          VALUES (?, ?, ?, 'staff', 'pending')
          ON CONFLICT(email) DO UPDATE SET
            name = excluded.name,
            position = excluded.position,
            status = CASE
              WHEN collaborators.status = 'approved' THEN 'approved'
              ELSE 'pending'
            END,
            requested_at = CASE
              WHEN collaborators.status = 'approved' THEN collaborators.requested_at
              ELSE CURRENT_TIMESTAMP
            END
        `)
        .bind(identity.email, identity.name, position)
        .run();
      await db
        .prepare(`
          INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
          VALUES (?, 'register_request', 'collaborator', ?, ?)
        `)
        .bind(`${identity.name} <${identity.email}>`, identity.email, position)
        .run();
      return Response.json({ ok: true, status: "pending" }, { status: 201 });
    }

    const { collaborator: admin, actor, db } = await requireApprovedCollaborator(request);
    if (admin.role !== "admin") {
      return Response.json(
        { error: "Solo un colaborador principal puede gestionar accesos." },
        { status: 403 },
      );
    }

    const email = textValue(payload.email).toLowerCase();
    if (!email) {
      return Response.json({ error: "Colaborador inválido." }, { status: 400 });
    }
    if (
      (email === initialAdminEmail() || email === admin.email) &&
      action !== "approve_collaborator"
    ) {
      return Response.json(
        { error: "No se puede retirar el acceso del colaborador principal protegido." },
        { status: 409 },
      );
    }

    if (action === "approve_collaborator") {
      const role = textValue(payload.role) === "admin" ? "admin" : "staff";
      if (
        role !== "admin" &&
        (email === initialAdminEmail() || email === admin.email)
      ) {
        return Response.json(
          { error: "No se puede degradar esta cuenta principal protegida." },
          { status: 409 },
        );
      }
      const result = await db
        .prepare(`
          UPDATE collaborators
          SET status = 'approved', role = ?, approved_at = CURRENT_TIMESTAMP, approved_by = ?
          WHERE email = ?
        `)
        .bind(role, actor, email)
        .run();
      if (!result.meta.changes) {
        return Response.json({ error: "No encontramos ese registro." }, { status: 404 });
      }
      await db
        .prepare(`
          INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
          VALUES (?, 'approve', 'collaborator', ?, ?)
        `)
        .bind(actor, email, `Acceso definido como ${role === "admin" ? "colaborador principal" : "colaborador"}`)
        .run();
      return Response.json({ ok: true });
    }

    if (action === "reject_collaborator" || action === "revoke_collaborator") {
      const status = "rejected";
      const result = await db
        .prepare("UPDATE collaborators SET status = ? WHERE email = ?")
        .bind(status, email)
        .run();
      if (!result.meta.changes) {
        return Response.json({ error: "No encontramos ese registro." }, { status: 404 });
      }
      await db
        .prepare(`
          INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
          VALUES (?, ?, 'collaborator', ?, ?)
        `)
        .bind(actor, action === "revoke_collaborator" ? "revoke" : "reject", email, "Acceso bloqueado")
        .run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return Response.json({ error: "No se pudo actualizar el acceso." }, { status: 500 });
  }
}
