import {
  accessErrorResponse,
  requireApprovedCollaborator,
} from "../../authz";

type Payload = Record<string, unknown>;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function labelTypeValue(value: unknown) {
  return value === "barcode" ? "barcode" : "qr";
}

function copyCode() {
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `BIB-${token}`;
}

function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error inesperado";
  if (
    message.includes("UNIQUE constraint failed: readers.document") ||
    message.includes("readers_document")
  ) {
    return "Ya existe un lector con ese documento.";
  }
  if (message.includes("loans_one_active_per_copy")) {
    return "El ejemplar ya fue prestado desde otra computadora.";
  }
  if (message.includes("no such table")) {
    return "La base central todavía se está preparando. Inténtalo nuevamente en un momento.";
  }
  return message;
}

export async function GET(request: Request) {
  try {
    const { db, collaborator } = await requireApprovedCollaborator(request);
    const today = new Date().toISOString().slice(0, 10);
    const [stats, copies, readers, loans, activity, inventorySession, inventoryRows, inventoryHistory] = await db.batch([
      db.prepare(`
        SELECT
          (SELECT COUNT(DISTINCT book_id) FROM copies WHERE archived_at IS NULL) AS total_books,
          COUNT(*) AS total_copies,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
          SUM(CASE WHEN status = 'loaned' THEN 1 ELSE 0 END) AS loaned,
          (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL AND due_at < ?) AS overdue,
          (SELECT COUNT(*) FROM readers WHERE active = 1) AS active_readers
        FROM copies
        WHERE archived_at IS NULL
      `).bind(today),
      db.prepare(`
        SELECT
          c.id, c.code, c.status, c.condition, c.label_type, c.created_at,
          b.id AS book_id, b.isbn, b.title, b.author, b.publisher,
          b.publish_year, b.category, b.shelf, b.cover_url,
          l.id AS active_loan_id, l.due_at,
          r.id AS reader_id, r.name AS reader_name
        FROM copies c
        JOIN books b ON b.id = c.book_id
        LEFT JOIN loans l ON l.copy_id = c.id AND l.returned_at IS NULL
        LEFT JOIN readers r ON r.id = l.reader_id
        WHERE c.archived_at IS NULL
        ORDER BY b.title COLLATE NOCASE, c.code
      `),
      db.prepare(`
        SELECT r.*,
          COUNT(l.id) AS loan_count,
          SUM(CASE WHEN l.id IS NOT NULL AND l.returned_at IS NULL THEN 1 ELSE 0 END) AS active_loans
        FROM readers r
        LEFT JOIN loans l ON l.reader_id = r.id
        GROUP BY r.id
        ORDER BY r.name COLLATE NOCASE
      `),
      db.prepare(`
        SELECT
          l.id, l.borrowed_at, l.due_at, l.returned_at, l.notes, l.created_by,
          c.id AS copy_id, c.code,
          b.title, b.author,
          r.id AS reader_id, r.name AS reader_name, r.document AS reader_document
        FROM loans l
        JOIN copies c ON c.id = l.copy_id
        JOIN books b ON b.id = c.book_id
        JOIN readers r ON r.id = l.reader_id
        ORDER BY CASE WHEN l.returned_at IS NULL THEN 0 ELSE 1 END,
          l.due_at ASC, l.id DESC
        LIMIT 200
      `),
      db.prepare(`
        SELECT id, actor, action, entity_type, entity_id, detail, created_at
        FROM audit_log
        ORDER BY id DESC
        LIMIT 20
      `),
      db.prepare(`
        SELECT id, name, status, started_by, started_at, closed_by, closed_at,
          (SELECT COUNT(*) FROM inventory_checks ic JOIN copies c ON c.id = ic.copy_id WHERE ic.session_id = inventory_sessions.id AND c.archived_at IS NULL) AS checked,
          (SELECT COUNT(*) FROM inventory_checks ic JOIN copies c ON c.id = ic.copy_id WHERE ic.session_id = inventory_sessions.id AND ic.result = 'present' AND c.archived_at IS NULL) AS present,
          (SELECT COUNT(*) FROM inventory_checks ic JOIN copies c ON c.id = ic.copy_id WHERE ic.session_id = inventory_sessions.id AND ic.result = 'missing' AND c.archived_at IS NULL) AS missing,
          (SELECT COUNT(*) FROM inventory_checks ic JOIN copies c ON c.id = ic.copy_id WHERE ic.session_id = inventory_sessions.id AND ic.result = 'damaged' AND c.archived_at IS NULL) AS damaged
        FROM inventory_sessions
        WHERE status = 'open'
        ORDER BY id DESC
        LIMIT 1
      `),
      db.prepare(`
        SELECT c.id, c.code, c.status, c.condition, b.title, b.author, b.shelf,
          ic.result AS inventory_result, ic.note AS inventory_note,
          ic.checked_by, ic.checked_at
        FROM copies c
        JOIN books b ON b.id = c.book_id
        LEFT JOIN inventory_checks ic
          ON ic.copy_id = c.id
          AND ic.session_id = (
            SELECT id FROM inventory_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1
          )
        WHERE c.archived_at IS NULL
        ORDER BY CASE WHEN ic.id IS NULL THEN 0 ELSE 1 END, b.title COLLATE NOCASE, c.code
      `),
      db.prepare(`
        SELECT id, name, status, started_by, started_at, closed_by, closed_at,
          (SELECT COUNT(*) FROM inventory_checks ic JOIN copies c ON c.id = ic.copy_id WHERE ic.session_id = inventory_sessions.id AND c.archived_at IS NULL) AS checked,
          (SELECT COUNT(*) FROM inventory_checks ic JOIN copies c ON c.id = ic.copy_id WHERE ic.session_id = inventory_sessions.id AND ic.result = 'missing' AND c.archived_at IS NULL) AS missing,
          (SELECT COUNT(*) FROM inventory_checks ic JOIN copies c ON c.id = ic.copy_id WHERE ic.session_id = inventory_sessions.id AND ic.result = 'damaged' AND c.archived_at IS NULL) AS damaged
        FROM inventory_sessions
        ORDER BY id DESC
        LIMIT 12
      `),
    ]);

    return Response.json({
      stats: stats.results[0] ?? {},
      copies: copies.results,
      readers: readers.results,
      loans: loans.results,
      activity: activity.results,
      inventory: {
        session: inventorySession.results[0] ?? null,
        rows: inventoryRows.results,
        history: inventoryHistory.results,
      },
      currentCollaborator: collaborator,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Payload;
    const action = textValue(payload.action);
    const { db, actor } = await requireApprovedCollaborator(request);

    if (action === "create_book") {
      const isbn = textValue(payload.isbn) || null;
      const title = textValue(payload.title);
      const author = textValue(payload.author) || "Autor no registrado";
      const labelType = labelTypeValue(payload.labelType);
      if (!title) {
        return Response.json({ error: "El título es obligatorio." }, { status: 400 });
      }

      let bookId = 0;
      if (isbn) {
        const existing = await db
          .prepare("SELECT id FROM books WHERE isbn = ?")
          .bind(isbn)
          .first<{ id: number }>();
        bookId = existing?.id ?? 0;
      }

      if (!bookId) {
        const book = await db
          .prepare(`
            INSERT INTO books
              (isbn, title, author, publisher, publish_year, category, shelf, cover_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `)
          .bind(
            isbn,
            title,
            author,
            textValue(payload.publisher),
            textValue(payload.publishYear),
            textValue(payload.category) || "General",
            textValue(payload.shelf) || "Sin asignar",
            textValue(payload.coverUrl),
          )
          .first<{ id: number }>();
        bookId = book?.id ?? 0;
      }

      if (!bookId) throw new Error("No se pudo crear el libro.");
      const code = copyCode();
      const copy = await db
        .prepare(`
          INSERT INTO copies (book_id, code, condition, label_type)
          VALUES (?, ?, ?, ?)
          RETURNING id, code, label_type
        `)
        .bind(bookId, code, textValue(payload.condition) || "Bueno", labelType)
        .first<{ id: number; code: string; label_type: string }>();

      await db
        .prepare(`
          INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
          VALUES (?, 'create', 'copy', ?, ?)
        `)
        .bind(actor, String(copy?.id ?? ""), `${title} · ${code}`)
        .run();

      return Response.json({ ok: true, copy }, { status: 201 });
    }

    if (action === "add_copy") {
      const bookId = numberValue(payload.bookId);
      if (!bookId) {
        return Response.json({ error: "Libro inválido." }, { status: 400 });
      }
      const code = copyCode();
      const labelType = labelTypeValue(payload.labelType);
      const copy = await db
        .prepare(`
          INSERT INTO copies (book_id, code, condition, label_type)
          VALUES (?, ?, ?, ?)
          RETURNING id, code, label_type
        `)
        .bind(bookId, code, textValue(payload.condition) || "Bueno", labelType)
        .first<{ id: number; code: string; label_type: string }>();
      await db
        .prepare(`
          INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
          VALUES (?, 'create', 'copy', ?, ?)
        `)
        .bind(actor, String(copy?.id ?? ""), `Nuevo ejemplar ${code}`)
        .run();
      return Response.json({ ok: true, copy }, { status: 201 });
    }

    if (action === "create_reader") {
      const document = textValue(payload.document);
      const name = textValue(payload.name);
      if (!document || !name) {
        return Response.json(
          { error: "El nombre y el documento son obligatorios." },
          { status: 400 },
        );
      }
      const reader = await db
        .prepare(`
          INSERT INTO readers (document, name, email, phone, address)
          VALUES (?, ?, ?, ?, ?)
          RETURNING id, document, name
        `)
        .bind(
          document,
          name,
          textValue(payload.email),
          textValue(payload.phone),
          textValue(payload.address),
        )
        .first();
      await db
        .prepare(`
          INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
          VALUES (?, 'create', 'reader', ?, ?)
        `)
        .bind(actor, String((reader as { id?: number } | null)?.id ?? ""), name)
        .run();
      return Response.json({ ok: true, reader }, { status: 201 });
    }

    if (action === "checkout") {
      const copyId = numberValue(payload.copyId);
      const readerId = numberValue(payload.readerId);
      const dueAt = textValue(payload.dueAt);
      if (!copyId || !readerId || !/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) {
        return Response.json({ error: "Datos de préstamo incompletos." }, { status: 400 });
      }
      const activeReader = await db
        .prepare("SELECT id FROM readers WHERE id = ? AND active = 1")
        .bind(readerId)
        .first();
      if (!activeReader) {
        return Response.json({ error: "El lector no está activo." }, { status: 409 });
      }

      await db.batch([
        db
          .prepare(`
            INSERT INTO loans (copy_id, reader_id, due_at, notes, created_by)
            SELECT ?, ?, ?, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM copies
              WHERE id = ? AND status = 'available' AND archived_at IS NULL
            )
          `)
          .bind(copyId, readerId, dueAt, textValue(payload.notes), actor, copyId),
        db
          .prepare("UPDATE copies SET status = 'loaned' WHERE id = ? AND status = 'available' AND archived_at IS NULL")
          .bind(copyId),
        db
          .prepare(`
            INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
            VALUES (?, 'checkout', 'copy', ?, ?)
          `)
          .bind(actor, String(copyId), `Préstamo hasta ${dueAt}`),
      ]);

      const loan = await db
        .prepare("SELECT id FROM loans WHERE copy_id = ? AND returned_at IS NULL")
        .bind(copyId)
        .first();
      if (!loan) {
        return Response.json(
          { error: "El ejemplar ya no está disponible." },
          { status: 409 },
        );
      }
      return Response.json({ ok: true, loan }, { status: 201 });
    }

    if (action === "return") {
      const loanId = numberValue(payload.loanId);
      const activeLoan = await db
        .prepare("SELECT copy_id FROM loans WHERE id = ? AND returned_at IS NULL")
        .bind(loanId)
        .first<{ copy_id: number }>();
      if (!activeLoan) {
        return Response.json({ error: "El préstamo ya fue cerrado." }, { status: 409 });
      }
      await db.batch([
        db
          .prepare("UPDATE loans SET returned_at = CURRENT_TIMESTAMP WHERE id = ? AND returned_at IS NULL")
          .bind(loanId),
        db
          .prepare("UPDATE copies SET status = 'available', condition = ? WHERE id = ?")
          .bind(textValue(payload.condition) || "Bueno", activeLoan.copy_id),
        db
          .prepare(`
            INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
            VALUES (?, 'return', 'loan', ?, 'Devolución registrada')
          `)
          .bind(actor, String(loanId)),
      ]);
      return Response.json({ ok: true });
    }

    if (action === "archive_copy") {
      const copyId = numberValue(payload.copyId);
      if (!copyId) {
        return Response.json({ error: "Ejemplar inválido." }, { status: 400 });
      }

      const copy = await db
        .prepare(`
          SELECT c.id, c.code, c.status, b.title,
            EXISTS (
              SELECT 1 FROM loans l
              WHERE l.copy_id = c.id AND l.returned_at IS NULL
            ) AS active_loan
          FROM copies c
          JOIN books b ON b.id = c.book_id
          WHERE c.id = ? AND c.archived_at IS NULL
        `)
        .bind(copyId)
        .first<{ id: number; code: string; status: string; title: string; active_loan: number }>();

      if (!copy) {
        return Response.json({ error: "El ejemplar ya fue eliminado o no existe." }, { status: 404 });
      }
      if (copy.active_loan || copy.status === "loaned") {
        return Response.json(
          { error: "No puedes eliminar un ejemplar con un préstamo activo. Registra primero su devolución." },
          { status: 409 },
        );
      }

      const archived = await db
        .prepare(`
          UPDATE copies
          SET archived_at = CURRENT_TIMESTAMP, archived_by = ?
          WHERE id = ?
            AND archived_at IS NULL
            AND status <> 'loaned'
            AND NOT EXISTS (
              SELECT 1 FROM loans l
              WHERE l.copy_id = copies.id AND l.returned_at IS NULL
            )
          RETURNING id
        `)
        .bind(actor, copyId)
        .first<{ id: number }>();

      if (!archived) {
        return Response.json(
          { error: "El ejemplar cambió de estado y no pudo eliminarse. Actualiza la página e inténtalo nuevamente." },
          { status: 409 },
        );
      }

      await db
        .prepare(`
          INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
          VALUES (?, 'archive', 'copy', ?, ?)
        `)
        .bind(actor, String(copyId), `Ejemplar eliminado: ${copy.title} · ${copy.code}`)
        .run();

      return Response.json({ ok: true });
    }

    if (action === "start_inventory") {
      const existing = await db
        .prepare("SELECT id FROM inventory_sessions WHERE status = 'open' LIMIT 1")
        .first();
      if (existing) {
        return Response.json(
          { error: "Ya existe un inventario abierto. Ciérralo antes de iniciar otro." },
          { status: 409 },
        );
      }
      const name = textValue(payload.name) || `Inventario ${new Date().toISOString().slice(0, 10)}`;
      const session = await db
        .prepare(`
          INSERT INTO inventory_sessions (name, started_by)
          VALUES (?, ?)
          RETURNING id, name
        `)
        .bind(name, actor)
        .first<{ id: number; name: string }>();
      await db
        .prepare(`
          INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
          VALUES (?, 'inventory_start', 'inventory', ?, ?)
        `)
        .bind(actor, String(session?.id ?? ""), name)
        .run();
      return Response.json({ ok: true, session }, { status: 201 });
    }

    if (action === "inventory_check") {
      const copyId = numberValue(payload.copyId);
      const result = textValue(payload.result);
      if (!copyId || !["present", "missing", "damaged"].includes(result)) {
        return Response.json({ error: "Verificación de inventario inválida." }, { status: 400 });
      }
      const session = await db
        .prepare("SELECT id FROM inventory_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1")
        .first<{ id: number }>();
      if (!session) {
        return Response.json({ error: "Primero debes iniciar un inventario." }, { status: 409 });
      }
      const copy = await db
        .prepare("SELECT code FROM copies WHERE id = ? AND archived_at IS NULL")
        .bind(copyId)
        .first<{ code: string }>();
      if (!copy) {
        return Response.json({ error: "No encontramos ese ejemplar." }, { status: 404 });
      }
      await db
        .prepare(`
          INSERT INTO inventory_checks
            (session_id, copy_id, result, note, checked_by, checked_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(session_id, copy_id) DO UPDATE SET
            result = excluded.result,
            note = excluded.note,
            checked_by = excluded.checked_by,
            checked_at = CURRENT_TIMESTAMP
        `)
        .bind(session.id, copyId, result, textValue(payload.note), actor)
        .run();
      await db
        .prepare(`
          INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
          VALUES (?, 'inventory_check', 'copy', ?, ?)
        `)
        .bind(actor, String(copyId), `${copy.code}: ${result}`)
        .run();
      return Response.json({ ok: true });
    }

    if (action === "close_inventory") {
      const session = await db
        .prepare("SELECT id, name FROM inventory_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1")
        .first<{ id: number; name: string }>();
      if (!session) {
        return Response.json({ error: "No hay un inventario abierto." }, { status: 409 });
      }
      await db.batch([
        db
          .prepare(`
            UPDATE inventory_sessions
            SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'open'
          `)
          .bind(actor, session.id),
        db
          .prepare(`
            INSERT INTO audit_log (actor, action, entity_type, entity_id, detail)
            VALUES (?, 'inventory_close', 'inventory', ?, ?)
          `)
          .bind(actor, String(session.id), session.name),
      ]);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return Response.json({ error: apiError(error) }, { status: 500 });
  }
}
