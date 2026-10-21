import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import postgres from "postgres";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backupPath = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("Configura DATABASE_URL antes de importar.");
if (!backupPath) {
  throw new Error("Uso: npm run db:import -- /ruta/al/respaldo.json");
}

const schema = await readFile(resolve(projectRoot, "database/schema.sql"), "utf8");
const backup = JSON.parse(await readFile(resolve(backupPath), "utf8"));
const sql = postgres(databaseUrl, { max: 1, prepare: false });

function rows(name) {
  return Array.isArray(backup[name]) ? backup[name] : [];
}

async function insert(transaction, query, values) {
  await transaction.unsafe(query, values);
}

try {
  await sql.unsafe(schema);
  await sql.begin(async (transaction) => {
    for (const row of rows("books")) {
      await insert(transaction, `
        INSERT INTO books
          (id, isbn, title, author, publisher, publish_year, category, shelf,
           cover_url, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO UPDATE SET
          isbn=excluded.isbn, title=excluded.title, author=excluded.author,
          publisher=excluded.publisher, publish_year=excluded.publish_year,
          category=excluded.category, shelf=excluded.shelf,
          cover_url=excluded.cover_url, updated_at=excluded.updated_at
      `, [row.id, row.isbn, row.title, row.author, row.publisher, row.publish_year,
        row.category, row.shelf, row.cover_url, row.created_at, row.updated_at]);
    }

    for (const row of rows("copies")) {
      await insert(transaction, `
        INSERT INTO copies
          (id, book_id, code, status, condition, label_type, archived_at,
           archived_by, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO UPDATE SET
          book_id=excluded.book_id, code=excluded.code, status=excluded.status,
          condition=excluded.condition, label_type=excluded.label_type,
          archived_at=excluded.archived_at, archived_by=excluded.archived_by
      `, [row.id, row.book_id, row.code, row.status, row.condition,
        row.label_type ?? "qr", row.archived_at ?? null, row.archived_by ?? null,
        row.created_at]);
    }

    for (const row of rows("readers")) {
      await insert(transaction, `
        INSERT INTO readers
          (id, document, name, email, phone, address, active, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET
          document=excluded.document, name=excluded.name, email=excluded.email,
          phone=excluded.phone, address=excluded.address, active=excluded.active
      `, [row.id, row.document, row.name, row.email, row.phone, row.address,
        row.active, row.created_at]);
    }

    for (const row of rows("loans")) {
      await insert(transaction, `
        INSERT INTO loans
          (id, copy_id, reader_id, borrowed_at, due_at, returned_at, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET
          copy_id=excluded.copy_id, reader_id=excluded.reader_id,
          borrowed_at=excluded.borrowed_at, due_at=excluded.due_at,
          returned_at=excluded.returned_at, notes=excluded.notes,
          created_by=excluded.created_by
      `, [row.id, row.copy_id, row.reader_id, row.borrowed_at, row.due_at,
        row.returned_at, row.notes, row.created_by]);
    }

    for (const row of rows("audit")) {
      await insert(transaction, `
        INSERT INTO audit_log
          (id, actor, action, entity_type, entity_id, detail, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING
      `, [row.id, row.actor, row.action, row.entity_type, row.entity_id,
        row.detail, row.created_at]);
    }

    for (const row of rows("collaborators")) {
      await insert(transaction, `
        INSERT INTO collaborators
          (id, email, name, position, role, status, requested_at, approved_at,
           approved_by, last_seen_at)
        VALUES ($1,$2,$3,$4,$5,'pending',$6,NULL,NULL,$7)
        ON CONFLICT (email) DO UPDATE SET
          name=excluded.name, position=excluded.position,
          requested_at=excluded.requested_at, last_seen_at=excluded.last_seen_at
      `, [row.id, row.email, row.name, row.position, row.role,
        row.requested_at, row.last_seen_at]);
    }

    for (const row of rows("inventorySessions")) {
      await insert(transaction, `
        INSERT INTO inventory_sessions
          (id, name, status, started_by, started_at, closed_by, closed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET
          name=excluded.name, status=excluded.status,
          started_by=excluded.started_by, started_at=excluded.started_at,
          closed_by=excluded.closed_by, closed_at=excluded.closed_at
      `, [row.id, row.name, row.status, row.started_by, row.started_at,
        row.closed_by, row.closed_at]);
    }

    for (const row of rows("inventoryChecks")) {
      await insert(transaction, `
        INSERT INTO inventory_checks
          (id, session_id, copy_id, result, note, checked_by, checked_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET
          session_id=excluded.session_id, copy_id=excluded.copy_id,
          result=excluded.result, note=excluded.note,
          checked_by=excluded.checked_by, checked_at=excluded.checked_at
      `, [row.id, row.session_id, row.copy_id, row.result, row.note,
        row.checked_by, row.checked_at]);
    }

    for (const table of ["books", "copies", "readers", "loans", "audit_log",
      "collaborators", "inventory_sessions", "inventory_checks"]) {
      await transaction.unsafe(`
        SELECT setval(
          pg_get_serial_sequence('${table}', 'id'),
          COALESCE(MAX(id), 1),
          MAX(id) IS NOT NULL
        ) FROM ${table}
      `);
    }
  });

  process.stdout.write("Respaldo importado correctamente a PostgreSQL.\n");
} finally {
  await sql.end();
}
