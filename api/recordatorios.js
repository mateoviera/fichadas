// Función programada (Vercel Cron): todos los días manda por email el resumen de tareas pendientes.
// Variables necesarias en Vercel → Settings → Environment Variables:
//   VITE_SUPABASE_URL           (ya está: la URL del proyecto de Supabase)
//   SUPABASE_SERVICE_ROLE_KEY   (Supabase → Project Settings → API → service_role; NUNCA en el navegador)
//   RESEND_API_KEY              (resend.com → API Keys)
//   RECORDATORIOS_EMAIL         (a quién se manda; con la cuenta gratis de Resend, el mismo email de la cuenta)
//   CRON_SECRET                 (cualquier texto largo; Vercel lo usa para que nadie más pueda dispararla)
// Opcionales: RECORDATORIOS_FROM (remitente; por defecto onboarding@resend.dev), APP_URL (link del botón).
// Prueba manual: /api/recordatorios?secret=CRON_SECRET&preview=1 (muestra el mail) o &force=1 (lo manda aunque no haya nada).
import { createClient } from '@supabase/supabase-js';
import { buildDigest, todayInArgentina } from '../src/lib/digest.js';

async function readAll(db, table, columns, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

export default async function handler(req, res) {
  const env = process.env;
  const url = new URL(req.url, 'http://x');
  const secret = env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (!secret || (auth !== `Bearer ${secret}` && url.searchParams.get('secret') !== secret)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const missing = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'RECORDATORIOS_EMAIL'].filter((k) => !env[k]);
  if (missing.length) return res.status(500).json({ error: `Faltan variables: ${missing.join(', ')}` });

  try {
    const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const today = todayInArgentina();
    const [tasks, emps] = await Promise.all([
      readAll(db, 'tasks', 'id,legajo,text,due,note,done', (q) => q.eq('done', false)),
      readAll(db, 'employees', 'legajo,name'),
    ]);
    const digest = buildDigest({
      tasks: tasks.map((t) => ({ ...t, due: t.due || '' })),
      employees: Object.fromEntries(emps.map((e) => [e.legajo, { name: e.name }])),
    }, today, env.APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : ''));

    if (url.searchParams.get('preview')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(digest.html);
    }
    if (digest.empty && !url.searchParams.get('force')) return res.status(200).json({ sent: false, reason: 'Nada que avisar hoy', counts: digest.counts });

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.RECORDATORIOS_FROM || 'Gestión de Personal <onboarding@resend.dev>',
        to: env.RECORDATORIOS_EMAIL.split(',').map((s) => s.trim()).filter(Boolean),
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: 'Resend rechazó el envío', detail: body });
    return res.status(200).json({ sent: true, id: body.id, counts: digest.counts });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
