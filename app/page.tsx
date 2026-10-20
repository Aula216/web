import { getChatGPTUser } from "./chatgpt-auth";
import LibraryApp from "./library-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <LibraryApp
      currentUser={user ? { name: user.displayName, email: user.email } : null}
    />
  );
}
