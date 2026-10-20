import { getD1 } from "../db";

export const OWNER_EMAIL = "boltzmann.euler.maxwell@gmail.com";

export type Collaborator = {
  id: number;
  email: string;
  name: string;
  position: string;
  role: "admin" | "staff";
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  last_seen_at: string | null;
};

export class AccessError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function identityFromRequest(request: Request) {
  const email = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (!email) return null;

  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get(
    "oai-authenticated-user-full-name-encoding",
  );
  let name = email;
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      name = decodeURIComponent(encodedName);
    } catch {
      name = email;
    }
  }
  return { email, name };
}

export async function collaboratorForRequest(request: Request) {
  const identity = identityFromRequest(request);
  if (!identity) return { identity: null, collaborator: null, db: await getD1() };

  const db = await getD1();
  const collaborator = await db
    .prepare("SELECT * FROM collaborators WHERE email = ?")
    .bind(identity.email)
    .first<Collaborator>();
  return { identity, collaborator: collaborator ?? null, db };
}

export async function requireApprovedCollaborator(request: Request) {
  const context = await collaboratorForRequest(request);
  if (!context.identity) {
    throw new AccessError(401, "Inicia sesión para continuar.");
  }
  if (!context.collaborator || context.collaborator.status !== "approved") {
    throw new AccessError(
      403,
      "Tu registro todavía no ha sido aprobado por un administrador.",
    );
  }

  await context.db
    .prepare("UPDATE collaborators SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(context.collaborator.id)
    .run();

  return {
    ...context,
    collaborator: context.collaborator,
    actor: `${context.collaborator.name} <${context.collaborator.email}>`,
  };
}

export function accessErrorResponse(error: unknown) {
  if (error instanceof AccessError) {
    return Response.json({ error: error.message }, { status: error.statusCode });
  }
  return null;
}
