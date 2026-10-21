import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  codeChallenge,
  createCodeVerifier,
  createOAuthState,
  googleOAuthConfig,
  oauthCookieOptions,
} from "../../../../../lib/google-oauth";

export async function GET(request: NextRequest) {
  try {
    const config = googleOAuthConfig(request.nextUrl.origin);
    const state = createOAuthState();
    const verifier = createCodeVerifier();
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: codeChallenge(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(GOOGLE_STATE_COOKIE, state, oauthCookieOptions);
    response.cookies.set(GOOGLE_VERIFIER_COOKIE, verifier, oauthCookieOptions);
    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/login?oauth_error=google_not_configured", request.nextUrl.origin),
    );
  }
}
