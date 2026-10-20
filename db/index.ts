import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaReady: Promise<unknown> | null = null;

async function ensureSchema(db: D1Database) {
  if (!schemaReady) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        isbn TEXT,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'Autor no registrado',
        publisher TEXT NOT NULL DEFAULT '',
        publish_year TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'General',
        shelf TEXT NOT NULL DEFAULT 'Sin asignar',
        cover_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS books_isbn_unique ON books (isbn)",
      `CREATE TABLE IF NOT EXISTS copies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'available',
        condition TEXT NOT NULL DEFAULT 'Bueno',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE INDEX IF NOT EXISTS copies_book_id_idx ON copies (book_id)",
      `CREATE TABLE IF NOT EXISTS readers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE INDEX IF NOT EXISTS readers_name_idx ON readers (name)",
      `CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        copy_id INTEGER NOT NULL REFERENCES copies(id),
        reader_id INTEGER NOT NULL REFERENCES readers(id),
        borrowed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        due_at TEXT NOT NULL,
        returned_at TEXT,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT 'sistema'
      )`,
      "CREATE INDEX IF NOT EXISTS loans_reader_id_idx ON loans (reader_id)",
      "CREATE INDEX IF NOT EXISTS loans_due_at_idx ON loans (due_at)",
      "CREATE UNIQUE INDEX IF NOT EXISTS loans_one_active_per_copy ON loans (copy_id) WHERE returned_at IS NULL",
      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE INDEX IF NOT EXISTS audit_created_at_idx ON audit_log (created_at)",
      `CREATE TABLE IF NOT EXISTS collaborators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        position TEXT NOT NULL DEFAULT 'Encargado de biblioteca',
        role TEXT NOT NULL DEFAULT 'staff',
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        approved_at TEXT,
        approved_by TEXT,
        last_seen_at TEXT
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS collaborators_email_unique ON collaborators (email)",
      "CREATE INDEX IF NOT EXISTS collaborators_status_idx ON collaborators (status)",
      `CREATE TABLE IF NOT EXISTS inventory_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        started_by TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_by TEXT,
        closed_at TEXT
      )`,
      "CREATE INDEX IF NOT EXISTS inventory_sessions_status_idx ON inventory_sessions (status)",
      `CREATE TABLE IF NOT EXISTS inventory_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
        copy_id INTEGER NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
        result TEXT NOT NULL DEFAULT 'present',
        note TEXT NOT NULL DEFAULT '',
        checked_by TEXT NOT NULL,
        checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS inventory_checks_session_copy_unique ON inventory_checks (session_id, copy_id)",
      "CREATE INDEX IF NOT EXISTS inventory_checks_session_idx ON inventory_checks (session_id)",
      `INSERT INTO collaborators
        (email, name, position, role, status, approved_at, approved_by, last_seen_at)
       VALUES
        ('boltzmann.euler.maxwell@gmail.com', 'Euler Boltzmann', 'Administrador', 'admin', 'approved', CURRENT_TIMESTAMP, 'sistema', CURRENT_TIMESTAMP)
       ON CONFLICT(email) DO UPDATE SET role = 'admin', status = 'approved'`,
    ];
    schemaReady = db.batch(statements.map((statement) => db.prepare(statement)));
  }
  await schemaReady;
}

export async function getDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function getD1() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error("La base de datos central no está disponible.");
  }
  await ensureSchema(env.DB);
  return env.DB;
}
