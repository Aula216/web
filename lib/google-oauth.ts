import { createHash, randomBytes } from "node:crypto";

export const GOOGLE_STATE_COOKIE = "biblioteca_216_google_state";
export const GOOGLE_VERIFIER_COOKIE = "biblioteca_216_google_verifier";

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
};

export function googleOAuthConfig(origin: string) {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const redirectUri =
    (process.env.GOOGLE_REDIRECT_URI ?? "").trim() ||
    `${origin}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("El acceso con Google todavía no está configurado.");
  }

  return { clientId, clientSecret, redirectUri };
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function createCodeVerifier() {
  return randomBytes(48).toString("base64url");
}

export function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export const oauthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 10,
};

export async function exchangeGoogleCode(
  code: string,
  verifier: string,
  origin: string,
): Promise<GoogleProfile> {
  const config = googleOAuthConfig(origin);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });

  const tokenPayload = (await tokenResponse.json()) as {
    id_token?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokenPayload.id_token) {
    throw new Error(
      tokenPayload.error_description || "Google no pudo validar el acceso.",
    );
  }

  const profileResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenPayload.id_token)}`,
    { cache: "no-store" },
  );
  const profile = (await profileResponse.json()) as {
    sub?: string;
    aud?: string;
    iss?: string;
    exp?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    picture?: string;
  };

  const verified = profile.email_verified === true || profile.email_verified === "true";
  const validIssuer =
    profile.iss === "accounts.google.com" ||
    profile.iss === "https://accounts.google.com";
  const expiration = Number(profile.exp ?? 0);

  if (
    !profileResponse.ok ||
    !profile.sub ||
    !profile.email ||
    !verified ||
    profile.aud !== config.clientId ||
    !validIssuer ||
    expiration * 1000 <= Date.now()
  ) {
    throw new Error("La identidad de Google no pudo verificarse de forma segura.");
  }

  return {
    sub: profile.sub,
    email: profile.email.trim().toLowerCase(),
    name: profile.name?.trim() || profile.email.split("@")[0],
    picture: profile.picture?.trim() || null,
  };
}
