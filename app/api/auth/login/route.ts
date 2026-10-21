import { compare } from "bcryptjs";
import { getDb } from "../../../../db";
import { createSession } from "../../../../lib/session";

type LoginPayload = {
  email?: unknown;
  password?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as LoginPayload;
    const email = text(payload.email).toLowerCase();
    const password = text(payload.password);

    const db = await getDb();
    const collaborator = await db
      .prepare(`
        SELECT email, name, password_hash
        FROM collaborators
        WHERE email = ?
      `)
      .bind(email)
      .first<{ email: string; name: string; password_hash: string | null }>();

    const validPassword =
      collaborator?.password_hash &&
      (await compare(password, collaborator.password_hash));

    if (!collaborator || !validPassword) {
      return Response.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 },
      );
    }

    await createSession({ email: collaborator.email, name: collaborator.name });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo iniciar sesión.",
      },
      { status: 500 },
    );
  }
}
