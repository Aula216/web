import { getCurrentUser } from "../lib/session";
import LibraryApp from "./library-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <LibraryApp
      currentUser={user ? { name: user.name, email: user.email } : null}
    />
  );
}
