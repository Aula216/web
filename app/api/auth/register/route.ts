import { hash } from "bcryptjs";
import { getDb } from "../../../../db";
import { createSession } from "../../../../lib/session";

type RegisterPayload = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value: string) {
  return (
    value.length >= 8 &&
    /\p{L}/u.test(value) &&
    /\d/.test(value) &&
    /[^\p{L}\p{N}\s]/u.test(value)
  );
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RegisterPayload;
    const name = text(payload.name);
    const email = text(payload.email).toLowerCase();
    const password = text(payload.password);
    const confirmPassword = text(payload.confirmPassword);
    const position = "Colaborador";

    if (!name || !validEmail(email)) {
      return Response.json(
        { error: "Completa tu nombre y utiliza un correo electrónico válido." },
        { status: 400 },
      );
    }
    if (!validPassword(password)) {
      return Response.json(
        { error: "La contraseña debe tener al menos 8 caracteres, una letra, un número y un carácter especial." },
        { status: 400 },
      );
    }
    if (password !== confirmPassword) {
      return Response.json(
        { error: "La confirmación de la contraseña no coincide." },
        { status: 400 },
      );
    }

    const initialAdminEmail = text(process.env.INITIAL_ADMIN_EMAIL).toLowerCase();
    const isInitialAdmin = Boolean(initialAdminEmail) && email === initialAdminEmail;

    const db = await getDb();
    const existing = await db
      .prepare(
        `SELECT id, password_hash, google_sub, role, status
         FROM collaborators WHERE email = ?`,
      )
      .bind(email)
      .first<{
        id: number;
        password_hash: string | null;
        google_sub: string | null;
        role: "admin" | "staff";
        status: "pending" | "approved" | "rejected";
      }>();

    if (existing?.password_hash) {
      return Response.json(
        { error: "Ese correo ya tiene una cuenta. Inicia sesión." },
        { status: 409 },
      );
    }

    const passwordHash = await hash(password, 12);
    const role = isInitialAdmin ? "admin" : (existing?.role ?? "staff");
    const status = isInitialAdmin ? "approved" : (existing?.status ?? "pending");
    const provider = existing?.google_sub ? "password+google" : "password";

    if (existing) {
      await db
        .prepare(`
          UPDATE collaborators
          SET name = ?, position = ?, role = ?, status = ?, password_hash = ?,
            auth_provider = ?,
            requested_at = CASE WHEN status = 'approved' THEN requested_at ELSE CURRENT_TIMESTAMP END,
            approved_at = CASE
              WHEN ? = 'approved' THEN COALESCE(approved_at, CURRENT_TIMESTAMP)
              ELSE approved_at
            END,
            approved_by = CASE
              WHEN ? = 'approved' THEN COALESCE(approved_by, 'configuración inicial')
              ELSE approved_by
            END
          WHERE email = ?
        `)
        .bind(
          name,
          position,
          role,
          status,
          passwordHash,
          provider,
          status,
          status,
          email,
        )
        .run();
    } else {
      await db
        .prepare(`
          INSERT INTO collaborators
            (email, name, position, role, status, password_hash, auth_provider,
             approved_at, approved_by)
          VALUES (?, ?, ?, ?, ?, ?, 'password',
            CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
            CASE WHEN ? = 'approved' THEN 'configuración inicial' ELSE NULL END)
        `)
        .bind(email, name, position, role, status, passwordHash, status, status)
        .run();
    }

    await db
      .prepare(`
        INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
        VALUES (?, 'register_request', 'collaborator', ?, ?)
      `)
      .bind(
        `${name} <${email}>`,
        email,
        `Registro con correo${isInitialAdmin ? " · Colaborador principal inicial" : ""}`,
      )
      .run();

    await createSession({ email, name });
    return Response.json({ ok: true, status }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear la cuenta.",
      },
      { status: 500 },
    );
  }
}
