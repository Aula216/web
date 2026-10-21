import { getDb } from "../db";
import { getCurrentUser } from "../lib/session";

export function initialAdminEmail() {
  return (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase();
}

export type Collaborator = {
  id: number;
  email: string;
  name: string;
  position: string;
  role: "admin" | "staff";
  status: "pending" | "approved" | "rejected";
  auth_provider: "password" | "google" | "password+google";
  google_sub: string | null;
  avatar_url: string | null;
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

export async function identityFromRequest() {
  const user = await getCurrentUser();
  if (!user) return null;
  return { email: user.email.trim().toLowerCase(), name: user.name };
}

export async function collaboratorForRequest(request: Request) {
  void request;
  const identity = await identityFromRequest();
  if (!identity) return { identity: null, collaborator: null, db: await getDb() };

  const db = await getDb();
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
      "Tu registro todavía no ha sido aprobado por un colaborador principal.",
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
