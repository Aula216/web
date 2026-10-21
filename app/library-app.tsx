"use client";

import {
  AlertTriangle, Barcode, BookCopy, BookOpen, Camera, Check, CheckCircle2,
  ChevronRight, ClipboardList, Clock3, Download, FileJson, Library,
  LoaderCircle, LockKeyhole, LogIn, LogOut, Plus, Printer, RefreshCw,
  QrCode, RotateCcw, ScanLine, Search, Settings, ShieldCheck, UserCheck,
  Trash2, UserPlus, Users, UserX, Wrench, X, XCircle,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CurrentUser = { name: string; email: string };
type Collaborator = {
  id: number; email: string; name: string; position: string;
  role: "admin" | "staff"; status: "pending" | "approved" | "rejected";
  auth_provider: "password" | "google" | "password+google";
  requested_at: string; approved_at: string | null; approved_by: string | null;
  last_seen_at: string | null;
};
type AccessData = {
  authenticated: boolean; identity: CurrentUser; collaborator: Collaborator | null;
  collaborators: Collaborator[];
  ownerEmail: string | null;
};
type Copy = {
  id: number; code: string; status: "available" | "loaned" | "maintenance" | "lost";
  condition: string; label_type: LabelFormat; book_id: number; isbn: string | null; title: string;
  author: string; publisher: string; publish_year: string; category: string;
  shelf: string; cover_url: string; active_loan_id: number | null;
  due_at: string | null; reader_id: number | null; reader_name: string | null;
};
type Reader = {
  id: number; document: string; name: string; email: string; phone: string;
  active: number; loan_count: number; active_loans: number;
};
type Loan = {
  id: number; borrowed_at: string; due_at: string; returned_at: string | null;
  copy_id: number; code: string; title: string; author: string; reader_id: number;
  reader_name: string; reader_document: string;
};
type InventorySession = {
  id: number; name: string; status: "open" | "closed"; started_by: string;
  started_at: string; closed_by: string | null; closed_at: string | null;
  checked: number; present?: number; missing: number; damaged: number;
};
type InventoryRow = {
  id: number; code: string; status: Copy["status"]; condition: string;
  title: string; author: string; shelf: string;
  inventory_result: "present" | "missing" | "damaged" | null;
  inventory_note: string | null; checked_by: string | null; checked_at: string | null;
};
type LibraryData = {
  stats: { total_books?: number; total_copies?: number; available?: number; loaned?: number; overdue?: number; active_readers?: number };
  copies: Copy[]; readers: Reader[]; loans: Loan[];
  activity: Array<{ id: number; actor: string; action: string; detail: string; created_at: string }>;
  inventory: { session: InventorySession | null; rows: InventoryRow[]; history: InventorySession[] };
};
type Dialog = "book" | "reader" | "loan" | "return" | "scanner" | "label" | "export" | "inventory" | "delete" | null;
type View = "overview" | "catalog" | "loans" | "readers" | "inventory" | "team";
type ScanMode = "circulation" | "inventory";
type LabelFormat = "qr" | "barcode";

const emptyData: LibraryData = {
  stats: {}, copies: [], readers: [], loans: [], activity: [],
  inventory: { session: null, rows: [], history: [] },
};
const newBook = (isbn = "") => ({ isbn, title: "", author: "", publisher: "", publishYear: "", category: "General", shelf: "", coverUrl: "", condition: "Bueno", labelType: "qr" as LabelFormat });

function todayPlus(days: number) {
  const date = new Date(); date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
function shortDate(value: string | null) {
  if (!value) return "—";
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(safe));
}
function isOverdue(loan: Pick<Loan, "due_at" | "returned_at">) {
  return !loan.returned_at && loan.due_at < new Date().toISOString().slice(0, 10);
}
function initials(value: string) {
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "B2";
}
function actorName(actor: string) {
  return actor.replace(/\s*<[^>]+>$/, "");
}

async function fetchIsbnData(isbn: string) {
  const response = await fetch(`/api/isbn?isbn=${encodeURIComponent(isbn)}`);
  const payload = (await response.json()) as Record<string, string> & { error?: string };
  if (!response.ok) throw new Error(payload.error || "ISBN no encontrado.");
  return payload;
}

export default function LibraryApp({ currentUser }: { currentUser: CurrentUser | null }) {
  const [access, setAccess] = useState<AccessData | null>(null);
  const [accessLoading, setAccessLoading] = useState(Boolean(currentUser));
  const [accessError, setAccessError] = useState("");

  const loadAccess = useCallback(async () => {
    if (!currentUser) return;
    try {
      const response = await fetch("/api/access", { cache: "no-store" });
      const payload = (await response.json()) as AccessData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo comprobar tu acceso.");
      setAccess(payload); setAccessError("");
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "No se pudo comprobar tu acceso.");
    } finally { setAccessLoading(false); }
  }, [currentUser]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadAccess());
    return () => window.cancelAnimationFrame(frame);
  }, [loadAccess]);

  if (!currentUser) return <AccessScreen mode="signed-out" />;
  if (accessLoading) return <AccessScreen mode="loading" />;
  if (accessError && !access) return <AccessScreen mode="error" message={accessError} onRetry={() => { setAccessLoading(true); void loadAccess(); }} />;
  if (!access?.collaborator) return <RegistrationScreen user={currentUser} onRegistered={loadAccess} />;
  if (access.collaborator.status !== "approved") {
    return <AccessScreen mode={access.collaborator.status === "pending" ? "pending" : "rejected"} user={currentUser} onRetry={loadAccess} />;
  }

  return <ApprovedLibrary currentUser={access.collaborator} collaborators={access.collaborators} ownerEmail={access.ownerEmail} refreshAccess={loadAccess} />;
}

function AccessScreen({ mode, message, user, onRetry }: {
  mode: "signed-out" | "loading" | "pending" | "rejected" | "error";
  message?: string; user?: CurrentUser; onRetry?: () => void;
}) {
  const content = mode === "signed-out"
    ? { icon: <LockKeyhole />, title: "Acceso para colaboradores", detail: "Inicia sesión para solicitar o utilizar una cuenta del equipo." }
    : mode === "pending"
      ? { icon: <Clock3 />, title: "Solicitud pendiente", detail: "Tu registro quedó guardado. Un colaborador principal debe aprobarlo antes de que puedas ver la biblioteca." }
      : mode === "rejected"
        ? { icon: <UserX />, title: "Acceso no autorizado", detail: "Tu cuenta no está habilitada. Comunícate con un colaborador principal." }
        : mode === "error"
          ? { icon: <AlertTriangle />, title: "No pudimos comprobar el acceso", detail: message || "Inténtalo nuevamente." }
          : { icon: <LoaderCircle className="spin" />, title: "Comprobando acceso", detail: "Estamos verificando tu cuenta de colaborador." };
  return <main className="access-shell"><section className="access-card"><div className="access-brand"><span><Library /></span><div><strong>Biblioteca</strong><em>216</em></div></div><div className="access-icon">{content.icon}</div><h1>{content.title}</h1><p>{content.detail}</p>{user && <div className="identity-chip"><span className="avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>}<div className="access-actions">{mode === "signed-out" && <a className="button primary" href="/login"><LogIn />Iniciar sesión</a>}{(mode === "pending" || mode === "error") && onRetry && <button className="button secondary" onClick={onRetry}><RefreshCw />Comprobar nuevamente</button>}{mode !== "loading" && mode !== "signed-out" && <a className="button tertiary" href="/api/auth/logout"><LogOut />Cerrar sesión</a>}</div><small className="privacy-note"><ShieldCheck />El catálogo y los datos personales solo se muestran a colaboradores aprobados.</small></section></main>;
}

function RegistrationScreen({ user, onRegistered }: { user: CurrentUser; onRegistered: () => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "register" }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo registrar la solicitud.");
      await onRegistered();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo registrar la solicitud."); }
    finally { setSaving(false); }
  }
  return <main className="access-shell"><section className="access-card registration-card"><div className="access-brand"><span><Library /></span><div><strong>Biblioteca</strong><em>216</em></div></div><p className="eyebrow">Registro de colaborador</p><h1>Solicita acceso</h1><p>La cuenta quedará pendiente hasta que un colaborador principal confirme que eres parte del equipo.</p><div className="identity-chip"><span className="avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>{error && <div className="alert error-alert"><AlertTriangle />{error}</div>}<form onSubmit={register}><button className="button primary access-submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <UserPlus />}{saving ? "Registrando…" : "Enviar solicitud"}</button></form><a className="text-button centered" href="/api/auth/logout">Usar otra cuenta</a></section></main>;
}

function ApprovedLibrary({ currentUser, collaborators, ownerEmail, refreshAccess }: { currentUser: Collaborator; collaborators: Collaborator[]; ownerEmail: string | null; refreshAccess: () => Promise<void> }) {
  const [data, setData] = useState<LibraryData>(emptyData);
  const [view, setView] = useState<View>("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [scanMode, setScanMode] = useState<ScanMode>("circulation");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [toast, setToast] = useState("");
  const [search, setSearch] = useState(""); const [selectedCopy, setSelectedCopy] = useState<Copy | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [labelFormat, setLabelFormat] = useState<LabelFormat>("qr");
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [qrUrl, setQrUrl] = useState(""); const [manualScan, setManualScan] = useState("");
  const [bookForm, setBookForm] = useState(newBook());

  const loadData = useCallback(async () => {
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const payload = (await response.json()) as LibraryData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo cargar la biblioteca.");
      setData(payload); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cargar la biblioteca."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadData());
    return () => window.cancelAnimationFrame(frame);
  }, [loadData]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3500); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (dialog !== "label" || !selectedCopy) return;
    if (labelFormat === "qr") {
      const payload = JSON.stringify({ v: 1, ejemplar: selectedCopy.code, isbn: selectedCopy.isbn ?? "", titulo: selectedCopy.title, autor: selectedCopy.author });
      void QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 520, color: { dark: "#102a27", light: "#ffffff" } }).then(setQrUrl);
      return;
    }
    if (!barcodeRef.current) return;
    JsBarcode(barcodeRef.current, selectedCopy.code, { format: "CODE128", displayValue: false, lineColor: "#102a27", background: "#ffffff", width: 2.4, height: 82, margin: 0 });
  }, [dialog, labelFormat, selectedCopy]);

  const postAction = useCallback(async (payload: Record<string, unknown>, success: string) => {
    setSaving(true);
    try {
      const response = await fetch("/api/library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo completar la operación.");
      setDialog(null); setSelectedCopy(null); setSelectedLoan(null); setToast(success); setError("");
      await loadData(); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error inesperado."); return false; }
    finally { setSaving(false); }
  }, [loadData]);

  async function postAccess(payload: Record<string, unknown>, success: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo actualizar el acceso.");
      setToast(success); setError(""); await refreshAccess(); await loadData();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo actualizar el acceso."); }
    finally { setSaving(false); }
  }

  async function lookupIsbn(isbnOverride?: string) {
    const isbn = (isbnOverride ?? bookForm.isbn).replace(/[^0-9X]/gi, ""); if (!isbn) return;
    setSaving(true);
    try { const payload = await fetchIsbnData(isbn); setBookForm((current) => ({ ...current, ...payload, isbn })); setToast("Datos bibliográficos recuperados."); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ISBN no encontrado."); }
    finally { setSaving(false); }
  }

  function openBook(isbn = "") { setBookForm(newBook(isbn)); setError(""); setDialog("book"); if (isbn) window.setTimeout(() => void lookupIsbn(isbn), 20); }
  function openLoan(copy: Copy) { setSelectedCopy(copy); setError(""); setDialog("loan"); }
  function openReturn(loan: Loan) { setSelectedLoan(loan); setError(""); setDialog("return"); }
  function openScanner(mode: ScanMode) { setScanMode(mode); setManualScan(""); setError(""); setDialog("scanner"); }

  const filteredCopies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es"); if (!query) return data.copies;
    return data.copies.filter((copy) => [copy.title, copy.author, copy.code, copy.isbn, copy.category, copy.shelf].filter(Boolean).some((value) => String(value).toLocaleLowerCase("es").includes(query)));
  }, [data.copies, search]);

  const processScan = useCallback((raw: string) => {
    const value = raw.trim(); if (!value) return;
    let code = value;
    try { const parsed = JSON.parse(value) as { ejemplar?: string; isbn?: string }; code = parsed.ejemplar || parsed.isbn || value; } catch { /* código plano */ }
    const copy = data.copies.find((item) => item.code.toLowerCase() === code.toLowerCase());
    if (scanMode === "inventory") {
      if (!copy) { setError("No encontramos un ejemplar asociado con ese código."); setDialog(null); return; }
      void postAction({ action: "inventory_check", copyId: copy.id, result: "present" }, `${copy.code} verificado como presente.`); return;
    }
    if (copy) {
      setDialog(null);
      if (copy.status === "available") openLoan(copy);
      else if (copy.active_loan_id) { const loan = data.loans.find((item) => item.id === copy.active_loan_id); if (loan) openReturn(loan); }
      else setError("Ese ejemplar no está disponible para préstamo.");
      return;
    }
    const isbn = code.replace(/[^0-9X]/gi, "");
    if (isbn.length === 10 || isbn.length === 13) { setDialog("book"); setBookForm(newBook(isbn)); setSaving(true); void fetchIsbnData(isbn).then((payload) => { setBookForm((current) => ({ ...current, ...payload, isbn })); setToast("Datos bibliográficos recuperados."); setError(""); }).catch((reason) => setError(reason instanceof Error ? reason.message : "ISBN no encontrado.")).finally(() => setSaving(false)); return; }
    setError("No encontramos un ejemplar o ISBN asociado con ese código.");
  }, [data.copies, data.loans, postAction, scanMode]);

  const activeLoans = data.loans.filter((loan) => !loan.returned_at);
  const pendingCount = collaborators.filter((item) => item.status === "pending").length;
  const heading = { overview: "Buenos días", catalog: "Catálogo", loans: "Préstamos", readers: "Lectores", inventory: "Inventario físico", team: "Colaboradores" }[view];

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><Library size={24} /></div><div><strong>Biblioteca</strong><span>216</span></div></div><nav className="main-nav" aria-label="Navegación principal"><NavButton active={view === "overview"} icon={<BookOpen />} label="Resumen" onClick={() => setView("overview")} /><NavButton active={view === "catalog"} icon={<BookCopy />} label="Catálogo" onClick={() => setView("catalog")} count={data.stats.total_copies} /><NavButton active={view === "loans"} icon={<RotateCcw />} label="Préstamos" onClick={() => setView("loans")} count={data.stats.loaned} /><NavButton active={view === "readers"} icon={<Users />} label="Lectores" onClick={() => setView("readers")} count={data.stats.active_readers} /><NavButton active={view === "inventory"} icon={<ClipboardList />} label="Inventario" onClick={() => setView("inventory")} count={data.inventory.session ? data.inventory.session.checked : undefined} />{currentUser.role === "admin" && <NavButton active={view === "team"} icon={<ShieldCheck />} label="Colaboradores" onClick={() => setView("team")} count={pendingCount || undefined} />}</nav><div className="sidebar-bottom"><button className="nav-button" type="button" onClick={() => setDialog("export")}><Settings /><span>Datos y respaldos</span></button><div className="user-card"><span className="avatar">{initials(currentUser.name)}</span><div><strong>{currentUser.name}</strong><span>{currentUser.role === "admin" ? "Colaborador principal" : "Colaborador"}</span></div><a href="/api/auth/logout" aria-label="Cerrar sesión"><LogOut /></a></div></div></aside>
    <main className="workspace"><header className="topbar"><div><p className="eyebrow">Gestión privada · {currentUser.name}</p><h1>{heading}</h1></div><div className="top-actions"><button className="button secondary" type="button" onClick={() => openScanner(view === "inventory" ? "inventory" : "circulation")}><ScanLine />Escanear</button><button className="button primary" type="button" onClick={() => openBook()}><Plus />Nuevo libro</button></div></header>{error && <div className="alert error-alert"><AlertTriangle /><span>{error}</span><button type="button" onClick={() => setError("")}><X /></button></div>}{toast && <div className="toast" role="status" aria-live="polite"><Check />{toast}</div>}{loading ? <div className="loading-state"><LoaderCircle className="spin" /><span>Abriendo Biblioteca 216…</span></div> : view === "overview" ? <Overview data={data} recentLoans={activeLoans.slice(0, 6)} onOpenCatalog={() => setView("catalog")} onOpenLoans={() => setView("loans")} onScan={() => openScanner("circulation")} onReturn={openReturn} /> : view === "catalog" ? <Catalog copies={filteredCopies} search={search} setSearch={setSearch} onLoan={openLoan} onLabel={(copy) => { setSelectedCopy(copy); setLabelFormat(copy.label_type || "qr"); setQrUrl(""); setDialog("label"); }} onAddCopy={(copy) => void postAction({ action: "add_copy", bookId: copy.book_id, labelType: copy.label_type }, "Nuevo ejemplar registrado.")} onDelete={(copy) => { setSelectedCopy(copy); setError(""); setDialog("delete"); }} onCreate={() => openBook()} /> : view === "loans" ? <Loans loans={data.loans} onReturn={openReturn} onScan={() => openScanner("circulation")} /> : view === "readers" ? <Readers readers={data.readers} onCreate={() => { setError(""); setDialog("reader"); }} /> : view === "inventory" ? <Inventory inventory={data.inventory} total={data.copies.length} saving={saving} onStart={() => setDialog("inventory")} onClose={() => void postAction({ action: "close_inventory" }, "Inventario cerrado y guardado.")} onScan={() => openScanner("inventory")} onCheck={(copyId, result) => void postAction({ action: "inventory_check", copyId, result }, "Verificación guardada.")} /> : <CollaboratorsView collaborators={collaborators} currentUser={currentUser} ownerEmail={ownerEmail} saving={saving} onApprove={(email, role) => void postAccess({ action: "approve_collaborator", email, role }, role === "admin" ? "Acceso principal asignado." : "Acceso de colaborador asignado.")} onReject={(email) => void postAccess({ action: "reject_collaborator", email }, "Solicitud rechazada.")} onRevoke={(email) => void postAccess({ action: "revoke_collaborator", email }, "Acceso retirado.")} />}</main>

    {dialog === "book" && <Modal title="Registrar libro" subtitle="Crea el título y su primer ejemplar" onClose={() => setDialog(null)} wide><form onSubmit={(event) => { event.preventDefault(); void postAction({ action: "create_book", ...bookForm }, "Libro y ejemplar registrados."); }}><div className="isbn-row"><Field label="ISBN" grow><input value={bookForm.isbn} onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })} placeholder="978…" autoFocus /></Field><button className="button secondary lookup-button" type="button" onClick={() => void lookupIsbn()} disabled={saving}><Search />Buscar datos</button></div><div className="form-grid"><Field label="Título" full><input required value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} /></Field><Field label="Autor"><input value={bookForm.author} onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })} /></Field><Field label="Editorial"><input value={bookForm.publisher} onChange={(e) => setBookForm({ ...bookForm, publisher: e.target.value })} /></Field><Field label="Año o fecha"><input value={bookForm.publishYear} onChange={(e) => setBookForm({ ...bookForm, publishYear: e.target.value })} /></Field><Field label="Categoría"><input value={bookForm.category} onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })} /></Field><Field label="Ubicación / estante"><input value={bookForm.shelf} onChange={(e) => setBookForm({ ...bookForm, shelf: e.target.value })} placeholder="Ej. Sala A · Estante 3" /></Field><Field label="Estado físico"><select value={bookForm.condition} onChange={(e) => setBookForm({ ...bookForm, condition: e.target.value })}><option>Nuevo</option><option>Bueno</option><option>Regular</option><option>Requiere reparación</option></select></Field><Field label="Formato de identificación"><select value={bookForm.labelType} onChange={(e) => setBookForm({ ...bookForm, labelType: e.target.value as LabelFormat })}><option value="qr">Código QR</option><option value="barcode">Código de barras</option></select></Field></div><ModalActions saving={saving} onCancel={() => setDialog(null)} confirm="Registrar libro" /></form></Modal>}
    {dialog === "reader" && <Modal title="Nuevo lector" subtitle="Registra los datos de contacto" onClose={() => setDialog(null)}><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void postAction({ action: "create_reader", ...Object.fromEntries(form) }, "Lector registrado."); }}><div className="form-grid"><Field label="Nombre completo" full><input name="name" required autoFocus /></Field><Field label="DNI / documento"><input name="document" required /></Field><Field label="Teléfono"><input name="phone" /></Field><Field label="Correo" full><input name="email" type="email" /></Field><Field label="Dirección" full><input name="address" /></Field></div><ModalActions saving={saving} onCancel={() => setDialog(null)} confirm="Guardar lector" /></form></Modal>}
    {dialog === "loan" && selectedCopy && <Modal title="Registrar préstamo" subtitle={selectedCopy.code} onClose={() => setDialog(null)}><BookSummary copy={selectedCopy} /><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void postAction({ action: "checkout", copyId: selectedCopy.id, ...Object.fromEntries(form) }, "Préstamo registrado correctamente."); }}><div className="form-grid modal-form-spacing"><Field label="Lector" full><select name="readerId" required defaultValue=""><option value="" disabled>Selecciona un lector</option>{data.readers.filter((reader) => reader.active).map((reader) => <option key={reader.id} value={reader.id}>{reader.name} · {reader.document}</option>)}</select></Field><Field label="Fecha límite"><input name="dueAt" type="date" required defaultValue={todayPlus(14)} /></Field><Field label="Observación"><input name="notes" placeholder="Opcional" /></Field></div>{!data.readers.length && <p className="form-hint warning"><AlertTriangle />Primero debes registrar al lector.</p>}<ModalActions saving={saving} onCancel={() => setDialog(null)} confirm="Confirmar préstamo" disabled={!data.readers.length} /></form></Modal>}
    {dialog === "return" && selectedLoan && <Modal title="Registrar devolución" subtitle={selectedLoan.code} onClose={() => setDialog(null)}><div className="return-summary"><div><span>Libro</span><strong>{selectedLoan.title}</strong></div><div><span>Lector</span><strong>{selectedLoan.reader_name}</strong></div><div><span>Fecha límite</span><strong className={isOverdue(selectedLoan) ? "danger-text" : ""}>{shortDate(selectedLoan.due_at)}</strong></div></div><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void postAction({ action: "return", loanId: selectedLoan.id, ...Object.fromEntries(form) }, "Devolución registrada. El ejemplar está disponible."); }}><div className="modal-form-spacing"><Field label="Estado físico al devolver"><select name="condition"><option>Bueno</option><option>Regular</option><option>Requiere reparación</option></select></Field></div><ModalActions saving={saving} onCancel={() => setDialog(null)} confirm="Completar devolución" /></form></Modal>}
    {dialog === "delete" && selectedCopy && <Modal title="Eliminar ejemplar" subtitle="Esta acción lo retirará del catálogo" onClose={() => setDialog(null)}><div className="delete-copy-summary"><span className="delete-icon"><Trash2 /></span><div><h3>{selectedCopy.title}</h3><p>{selectedCopy.author}</p><small>{selectedCopy.code} · {selectedCopy.shelf}</small></div></div><div className="delete-warning"><AlertTriangle /><p><strong>{selectedCopy.status === "loaned" ? "Este ejemplar tiene un préstamo activo" : "¿Confirmas que deseas eliminar este ejemplar?"}</strong><span>{selectedCopy.status === "loaned" ? "Registra primero la devolución del libro para poder eliminarlo." : "Dejará de aparecer en el catálogo y en los inventarios. Su historial de préstamos y la constancia de esta acción se conservarán."}</span></p></div><div className="modal-actions"><button className="button secondary" type="button" onClick={() => setDialog(null)}>Cancelar</button><button className="button danger-button" type="button" disabled={saving || selectedCopy.status === "loaned"} onClick={() => void postAction({ action: "archive_copy", copyId: selectedCopy.id }, "Ejemplar eliminado del catálogo.")}>{saving ? <LoaderCircle className="spin" /> : <Trash2 />}{saving ? "Eliminando…" : "Eliminar ejemplar"}</button></div></Modal>}
    {dialog === "inventory" && <Modal title="Iniciar inventario" subtitle="Crea una jornada de verificación física" onClose={() => setDialog(null)}><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void postAction({ action: "start_inventory", name: form.get("name") }, "Inventario iniciado."); }}><Field label="Nombre del inventario"><input name="name" defaultValue={`Inventario ${new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(new Date())}`} required autoFocus /></Field><p className="form-hint"><ClipboardList />Cada ejemplar podrá marcarse como presente, no encontrado o dañado.</p><ModalActions saving={saving} onCancel={() => setDialog(null)} confirm="Iniciar inventario" /></form></Modal>}
    {dialog === "scanner" && <ScannerModal mode={scanMode} onClose={() => setDialog(null)} onScan={processScan} manual={manualScan} setManual={setManualScan} />}
    {dialog === "label" && selectedCopy && <Modal title="Etiqueta del ejemplar" subtitle="Elige el formato que deseas imprimir" onClose={() => setDialog(null)}><div className="label-format-picker" role="radiogroup" aria-label="Formato de la etiqueta"><button type="button" role="radio" aria-checked={labelFormat === "qr"} className={labelFormat === "qr" ? "active" : ""} onClick={() => setLabelFormat("qr")}><QrCode /><span><strong>Código QR</strong><small>Incluye los datos del ejemplar</small></span></button><button type="button" role="radio" aria-checked={labelFormat === "barcode"} className={labelFormat === "barcode" ? "active" : ""} onClick={() => setLabelFormat("barcode")}><Barcode /><span><strong>Código de barras</strong><small>Code 128 con el identificador BIB</small></span></button></div><div className="print-sheet"><div className={`library-label ${labelFormat === "barcode" ? "barcode-label" : ""}`}><div className="label-heading"><Library /><span>BIBLIOTECA 216</span></div>{labelFormat === "qr" ? qrUrl ? <Image src={qrUrl} alt={`Código QR de ${selectedCopy.code}`} width={220} height={220} unoptimized /> : <LoaderCircle className="spin" /> : <div className="barcode-wrap"><svg ref={barcodeRef} className="barcode-image" role="img" aria-label={`Código de barras ${selectedCopy.code}`} /></div>}<strong>{selectedCopy.code}</strong><h3>{selectedCopy.title}</h3><p>{selectedCopy.author}</p><small>{selectedCopy.isbn ? `ISBN ${selectedCopy.isbn}` : "Sin ISBN"} · {selectedCopy.shelf}</small></div></div><div className="modal-actions"><button className="button secondary" type="button" onClick={() => setDialog(null)}>Cerrar</button><button className="button primary" type="button" onClick={() => window.print()}><Printer />Imprimir {labelFormat === "qr" ? "QR" : "código de barras"}</button></div></Modal>}
    {dialog === "export" && <Modal title="Datos y respaldos" subtitle="Descarga copias para migración o análisis" onClose={() => setDialog(null)}><div className="export-list"><ExportLink href="/api/export?type=books" icon={<BookCopy />} title="Inventario de libros" detail="CSV con títulos y ejemplares" /><ExportLink href="/api/export?type=readers" icon={<Users />} title="Directorio de lectores" detail="CSV con datos de contacto" /><ExportLink href="/api/export?type=loans" icon={<RotateCcw />} title="Historial de préstamos" detail="CSV con entregas y devoluciones" /><ExportLink href="/api/export?type=backup" icon={<FileJson />} title="Respaldo completo" detail="JSON con biblioteca, inventarios y auditoría" /></div></Modal>}
  </div>;
}

function NavButton({ active, icon, label, onClick, count }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void; count?: number }) { return <button className={`nav-button ${active ? "active" : ""}`} type="button" onClick={onClick}>{icon}<span>{label}</span>{typeof count === "number" && <em>{count}</em>}</button>; }

function Overview({ data, recentLoans, onOpenCatalog, onOpenLoans, onScan, onReturn }: { data: LibraryData; recentLoans: Loan[]; onOpenCatalog: () => void; onOpenLoans: () => void; onScan: () => void; onReturn: (loan: Loan) => void }) {
  const stats = [{ label: "Ejemplares", value: data.stats.total_copies ?? 0, note: `${data.stats.total_books ?? 0} títulos`, icon: <BookCopy />, tone: "ink", action: onOpenCatalog }, { label: "Disponibles", value: data.stats.available ?? 0, note: "Listos para préstamo", icon: <Check />, tone: "green", action: onOpenCatalog }, { label: "Prestados", value: data.stats.loaned ?? 0, note: "Préstamos activos", icon: <RotateCcw />, tone: "ochre", action: onOpenLoans }, { label: "Vencidos", value: data.stats.overdue ?? 0, note: "Requieren atención", icon: <AlertTriangle />, tone: "red", action: onOpenLoans }];
  return <><section className="stats-grid">{stats.map((item) => <button key={item.label} className="stat-card" onClick={item.action}><span className={`stat-icon ${item.tone}`}>{item.icon}</span><div><p>{item.label}</p><strong>{item.value}</strong><small>{item.note}</small></div><ChevronRight /></button>)}</section><section className="dashboard-grid"><article className="panel loans-panel"><div className="panel-heading"><div><p className="eyebrow">Circulación</p><h2>Préstamos activos</h2></div><button className="text-button" type="button" onClick={onOpenLoans}>Ver todos <ChevronRight /></button></div>{recentLoans.length ? <div className="loan-list">{recentLoans.map((loan) => <div className="loan-row" key={loan.id}><span className="book-tile">{initials(loan.title)}</span><div className="loan-book"><strong>{loan.title}</strong><span>{loan.reader_name} · {loan.code}</span></div><div className="loan-date"><span>Vence</span><strong className={isOverdue(loan) ? "danger-text" : ""}>{shortDate(loan.due_at)}</strong></div><button className="icon-button" onClick={() => onReturn(loan)} title="Registrar devolución"><RotateCcw /></button></div>)}</div> : <EmptyState icon={<BookOpen />} title="Aún no hay préstamos" detail="Escanea un ejemplar disponible para comenzar." action="Escanear ejemplar" onAction={onScan} />}</article><aside className="side-stack"><article className="panel quick-panel"><p className="eyebrow">Acción rápida</p><h2>Escanea, presta o devuelve</h2><p>Usa la cámara. Los cambios aparecerán en todos los equipos.</p><button className="button scan-button" type="button" onClick={onScan}><Camera />Abrir cámara</button></article><article className="panel activity-panel"><div className="panel-heading compact"><h2>Actividad reciente</h2><Clock3 /></div>{data.activity.length ? <ul>{data.activity.slice(0, 5).map((item) => <li key={item.id}><span></span><div><strong>{item.detail || item.action}</strong><small>{actorName(item.actor)} · {shortDate(item.created_at)}</small></div></li>)}</ul> : <p className="muted">Las acciones del equipo aparecerán aquí.</p>}</article></aside></section></>;
}

function Catalog({ copies, search, setSearch, onLoan, onLabel, onAddCopy, onDelete, onCreate }: { copies: Copy[]; search: string; setSearch: (value: string) => void; onLoan: (copy: Copy) => void; onLabel: (copy: Copy) => void; onAddCopy: (copy: Copy) => void; onDelete: (copy: Copy) => void; onCreate: () => void }) { return <section className="panel table-panel"><div className="table-toolbar"><div className="search-box"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título, autor, ISBN, código o estante" /></div><span>{copies.length} ejemplares</span></div>{copies.length ? <div className="table-scroll"><table><thead><tr><th>Libro</th><th>Ejemplar</th><th>Ubicación</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{copies.map((copy) => <tr key={copy.id}><td><div className="title-cell"><span className="book-tile small">{initials(copy.title)}</span><div><strong>{copy.title}</strong><span>{copy.author}</span></div></div></td><td><strong className="mono">{copy.code}</strong><span className="subtext">{copy.isbn || "Sin ISBN"} · {copy.label_type === "barcode" ? "Barras" : "QR"}</span></td><td><strong>{copy.shelf}</strong><span className="subtext">{copy.condition}</span></td><td><Status copy={copy} /></td><td><div className="row-actions"><button title="Imprimir etiqueta" aria-label={`Imprimir etiqueta de ${copy.title}`} onClick={() => onLabel(copy)}><Printer /></button><button title="Agregar otro ejemplar" aria-label={`Agregar otro ejemplar de ${copy.title}`} onClick={() => onAddCopy(copy)}><Plus /></button><button className="delete-action" title="Eliminar ejemplar" aria-label={`Eliminar ${copy.title}, ${copy.code}`} onClick={() => onDelete(copy)}><Trash2 /></button>{copy.status === "available" && <button className="loan-action" onClick={() => onLoan(copy)}>Prestar</button>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={<BookCopy />} title="No hay ejemplares registrados" detail="Registra el primer libro de la colección." action="Registrar libro" onAction={onCreate} />}</section>; }

function Loans({ loans, onReturn, onScan }: { loans: Loan[]; onReturn: (loan: Loan) => void; onScan: () => void }) { const [filter, setFilter] = useState<"active" | "overdue" | "history">("active"); const visible = loans.filter((loan) => filter === "active" ? !loan.returned_at : filter === "overdue" ? isOverdue(loan) : true); return <section className="panel table-panel"><div className="table-toolbar tabs-toolbar"><div className="filter-tabs"><button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Activos</button><button className={filter === "overdue" ? "active" : ""} onClick={() => setFilter("overdue")}>Vencidos</button><button className={filter === "history" ? "active" : ""} onClick={() => setFilter("history")}>Historial</button></div><button className="button secondary compact-button" onClick={onScan}><ScanLine />Escanear</button></div>{visible.length ? <div className="table-scroll"><table><thead><tr><th>Libro</th><th>Lector</th><th>Prestado</th><th>Fecha límite</th><th>Estado</th><th></th></tr></thead><tbody>{visible.map((loan) => <tr key={loan.id}><td><strong>{loan.title}</strong><span className="subtext mono">{loan.code}</span></td><td><strong>{loan.reader_name}</strong><span className="subtext">{loan.reader_document}</span></td><td>{shortDate(loan.borrowed_at)}</td><td className={isOverdue(loan) ? "danger-text" : ""}>{shortDate(loan.due_at)}</td><td>{loan.returned_at ? <span className="pill neutral">Devuelto</span> : isOverdue(loan) ? <span className="pill danger">Vencido</span> : <span className="pill ochre">Prestado</span>}</td><td>{!loan.returned_at && <button className="button tertiary" onClick={() => onReturn(loan)}>Devolver</button>}</td></tr>)}</tbody></table></div> : <EmptyState icon={<RotateCcw />} title="No hay registros en esta vista" detail="Los préstamos aparecerán aquí cuando se registren." action="Escanear ejemplar" onAction={onScan} />}</section>; }

function Readers({ readers, onCreate }: { readers: Reader[]; onCreate: () => void }) { const [query, setQuery] = useState(""); const visible = readers.filter((reader) => `${reader.name} ${reader.document} ${reader.email}`.toLowerCase().includes(query.toLowerCase())); return <section className="panel table-panel"><div className="table-toolbar"><div className="search-box"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar lector por nombre o documento" /></div><button className="button secondary compact-button" onClick={onCreate}><UserPlus />Nuevo lector</button></div>{visible.length ? <div className="reader-grid">{visible.map((reader) => <article className="reader-card" key={reader.id}><span className="avatar large">{initials(reader.name)}</span><div className="reader-info"><h3>{reader.name}</h3><p>{reader.document}</p><span>{reader.email || reader.phone || "Sin contacto registrado"}</span></div><div className="reader-metric"><strong>{reader.active_loans}</strong><span>activos</span></div></article>)}</div> : <EmptyState icon={<Users />} title="No hay lectores registrados" detail="Crea el primer perfil para asignar préstamos." action="Registrar lector" onAction={onCreate} />}</section>; }

function Inventory({ inventory, total, saving, onStart, onClose, onScan, onCheck }: { inventory: LibraryData["inventory"]; total: number; saving: boolean; onStart: () => void; onClose: () => void; onScan: () => void; onCheck: (copyId: number, result: "present" | "missing" | "damaged") => void }) {
  const [query, setQuery] = useState(""); const session = inventory.session;
  const rows = inventory.rows.filter((row) => `${row.title} ${row.author} ${row.code} ${row.shelf}`.toLowerCase().includes(query.toLowerCase()));
  if (!session) return <div className="inventory-layout"><section className="panel inventory-empty"><span><ClipboardList /></span><p className="eyebrow">Control físico</p><h2>Inicia una jornada de inventario</h2><p>Recorre los estantes y confirma manualmente cada ejemplar. El sistema conservará quién realizó cada verificación.</p><button className="button primary" onClick={onStart}><Plus />Nuevo inventario</button></section>{inventory.history.length > 0 && <InventoryHistory sessions={inventory.history} total={total} />}</div>;
  const checked = Number(session.checked || 0); const percent = total ? Math.round((checked / total) * 100) : 0;
  return <div className="inventory-layout"><section className="panel inventory-summary"><div className="panel-heading"><div><p className="eyebrow">Inventario abierto</p><h2>{session.name}</h2><span className="muted">Iniciado por {actorName(session.started_by)} · {shortDate(session.started_at)}</span></div><div className="inventory-actions"><button className="button secondary" onClick={onScan}><ScanLine />Escanear presente</button><button className="button tertiary danger-outline" onClick={onClose} disabled={saving}><XCircle />Cerrar inventario</button></div></div><div className="inventory-metrics"><div><strong>{checked}</strong><span>verificados</span></div><div><strong>{Number(session.present || 0)}</strong><span>presentes</span></div><div><strong>{Number(session.missing || 0)}</strong><span>no encontrados</span></div><div><strong>{Number(session.damaged || 0)}</strong><span>dañados</span></div></div><div className="progress-track"><span style={{ width: `${percent}%` }}></span></div><small>{percent}% de {total} ejemplares verificados</small></section><section className="panel table-panel"><div className="table-toolbar"><div className="search-box"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar ejemplar, título o estante" /></div><span>{rows.length} ejemplares</span></div><div className="table-scroll"><table><thead><tr><th>Ejemplar</th><th>Ubicación</th><th>Verificación</th><th>Comprobado por</th><th>Marcar manualmente</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.title}</strong><span className="subtext mono">{row.code} · {row.author}</span></td><td><strong>{row.shelf}</strong><span className="subtext">{row.condition}</span></td><td><InventoryResult value={row.inventory_result} /></td><td>{row.checked_by ? <><strong>{actorName(row.checked_by)}</strong><span className="subtext">{shortDate(row.checked_at)}</span></> : <span className="muted">Pendiente</span>}</td><td><div className="inventory-checks"><button className="check-present" title="Presente" onClick={() => onCheck(row.id, "present")} disabled={saving}><CheckCircle2 /></button><button className="check-missing" title="No encontrado" onClick={() => onCheck(row.id, "missing")} disabled={saving}><XCircle /></button><button className="check-damaged" title="Dañado" onClick={() => onCheck(row.id, "damaged")} disabled={saving}><Wrench /></button></div></td></tr>)}</tbody></table></div></section><InventoryHistory sessions={inventory.history} total={total} /></div>;
}
function InventoryResult({ value }: { value: InventoryRow["inventory_result"] }) { if (value === "present") return <span className="pill success">Presente</span>; if (value === "missing") return <span className="pill danger">No encontrado</span>; if (value === "damaged") return <span className="pill ochre">Dañado</span>; return <span className="pill neutral">Sin verificar</span>; }
function InventoryHistory({ sessions, total }: { sessions: InventorySession[]; total: number }) { return <section className="panel history-panel"><div className="panel-heading compact"><h2>Historial de inventarios</h2><Clock3 /></div><div className="history-list">{sessions.map((session) => <div key={session.id}><span className={`history-dot ${session.status}`}></span><div><strong>{session.name}</strong><small>{shortDate(session.started_at)} · {Number(session.checked || 0)} de {total} verificados</small></div><div><span>{Number(session.missing || 0)} faltantes</span><span>{Number(session.damaged || 0)} dañados</span></div></div>)}</div></section>; }

function CollaboratorsView({
  collaborators,
  currentUser,
  ownerEmail,
  saving,
  onApprove,
  onReject,
  onRevoke,
}: {
  collaborators: Collaborator[];
  currentUser: Collaborator;
  ownerEmail: string | null;
  saving: boolean;
  onApprove: (email: string, role: "admin" | "staff") => void;
  onReject: (email: string) => void;
  onRevoke: (email: string) => void;
}) {
  const pending = collaborators.filter((item) => item.status === "pending");
  const active = collaborators.filter((item) => item.status === "approved");
  const blocked = collaborators.filter((item) => item.status === "rejected");

  return (
    <div className="team-layout">
      <section className="permissions-guide">
        <div>
          <span><Users /></span>
          <p><strong>Colaborador</strong><small>Gestiona catálogo, préstamos, lectores e inventarios.</small></p>
        </div>
        <div>
          <span><ShieldCheck /></span>
          <p><strong>Colaborador principal</strong><small>También aprueba cuentas y asigna permisos al equipo.</small></p>
        </div>
      </section>

      {pending.length > 0 && (
        <section className="panel team-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Requieren revisión</p><h2>Solicitudes pendientes</h2></div>
            <span className="pill ochre">{pending.length}</span>
          </div>
          <div className="team-list">
            {pending.map((person) => (
              <article key={person.id}>
                <span className="avatar large">{initials(person.name)}</span>
                <div>
                  <h3>{person.name}</h3>
                  <p>{person.email}</p>
                  <small>{authMethod(person.auth_provider)} · Solicitó {shortDate(person.requested_at)}</small>
                </div>
                <div className="team-actions pending-actions">
                  <button className="button tertiary danger-outline" disabled={saving} onClick={() => onReject(person.email)}><UserX />Rechazar</button>
                  <button className="button secondary" disabled={saving} onClick={() => onApprove(person.email, "staff")}><UserCheck />Hacer colaborador</button>
                  <button className="button primary" disabled={saving} onClick={() => onApprove(person.email, "admin")}><ShieldCheck />Hacer principal</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel team-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Acceso vigente</p><h2>Equipo autorizado</h2></div>
          <span className="pill success">{active.length}</span>
        </div>
        <div className="team-list">
          {active.map((person) => {
            const isOwner = Boolean(ownerEmail) && person.email === ownerEmail;
            const isSelf = person.email === currentUser.email;
            return (
              <article key={person.id}>
                <span className="avatar large">{initials(person.name)}</span>
                <div>
                  <h3>{person.name}</h3>
                  <p>{person.email}</p>
                  <small>{authMethod(person.auth_provider)} · Último acceso {shortDate(person.last_seen_at)}</small>
                </div>
                <div className="team-actions">
                  {!isOwner && !isSelf && person.role === "staff" && (
                    <button className="button secondary" disabled={saving} onClick={() => onApprove(person.email, "admin")}><ShieldCheck />Hacer principal</button>
                  )}
                  {!isOwner && !isSelf && person.role === "admin" && (
                    <button className="button secondary" disabled={saving} onClick={() => onApprove(person.email, "staff")}><Users />Cambiar a colaborador</button>
                  )}
                  {!isOwner && !isSelf && (
                    <button className="button tertiary danger-outline" disabled={saving} onClick={() => onRevoke(person.email)}><UserX />Retirar acceso</button>
                  )}
                  <span className={`pill ${person.role === "admin" ? "ochre" : "success"}`}>
                    {isOwner ? "Principal protegido" : isSelf ? "Tu cuenta" : person.role === "admin" ? "Principal" : "Colaborador"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {blocked.length > 0 && (
        <section className="panel team-panel compact-team">
          <div className="panel-heading compact"><h2>Accesos bloqueados</h2><UserX /></div>
          <div className="team-list">
            {blocked.map((person) => (
              <article key={person.id}>
                <span className="avatar">{initials(person.name)}</span>
                <div><h3>{person.name}</h3><p>{person.email}</p></div>
                <div className="team-actions">
                  <button className="button secondary" disabled={saving} onClick={() => onApprove(person.email, "staff")}>Restaurar como colaborador</button>
                  <button className="button primary" disabled={saving} onClick={() => onApprove(person.email, "admin")}>Restaurar como principal</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function authMethod(provider: Collaborator["auth_provider"]) {
  if (provider === "google") return "Google";
  if (provider === "password+google") return "Correo y Google";
  return "Correo y contraseña";
}

function Status({ copy }: { copy: Copy }) { if (copy.status === "available") return <span className="pill success">Disponible</span>; if (copy.status === "loaned") return <div><span className="pill ochre">Prestado</span>{copy.reader_name && <span className="subtext">{copy.reader_name}</span>}</div>; if (copy.status === "maintenance") return <span className="pill neutral">Mantenimiento</span>; return <span className="pill danger">Extraviado</span>; }
function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" onClick={onClose} aria-label="Cerrar"><X /></button></header>{children}</section></div>; }
function Field({ label, children, full = false, grow = false }: { label: string; children: React.ReactNode; full?: boolean; grow?: boolean }) { return <label className={`field ${full ? "full" : ""} ${grow ? "grow" : ""}`}><span>{label}</span>{children}</label>; }
function ModalActions({ saving, onCancel, confirm, disabled = false }: { saving: boolean; onCancel: () => void; confirm: string; disabled?: boolean }) { return <div className="modal-actions"><button className="button secondary" type="button" onClick={onCancel}>Cancelar</button><button className="button primary" type="submit" disabled={saving || disabled}>{saving ? <LoaderCircle className="spin" /> : <Check />}{confirm}</button></div>; }
function BookSummary({ copy }: { copy: Copy }) { return <div className="book-summary"><span className="book-tile">{initials(copy.title)}</span><div><h3>{copy.title}</h3><p>{copy.author}</p><small>{copy.code} · {copy.shelf}</small></div><span className="pill success">Disponible</span></div>; }
function EmptyState({ icon, title, detail, action, onAction }: { icon: React.ReactNode; title: string; detail: string; action: string; onAction: () => void }) { return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{detail}</p><button className="button secondary" type="button" onClick={onAction}>{action}</button></div>; }
function ExportLink({ href, icon, title, detail }: { href: string; icon: React.ReactNode; title: string; detail: string }) { return <a className="export-link" href={href} download><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><Download /></a>; }

function ScannerModal({ mode, onClose, onScan, manual, setManual }: { mode: ScanMode; onClose: () => void; onScan: (value: string) => void; manual: string; setManual: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null); const controlsRef = useRef<{ stop: () => void } | null>(null); const [cameraError, setCameraError] = useState(""); const handledRef = useRef(false);
  useEffect(() => { let cancelled = false; async function start() { try { const { BrowserMultiFormatReader } = await import("@zxing/browser"); if (cancelled || !videoRef.current) return; const reader = new BrowserMultiFormatReader(); controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => { if (result && !handledRef.current) { handledRef.current = true; controlsRef.current?.stop(); onScan(result.getText()); } }); } catch (reason) { setCameraError(reason instanceof Error ? reason.message : "No se pudo abrir la cámara."); } } void start(); return () => { cancelled = true; controlsRef.current?.stop(); }; }, [onScan]);
  return <Modal title={mode === "inventory" ? "Verificar ejemplar" : "Escanear código"} subtitle={mode === "inventory" ? "El ejemplar escaneado se marcará como presente" : "Apunta la cámara al QR, código de barras o ISBN"} onClose={onClose}><div className="scanner-view"><video ref={videoRef} muted playsInline /><div className="scan-frame"><span></span><span></span><span></span><span></span></div>{cameraError && <div className="camera-error"><AlertTriangle /><p>No pudimos usar la cámara. Comprueba los permisos.</p><small>{cameraError}</small></div>}</div><div className="manual-scan"><span>También puedes ingresar el código manualmente</span><div><input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="BIB-… o ISBN" onKeyDown={(e) => { if (e.key === "Enter") onScan(manual); }} /><button className="button primary" type="button" onClick={() => onScan(manual)}>Buscar</button></div></div></Modal>;
}
