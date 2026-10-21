import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/session";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth_error?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (user) redirect("/");
  return <LoginForm initialOauthError={params.oauth_error} />;
}
