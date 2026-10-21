import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionUser = {
  email: string;
  name: string;
};

type SessionData = {
  user?: SessionUser;
};

function sessionOptions(): SessionOptions {
  const password =
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === "production"
      ? ""
      : "biblioteca-216-desarrollo-local-2026");
  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_SECRET debe contener al menos 32 caracteres.",
    );
  }

  return {
    cookieName: "biblioteca_216_session",
    password,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session.user ?? null;
}

export async function createSession(user: SessionUser) {
  const session = await getSession();
  session.user = user;
  await session.save();
}

export async function destroySession() {
  const session = await getSession();
  session.destroy();
}
