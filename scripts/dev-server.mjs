import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
let host = "localhost";
let port = "3000";

for (let index = 0; index < args.length; index += 1) {
  if (["--host", "--hostname", "-H"].includes(args[index])) {
    host = args[index + 1] ?? host;
    index += 1;
  } else if (["--port", "-p"].includes(args[index])) {
    port = args[index + 1] ?? port;
    index += 1;
  }
}

const nextCli = resolve("node_modules/next/dist/bin/next");
const child = spawnSync(process.execPath, [nextCli, "dev", "-H", host, "-p", port], {
  stdio: "inherit",
  env: process.env,
});

process.exit(child.status ?? 1);
