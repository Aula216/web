"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Library,
  LoaderCircle,
  Mail,
  ScanLine,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useState } from "react";

type Mode = "login" | "register";

const oauthErrors: Record<string, string> = {
  access_denied: "Cancelaste el acceso con Google. Puedes intentarlo nuevamente.",
  invalid_state: "La solicitud de Google venció. Intenta iniciar sesión otra vez.",
  account_conflict:
    "Ese perfil de Google está vinculado a otra cuenta. Comunícate con un colaborador principal.",
  google_not_configured:
    "El acceso con Google aún no está configurado por el administrador.",
  google_verification_failed:
    "Google no pudo verificar la cuenta. Intenta nuevamente en unos minutos.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.19-2.06H12v3.89h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.37Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.52c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.9A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.9V7.5H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.5l3.35-2.6Z" />
      <path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.5l3.35 2.6C7.18 7.73 9.39 5.98 12 5.98Z" />
    </svg>
  );
}

export default function LoginForm({ initialOauthError }: { initialOauthError?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(
    initialOauthError
      ? oauthErrors[initialOauthError] || "No se pudo completar el acceso con Google."
      : "",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordRules = {
    length: password.length >= 8,
    letter: /\p{L}/u.test(password),
    number: /\d/.test(password),
    special: /[^\p{L}\p{N}\s]/u.test(password),
  };
  const strongPassword = Object.values(passwordRules).every(Boolean);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setShowPassword(false);
    setPassword("");
    setConfirmPassword("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    if (mode === "register" && (!strongPassword || !passwordsMatch)) {
      setError("La contraseña debe cumplir todos los requisitos y coincidir con la confirmación.");
      setSaving(false);
      return;
    }

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) {
        throw new Error(result.error || "No se pudo completar el acceso.");
      }
      window.location.assign(result.status === "pending" ? "/?welcome=pending" : "/");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo completar el acceso.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-hero" aria-label="Biblioteca 216">
        <div className="login-brand">
          <span><Library /></span>
          <div><strong>Biblioteca</strong><em>216</em></div>
        </div>

        <div className="login-hero-copy">
          <p className="eyebrow">Gestión colaborativa</p>
          <h1>Todo el trabajo de la biblioteca, en un solo lugar.</h1>
          <p>
            Registra ejemplares, controla préstamos y verifica el inventario con
            un acceso seguro para cada integrante del equipo.
          </p>
        </div>

        <div className="login-feature-list">
          <div><span><BookOpen /></span><p><strong>Catálogo centralizado</strong><small>Libros y ejemplares siempre actualizados.</small></p></div>
          <div><span><ScanLine /></span><p><strong>Escaneo desde la cámara</strong><small>Compatible con etiquetas QR y códigos de barras.</small></p></div>
          <div><span><Users /></span><p><strong>Acciones identificadas</strong><small>Cada cambio queda asociado a un colaborador.</small></p></div>
        </div>

        <p className="login-hero-note"><ShieldCheck /> Acceso exclusivo para el equipo autorizado.</p>
      </section>

      <section className="login-panel">
        <div className="login-mobile-brand">
          <span><Library /></span><strong>Biblioteca 216</strong>
        </div>

        <div className="auth-card-modern">
          <div className="auth-heading">
            <p className="eyebrow">Portal de colaboradores</p>
            <h2>{mode === "login" ? "Qué gusto verte" : "Únete al equipo"}</h2>
            <p>
              {mode === "login"
                ? "Ingresa para continuar administrando la biblioteca."
                : "Crea tu cuenta; un colaborador principal confirmará tu acceso."}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => changeMode("login")}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "active" : ""}
              onClick={() => changeMode("register")}
            >
              Crear cuenta
            </button>
          </div>

          {error && (
            <div className="alert error-alert auth-error" role="alert">
              <AlertTriangle />
              <span>{error}</span>
            </div>
          )}

          <a className="google-auth-button" href="/api/auth/google/start">
            <GoogleIcon />
            <span>{mode === "login" ? "Continuar con Google" : "Registrarme con Google"}</span>
            <ArrowRight />
          </a>

          <div className="auth-divider"><span>o continúa con tu correo</span></div>

          <form className="auth-form-modern" onSubmit={submit}>
            {mode === "register" && (
              <label className="auth-field">
                <span>Nombre completo</span>
                <div><User /><input name="name" autoComplete="name" placeholder="Ej. Ana Torres" required /></div>
              </label>
            )}

            <label className="auth-field">
              <span>Correo electrónico</span>
              <div><Mail /><input name="email" type="email" autoComplete="email" placeholder="nombre@correo.com" required /></div>
            </label>

            <label className="auth-field">
              <span>Contraseña</span>
              <div>
                <KeyRound />
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={mode === "login" ? "Tu contraseña" : "Mínimo 8 caracteres"}
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            {mode === "register" && (
              <>
                <div className="password-rules" aria-label="Requisitos de contraseña">
                  <p>La contraseña debe contener:</p>
                  <div>
                    <span className={passwordRules.length ? "valid" : ""}><CheckCircle2 />8 caracteres como mínimo</span>
                    <span className={passwordRules.letter ? "valid" : ""}><CheckCircle2 />Una letra</span>
                    <span className={passwordRules.number ? "valid" : ""}><CheckCircle2 />Un número</span>
                    <span className={passwordRules.special ? "valid" : ""}><CheckCircle2 />Un carácter especial</span>
                  </div>
                </div>

                <label className="auth-field">
                  <span>Confirmar contraseña</span>
                  <div className={confirmPassword ? (passwordsMatch ? "field-valid" : "field-invalid") : ""}>
                    <KeyRound />
                    <input
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Escribe nuevamente tu contraseña"
                      minLength={8}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                    />
                  </div>
                  {confirmPassword && (
                    <small className={`password-match ${passwordsMatch ? "valid" : "invalid"}`}>
                      {passwordsMatch ? "Las contraseñas coinciden." : "Las contraseñas no coinciden."}
                    </small>
                  )}
                </label>
              </>
            )}

            <button
              className="button primary auth-submit"
              disabled={saving || (mode === "register" && (!strongPassword || !passwordsMatch))}
            >
              {saving ? <LoaderCircle className="spin" /> : <ArrowRight />}
              {saving
                ? "Procesando…"
                : mode === "login"
                  ? "Ingresar a Biblioteca 216"
                  : "Crear mi cuenta"}
            </button>
          </form>

          <p className="auth-privacy">
            <ShieldCheck /> Tus datos se utilizan únicamente para identificar las acciones realizadas dentro de la biblioteca.
          </p>
        </div>
      </section>
    </main>
  );
}
