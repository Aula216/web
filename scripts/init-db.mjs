import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import postgres from "postgres";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Configura DATABASE_URL antes de inicializar la base de datos.");
}

const schema = await readFile(resolve(projectRoot, "database/schema.sql"), "utf8");
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql.unsafe(schema);
  process.stdout.write("Base de datos de Biblioteca 216 inicializada.\n");
} finally {
  await sql.end();
}
