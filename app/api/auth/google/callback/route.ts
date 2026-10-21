import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../../db";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  exchangeGoogleCode,
  googleOAuthConfig,
  oauthCookieOptions,
} from "../../../../../lib/google-oauth";
import { createSession } from "../../../../../lib/session";

type ExistingCollaborator = {
  id: number;
  email: string;
  name: string;
  role: "admin" | "staff";
  status: "pending" | "approved" | "rejected";
  password_hash: string | null;
  google_sub: string | null;
};

function clearOAuthCookies(response: NextResponse) {
  response.cookies.set(GOOGLE_STATE_COOKIE, "", { ...oauthCookieOptions, maxAge: 0 });
  response.cookies.set(GOOGLE_VERIFIER_COOKIE, "", { ...oauthCookieOptions, maxAge: 0 });
  return response;
}

function errorRedirect(request: NextRequest, reason: string) {
  const response = NextResponse.redirect(
    new URL(`/login?oauth_error=${encodeURIComponent(reason)}`, request.nextUrl.origin),
  );
  return clearOAuthCookies(response);
}

export async function GET(request: NextRequest) {
  const providerError = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(GOOGLE_VERIFIER_COOKIE)?.value;

  if (providerError) return errorRedirect(request, "access_denied");
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return errorRedirect(request, "invalid_state");
  }

  try {
    googleOAuthConfig(request.nextUrl.origin);
    const profile = await exchangeGoogleCode(code, verifier, request.nextUrl.origin);
    const db = await getDb();
    const existing = await db
      .prepare(`
        SELECT id, email, name, role, status, password_hash, google_sub
        FROM collaborators
        WHERE email = ? OR google_sub = ?
        ORDER BY CASE WHEN email = ? THEN 0 ELSE 1 END
        LIMIT 1
      `)
      .bind(profile.email, profile.sub, profile.email)
      .first<ExistingCollaborator>();

    if (existing && existing.email !== profile.email) {
      return errorRedirect(request, "account_conflict");
    }
    if (existing?.google_sub && existing.google_sub !== profile.sub) {
      return errorRedirect(request, "account_conflict");
    }

    const initialAdminEmail = (process.env.INITIAL_ADMIN_EMAIL ?? "")
      .trim()
      .toLowerCase();
    const isInitialAdmin =
      Boolean(initialAdminEmail) && profile.email === initialAdminEmail;
    const role = isInitialAdmin ? "admin" : (existing?.role ?? "staff");
    const status = isInitialAdmin ? "approved" : (existing?.status ?? "pending");
    const provider = existing?.password_hash ? "password+google" : "google";
    const displayName = existing?.name || profile.name;

    if (existing) {
      await db
        .prepare(`
          UPDATE collaborators
          SET google_sub = ?, avatar_url = ?, auth_provider = ?, role = ?, status = ?,
            approved_at = CASE
              WHEN ? = 'approved' THEN COALESCE(approved_at, CURRENT_TIMESTAMP)
              ELSE approved_at
            END,
            approved_by = CASE
              WHEN ? = 'approved' THEN COALESCE(approved_by, 'configuración inicial')
              ELSE approved_by
            END
          WHERE id = ?
        `)
        .bind(
          profile.sub,
          profile.picture,
          provider,
          role,
          status,
          status,
          status,
          existing.id,
        )
        .run();
    } else {
      await db
        .prepare(`
          INSERT INTO collaborators
            (email, name, position, role, status, auth_provider, google_sub,
             avatar_url, approved_at, approved_by)
          VALUES (?, ?, 'Colaborador', ?, ?, 'google', ?, ?,
            CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
            CASE WHEN ? = 'approved' THEN 'configuración inicial' ELSE NULL END)
        `)
        .bind(
          profile.email,
          displayName,
          role,
          status,
          profile.sub,
          profile.picture,
          status,
          status,
        )
        .run();
    }

    await db
      .prepare(`
        INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
        VALUES (?, ?, 'collaborator', ?, ?)
      `)
      .bind(
        `${displayName} <${profile.email}>`,
        existing ? "google_login" : "register_request",
        profile.email,
        existing
          ? "Inicio de sesión con Google"
          : `Registro con Google${isInitialAdmin ? " · Colaborador principal inicial" : ""}`,
      )
      .run();

    await createSession({ email: profile.email, name: displayName });
    return clearOAuthCookies(NextResponse.redirect(new URL("/", request.nextUrl.origin)));
  } catch (error) {
    console.error("Google OAuth error", error instanceof Error ? error.message : error);
    return errorRedirect(request, "google_verification_failed");
  }
}
