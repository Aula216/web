import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const books = sqliteTable(
  "books",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    isbn: text("isbn"),
    title: text("title").notNull(),
    author: text("author").notNull().default("Autor no registrado"),
    publisher: text("publisher").notNull().default(""),
    publishYear: text("publish_year").notNull().default(""),
    category: text("category").notNull().default("General"),
    shelf: text("shelf").notNull().default("Sin asignar"),
    coverUrl: text("cover_url").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("books_isbn_unique").on(table.isbn)],
);

export const copies = sqliteTable(
  "copies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    status: text("status", {
      enum: ["available", "loaned", "maintenance", "lost"],
    })
      .notNull()
      .default("available"),
    condition: text("condition").notNull().default("Bueno"),
    labelType: text("label_type", { enum: ["qr", "barcode"] })
      .notNull()
      .default("qr"),
    archivedAt: text("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("copies_book_id_idx").on(table.bookId)],
);

export const readers = sqliteTable(
  "readers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    document: text("document").notNull().unique(),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    address: text("address").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("readers_name_idx").on(table.name)],
);

export const loans = sqliteTable(
  "loans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    copyId: integer("copy_id")
      .notNull()
      .references(() => copies.id),
    readerId: integer("reader_id")
      .notNull()
      .references(() => readers.id),
    borrowedAt: text("borrowed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    dueAt: text("due_at").notNull(),
    returnedAt: text("returned_at"),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull().default("sistema"),
  },
  (table) => [
    index("loans_reader_id_idx").on(table.readerId),
    index("loans_due_at_idx").on(table.dueAt),
    uniqueIndex("loans_one_active_per_copy")
      .on(table.copyId)
      .where(sql`${table.returnedAt} IS NULL`),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("audit_created_at_idx").on(table.createdAt)],
);

export const collaborators = sqliteTable(
  "collaborators",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    position: text("position").notNull().default("Encargado de biblioteca"),
    role: text("role", { enum: ["admin", "staff"] })
      .notNull()
      .default("staff"),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    approvedAt: text("approved_at"),
    approvedBy: text("approved_by"),
    lastSeenAt: text("last_seen_at"),
  },
  (table) => [
    uniqueIndex("collaborators_email_unique").on(table.email),
    index("collaborators_status_idx").on(table.status),
  ],
);

export const inventorySessions = sqliteTable(
  "inventory_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    startedBy: text("started_by").notNull(),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    closedBy: text("closed_by"),
    closedAt: text("closed_at"),
  },
  (table) => [index("inventory_sessions_status_idx").on(table.status)],
);

export const inventoryChecks = sqliteTable(
  "inventory_checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => inventorySessions.id, { onDelete: "cascade" }),
    copyId: integer("copy_id")
      .notNull()
      .references(() => copies.id, { onDelete: "cascade" }),
    result: text("result", { enum: ["present", "missing", "damaged"] })
      .notNull()
      .default("present"),
    note: text("note").notNull().default(""),
    checkedBy: text("checked_by").notNull(),
    checkedAt: text("checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("inventory_checks_session_copy_unique").on(
      table.sessionId,
      table.copyId,
    ),
    index("inventory_checks_session_idx").on(table.sessionId),
  ],
);
