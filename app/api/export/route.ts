import {
  accessErrorResponse,
  requireApprovedCollaborator,
} from "../../authz";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
  ].join("\n");
}

export async function GET(request: Request) {
  try {
    const { db } = await requireApprovedCollaborator(request);
    const type = new URL(request.url).searchParams.get("type") ?? "books";
    const queries: Record<string, string> = {
    books: `
      SELECT b.isbn, b.title AS titulo, b.author AS autor, b.publisher AS editorial,
        b.publish_year AS publicacion, b.category AS categoria, b.shelf AS ubicacion,
        c.code AS codigo_ejemplar, c.status AS estado, c.condition AS condicion,
        c.label_type AS tipo_etiqueta
      FROM books b JOIN copies c ON c.book_id = b.id
      WHERE c.archived_at IS NULL
      ORDER BY b.title, c.code
    `,
    readers: `
      SELECT document AS documento, name AS nombre, email, phone AS telefono,
        address AS direccion, active AS activo, created_at AS registrado
      FROM readers ORDER BY name
    `,
    loans: `
      SELECT c.code AS ejemplar, b.title AS libro, r.document AS documento_lector,
        r.name AS lector, l.borrowed_at AS prestado, l.due_at AS fecha_limite,
        l.returned_at AS devuelto, l.created_by AS registrado_por
      FROM loans l
      JOIN copies c ON c.id = l.copy_id
      JOIN books b ON b.id = c.book_id
      JOIN readers r ON r.id = l.reader_id
      ORDER BY l.id DESC
    `,
    };

    if (type === "backup") {
      const [books, copies, readers, loans, audit, collaborators, inventorySessions, inventoryChecks] = await db.batch([
      db.prepare("SELECT * FROM books ORDER BY id"),
      db.prepare("SELECT * FROM copies ORDER BY id"),
      db.prepare("SELECT * FROM readers ORDER BY id"),
      db.prepare("SELECT * FROM loans ORDER BY id"),
      db.prepare("SELECT * FROM audit_log ORDER BY id"),
        db.prepare("SELECT id, email, name, position, role, status, requested_at, approved_at, approved_by, last_seen_at FROM collaborators ORDER BY id"),
        db.prepare("SELECT * FROM inventory_sessions ORDER BY id"),
        db.prepare("SELECT * FROM inventory_checks ORDER BY id"),
      ]);
      return new Response(JSON.stringify({
        version: 2,
        exportedAt: new Date().toISOString(),
        books: books.results,
        copies: copies.results,
        readers: readers.results,
        loans: loans.results,
        audit: audit.results,
        collaborators: collaborators.results,
        inventorySessions: inventorySessions.results,
        inventoryChecks: inventoryChecks.results,
      }, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="biblioteca-216-respaldo-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }

    const query = queries[type];
    if (!query) return Response.json({ error: "Exportación inválida." }, { status: 400 });
    const result = await db.prepare(query).all<Record<string, unknown>>();
    return new Response(`\uFEFF${toCsv(result.results)}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="biblioteca-216-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return Response.json({ error: "No se pudo generar la exportación." }, { status: 500 });
  }
}
