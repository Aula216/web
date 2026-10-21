# Biblioteca 216 — Next.js

Aplicación web para administrar libros, ejemplares, lectores, préstamos,
inventarios físicos, etiquetas QR/código de barras y colaboradores.

Esta edición usa **Next.js nativo** y está preparada para desplegarse en
Vercel. No usa Vinext, Vite, Wrangler, Cloudflare Workers ni D1.

## Tecnología

- Next.js 16 con App Router
- React 19
- PostgreSQL (Neon, Supabase, Vercel Postgres, Railway u otro proveedor)
- Sesiones cifradas en cookies HTTP-only
- Contraseñas protegidas con bcrypt
- Inicio de sesión con Google mediante OAuth 2.0 y PKCE

## Configuración local

1. Instala Node.js 20.9 o posterior.
2. Ejecuta `npm install`.
3. Copia `.env.example` como `.env.local` y completa las variables.
4. Ejecuta `npm run db:init` para crear las tablas.
5. Ejecuta `npm run dev` y abre `http://localhost:3000`.

Para generar `SESSION_SECRET` puedes usar:

```bash
openssl rand -base64 32
```

La cuenta registrada con el correo definido en `INITIAL_ADMIN_EMAIL` se
convierte en el colaborador principal inicial. Las demás cuentas, tanto las
creadas con contraseña como las creadas con Google, quedan pendientes hasta
que un colaborador principal las apruebe como **colaborador** o como
**colaborador principal**.

Las contraseñas deben tener ocho caracteres como mínimo e incluir una letra,
un número y un carácter especial. El formulario solicita escribirla dos veces.

## Configurar el acceso con Google

1. En Google Cloud crea o selecciona un proyecto.
2. Configura la pantalla de consentimiento de OAuth.
3. Crea un cliente OAuth de tipo **Aplicación web**.
4. Agrega como URI de redirección local:
   `http://localhost:3000/api/auth/google/callback`.
5. Para producción agrega también:
   `https://TU-DOMINIO/api/auth/google/callback`.
6. Copia el ID y el secreto en `GOOGLE_CLIENT_ID` y
   `GOOGLE_CLIENT_SECRET`. Configura en `GOOGLE_REDIRECT_URI` la URI exacta
   correspondiente al entorno.

El sistema valida el estado OAuth, usa PKCE, exige un correo verificado y
comprueba el emisor, el destinatario y la vigencia de la identidad de Google.

## Despliegue en Vercel

1. Crea una base PostgreSQL administrada y copia su cadena de conexión.
2. Descomprime este paquete y sube la carpeta a un repositorio de GitHub para
   importarlo desde Vercel, o abre una terminal dentro de la carpeta y ejecuta
   `npx vercel` para cargarlo directamente.
3. En **Settings → Environment Variables**, agrega:
   `DATABASE_URL`, `SESSION_SECRET`, `INITIAL_ADMIN_EMAIL`,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI`.
4. Despliega. Next.js creará las tablas al recibir la primera solicitud; de
   forma opcional puedes ejecutar antes `npm run db:init` desde tu equipo.
5. Registra la cuenta principal inicial.

Vercel detectará Next.js automáticamente. No requiere `vercel.json` ni un
adaptador de compilación.

Para `biblioteca-216.vercel.app`, la URI de redirección es:
`https://biblioteca-216.vercel.app/api/auth/google/callback`.

No subas un archivo `.env.local`: las credenciales deben configurarse en el
panel de Vercel. El archivo `.env.example` solamente contiene valores de
referencia y se puede conservar en el proyecto.

## Migrar los datos de la web anterior

1. En la versión anterior abre **Datos y respaldos → Respaldo completo**.
2. Descarga el archivo JSON.
3. Con `DATABASE_URL` configurada hacia la base nueva, ejecuta:

```bash
npm run db:import -- /ruta/biblioteca-216-respaldo.json
```

El importador conserva libros, ejemplares, préstamos, lectores, auditoría e
inventarios. Por seguridad no migra contraseñas y deja las cuentas importadas
pendientes. El colaborador principal inicial debe registrarse y después definir
los permisos del resto del equipo.

## Comandos

- `npm run dev`: servidor de desarrollo de Next.js.
- `npm run build`: compilación de producción.
- `npm start`: servidor de producción.
- `npm run lint`: revisión estática.
- `npm run db:init`: crea/actualiza el esquema PostgreSQL.
- `npm run db:import -- archivo.json`: importa un respaldo de la versión D1.
