import postgres from "postgres";

type DatabaseRow = Record<string, unknown>;
type QueryResult<T extends DatabaseRow = DatabaseRow> = T[] & {
  count?: number;
};
type QueryExecutor = {
  unsafe: (
    query: string,
    parameters?: readonly unknown[],
  ) => Promise<QueryResult>;
};

let client: ReturnType<typeof postgres> | null = null;
let schemaReady: Promise<void> | null = null;

function databaseClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL no está configurada. Añádela en Vercel o en .env.local.",
    );
  }

  if (!client) {
    client = postgres(url, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }
  return client;
}

function normalizeQuery(source: string) {
  let placeholder = 0;
  return source
    .replace(/\s+COLLATE\s+NOCASE/gi, "")
    .replace(/\?/g, () => `$${++placeholder}`);
}

class PreparedStatement {
  private readonly parameters: readonly unknown[];

  constructor(
    private readonly source: string,
    parameters: readonly unknown[] = [],
  ) {
    this.parameters = parameters;
  }

  bind(...parameters: unknown[]) {
    return new PreparedStatement(this.source, parameters);
  }

  async execute(executor: QueryExecutor) {
    return executor.unsafe(normalizeQuery(this.source), this.parameters);
  }

  async all<T extends DatabaseRow = DatabaseRow>() {
    const results = (await this.execute(
      databaseClient() as unknown as QueryExecutor,
    )) as T[];
    return { results };
  }

  async first<T extends DatabaseRow = DatabaseRow>(): Promise<T | null> {
    const rows = (await this.execute(
      databaseClient() as unknown as QueryExecutor,
    )) as T[];
    return rows[0] ?? null;
  }

  async run() {
    const rows = await this.execute(
      databaseClient() as unknown as QueryExecutor,
    );
    return { meta: { changes: rows.count ?? rows.length } };
  }
}

class Database {
  prepare(query: string) {
    return new PreparedStatement(query);
  }

  async batch(statements: PreparedStatement[]) {
    const sql = databaseClient();
    return sql.begin(async (transaction) => {
      const executor = transaction as unknown as QueryExecutor;
      const results = [];
      for (const statement of statements) {
        const rows = await statement.execute(executor);
        results.push({ results: rows, meta: { changes: rows.count ?? rows.length } });
      }
      return results;
    });
  }
}

const db = new Database();

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    isbn TEXT,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'Autor no registrado',
    publisher TEXT NOT NULL DEFAULT '',
    publish_year TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'General',
    shelf TEXT NOT NULL DEFAULT 'Sin asignar',
    cover_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS books_isbn_unique ON books (isbn)",
  `CREATE TABLE IF NOT EXISTS copies (
    id SERIAL PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'available',
    condition TEXT NOT NULL DEFAULT 'Bueno',
    label_type TEXT NOT NULL DEFAULT 'qr',
    archived_at TIMESTAMPTZ,
    archived_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS copies_book_id_idx ON copies (book_id)",
  `CREATE TABLE IF NOT EXISTS readers (
    id SERIAL PRIMARY KEY,
    document TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS readers_name_idx ON readers (name)",
  `CREATE TABLE IF NOT EXISTS loans (
    id SERIAL PRIMARY KEY,
    copy_id INTEGER NOT NULL REFERENCES copies(id),
    reader_id INTEGER NOT NULL REFERENCES readers(id),
    borrowed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    due_at TEXT NOT NULL,
    returned_at TIMESTAMPTZ,
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT 'sistema'
  )`,
  "CREATE INDEX IF NOT EXISTS loans_reader_id_idx ON loans (reader_id)",
  "CREATE INDEX IF NOT EXISTS loans_due_at_idx ON loans (due_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS loans_one_active_per_copy ON loans (copy_id) WHERE returned_at IS NULL",
  `CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS audit_created_at_idx ON audit_log (created_at)",
  `CREATE TABLE IF NOT EXISTS collaborators (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    position TEXT NOT NULL DEFAULT 'Colaborador',
    role TEXT NOT NULL DEFAULT 'staff',
    status TEXT NOT NULL DEFAULT 'pending',
    password_hash TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'password',
    google_sub TEXT,
    avatar_url TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    last_seen_at TIMESTAMPTZ
  )`,
  "ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS password_hash TEXT",
  "ALTER TABLE collaborators ALTER COLUMN position SET DEFAULT 'Colaborador'",
  "ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password'",
  "ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS google_sub TEXT",
  "ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS avatar_url TEXT",
  "CREATE UNIQUE INDEX IF NOT EXISTS collaborators_email_unique ON collaborators (email)",
  "CREATE UNIQUE INDEX IF NOT EXISTS collaborators_google_sub_unique ON collaborators (google_sub) WHERE google_sub IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS collaborators_status_idx ON collaborators (status)",
  `CREATE TABLE IF NOT EXISTS inventory_sessions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    started_by TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_by TEXT,
    closed_at TIMESTAMPTZ
  )`,
  "CREATE INDEX IF NOT EXISTS inventory_sessions_status_idx ON inventory_sessions (status)",
  `CREATE TABLE IF NOT EXISTS inventory_checks (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    copy_id INTEGER NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
    result TEXT NOT NULL DEFAULT 'present',
    note TEXT NOT NULL DEFAULT '',
    checked_by TEXT NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS inventory_checks_session_copy_unique ON inventory_checks (session_id, copy_id)",
  "CREATE INDEX IF NOT EXISTS inventory_checks_session_idx ON inventory_checks (session_id)",
];

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = db
      .batch(schemaStatements.map((statement) => db.prepare(statement)))
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  await schemaReady;
}

export async function getDb() {
  await ensureSchema();
  return db;
}
