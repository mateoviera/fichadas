# Recordatorios por email

Todos los días a las **8:00 (hora argentina)** Vercel ejecuta `api/recordatorios.js`, que lee Supabase y manda por email:

- tareas vencidas,
- tareas para hoy,
- tareas de mañana, como aviso.

Si no hay tareas vencidas ni para hoy, **no se manda nada**.

## Configuración (una sola vez)

1. **Resend** (envío de mails, gratis hasta 100 por día): crear cuenta en https://resend.com con el email donde querés recibir los avisos → *API Keys* → *Create API Key* (permiso *Sending access*). Copiá la clave (empieza con `re_`).
2. **Supabase** → *Project Settings* → *API* → copiá la clave **service_role** (la secreta, no la *anon*). Sirve para que la función lea los datos sin iniciar sesión. Nunca la pongas en la app ni la compartas.
3. **Vercel** → el proyecto → *Settings* → *Environment Variables* → agregá, para *Production*:

| Variable | Valor |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | la clave service_role del paso 2 |
| `RESEND_API_KEY` | la clave de Resend del paso 1 |
| `RECORDATORIOS_EMAIL` | tu email (el mismo de la cuenta de Resend) |
| `CRON_SECRET` | un texto largo inventado, por ejemplo 30 letras y números al azar |

   `VITE_SUPABASE_URL` ya está cargada de antes.
4. **Redeploy**: *Deployments* → el último → *⋯* → *Redeploy* (las variables nuevas se toman en el próximo deploy).

## Probar

Abrí en el navegador (reemplazá `TU_SECRETO` por el valor de `CRON_SECRET`):

- Ver cómo queda el mail de hoy, sin mandarlo: `https://<tu-app>.vercel.app/api/recordatorios?secret=TU_SECRETO&preview=1`
- Mandarlo ahora aunque no haya nada pendiente: `https://<tu-app>.vercel.app/api/recordatorios?secret=TU_SECRETO&force=1`

## Notas

- Con la cuenta gratis de Resend y el remitente `onboarding@resend.dev`, los mails solo pueden ir al **email con el que creaste la cuenta**. Para mandarlos a otras direcciones hay que verificar un dominio propio en Resend y cargar `RECORDATORIOS_FROM` (ej. `Gestión de Personal <avisos@tudominio.com>`).
- Si el primer mail cae en *Spam*, marcalo como «No es spam».
- La hora se cambia en `vercel.json` (`"0 11 * * *"` = 11:00 UTC = 8:00 en Argentina). En el plan gratis de Vercel puede llegar en cualquier momento dentro de esa hora.
