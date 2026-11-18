# Backend con Supabase

La app puede funcionar de dos maneras. Se elige con dos variables de entorno; el código es el mismo.

| Modo | Dónde quedan los datos | Cuándo usarlo |
|---|---|---|
| **Sin backend** (variables vacías) | En el navegador de cada PC | Pruebas, o una sola persona en una sola PC |
| **Con Supabase** (variables completas) | En una base de datos compartida, con usuario y contraseña | Varias personas o varias PCs viendo los mismos datos |

Supabase puede estar **en la nube** (supabase.com) o **en una PC de la empresa** (con Docker). Más abajo están los pasos para cada caso.

Con Supabase:
- Hay que iniciar sesión. Los usuarios los crea quien administra (no hay registro público).
- Cada cambio se guarda solo en la base. Arriba a la derecha se ve «Guardando…» / «Guardado».
- Los cambios que haga otra persona se ven al recargar la página.
- Si dos personas cambian lo mismo a la vez, queda el último cambio.

---

## A. Supabase en la nube + Vercel

### 1. Crear el proyecto
1. Entrá a https://supabase.com y creá una cuenta (o usá la de la empresa).
2. **New project** → nombre `fichadas`, región **South America (São Paulo)**. Guardá la contraseña de la base en un lugar seguro.

### 2. Crear las tablas
1. En el panel: **SQL Editor** → **New query**.
2. Pegá todo el contenido de [`supabase/migrations/20261117000000_init.sql`](../supabase/migrations/20261117000000_init.sql) y tocá **Run**.
3. En **Table Editor** tienen que aparecer: `establishments`, `files`, `punches`, `employees`, `schedules`, `holidays`, `leaves`, `settings`.

### 3. Usuarios
1. **Authentication → Sign In / Providers**: desactivá **Allow new users to sign up** (así nadie se puede registrar solo).
2. **Authentication → Users → Add user → Create new user**: email y contraseña de cada persona que va a usar el sistema. Marcá **Auto Confirm User**.

### 4. Claves
En **Project Settings → API** (o **Data API / API Keys**) copiá:
- **Project URL** → va en `VITE_SUPABASE_URL`
- La clave **anon** / **publishable** → va en `VITE_SUPABASE_ANON_KEY`

> Usá solo la clave *anon/publishable*. La *service_role* / *secret* **nunca** va en la web.

Recomendado: en **Settings → API → Max rows** subí el valor a `10000` para que la carga inicial sea más rápida cuando haya muchas fichadas.

### 5. Vercel
1. En el proyecto de Vercel: **Settings → Environment Variables**.
2. Agregá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores del paso anterior (para *Production*, y si querés también *Preview*).
3. **Deployments → ⋯ → Redeploy** (las variables se leen al compilar).

### 6. Pasar los datos que ya tenés
1. En la versión vieja (la que guarda en el navegador): **Ajustes → Descargar copia**.
2. En la versión con Supabase, con tu usuario: **Ajustes → Restaurar copia** y elegí ese archivo.
3. Esperá a que arriba diga **Guardado** antes de cerrar la página (con muchas fichadas puede tardar un par de minutos).

### Probarlo en tu compu contra la nube
Copiá `.env.example` como `.env.local`, completá las dos variables y corré `npm run dev`.

---

## B. Supabase en una PC de la empresa (local)

Todo corre en esa PC: la base (en Docker) y la web. Las demás computadoras de la red entran por el navegador. Los datos no salen de la empresa.

### Requisitos (una sola vez)
- **Windows 10/11** con virtualización activada.
- **Docker Desktop**: https://www.docker.com/products/docker-desktop — en su configuración activá *Start Docker Desktop when you sign in*.
- **Node.js 20 o superior** (LTS): https://nodejs.org
- **Git**: https://git-scm.com

### Instalación
```bash
git clone https://github.com/mateoviera/fichadas.git
cd fichadas
npm install
npm run db:start
```
La primera vez `db:start` descarga las imágenes de Docker (varios minutos). Al terminar muestra algo así:
```
API URL: http://127.0.0.1:54321
Studio URL: http://127.0.0.1:54323
anon key / Publishable key: eyJhbGciOi...   (o sb_publishable_...)
```
Las tablas se crean solas (usa la carpeta `supabase/migrations`). Para volver a ver estos datos: `npm run db:status`.

### Crear usuarios
Abrí **http://localhost:54323** (Supabase Studio) → **Authentication → Users → Add user → Create new user**, con *Auto Confirm User*.

### Configurar la web
1. Averiguá la IP de la PC en la red: en una terminal `ipconfig` → *Dirección IPv4* (ej. `192.168.1.50`). Conviene pedirle a sistemas que esa IP sea **fija**.
2. Creá el archivo `.env.local` (copiando `.env.example`) con:
   ```
   VITE_SUPABASE_URL=http://192.168.1.50:54321
   VITE_SUPABASE_ANON_KEY=la_anon_key_que_mostró_db_start
   ```
   Usá la IP, no `127.0.0.1`, para que funcione desde otras PCs.
3. Compilá y servila en la red:
   ```bash
   npm run build
   npx vite preview --host --port 5173
   ```
4. Desde cualquier PC de la red: **http://192.168.1.50:5173**

### Firewall de Windows
Permití conexiones entrantes en los puertos **5173** (la web) y **54321** (la API) para redes **privadas**. En PowerShell como administrador:
```powershell
New-NetFirewallRule -DisplayName "Fichadas web" -Direction Inbound -Protocol TCP -LocalPort 5173 -Profile Private -Action Allow
New-NetFirewallRule -DisplayName "Fichadas API" -Direction Inbound -Protocol TCP -LocalPort 54321 -Profile Private -Action Allow
```
No abras el puerto 54323 (Studio) ni 54322 (la base) a la red: son de administración.

### Que arranque solo al prender la PC
El archivo [`scripts/iniciar-fichadas.bat`](../scripts/iniciar-fichadas.bat) levanta la base y la web. Para que corra al iniciar sesión: `Win + R` → `shell:startup` → creá ahí un acceso directo a ese `.bat`.

### Respaldos
- `npm run db:backup` guarda todos los datos en `backups/datos.sql`. Copiá ese archivo a otro disco o a la nube regularmente.
- También sirve **Ajustes → Descargar copia** desde la web.
- `npm run db:stop` apaga la base **sin borrar** los datos. **Nunca** uses `supabase stop --no-backup`: borra todo.

### Actualizar la app
```bash
git pull
npm install
npm run db:start
npm run build
```
y reiniciá la web (o la PC).

### Nota
El entorno local del CLI de Supabase está pensado para desarrollo, pero para una oficina chica funciona bien. Si más adelante se usa mucho, sistemas puede pasarlo a la instalación oficial con Docker Compose (https://supabase.com/docs/guides/self-hosting/docker). Para la app no cambia nada: solo la URL y la clave en `.env.local`.

---

## Archivos relacionados
- `supabase/migrations/…_init.sql` — tablas, permisos y datos iniciales.
- `supabase/config.toml` — configuración de Supabase local (registro público desactivado).
- `src/lib/remote.js` — lectura y guardado en Supabase.
- `src/lib/store.js` — estado de la app; usa Supabase si hay variables, si no el navegador.
- `src/views/Login.jsx` — pantalla de ingreso.
