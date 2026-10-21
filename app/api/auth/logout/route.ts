import { NextResponse } from "next/server";
import { destroySession } from "../../../../lib/session";

export async function GET(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url));
}

export async function POST(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url));
}
