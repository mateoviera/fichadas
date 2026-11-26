// Resumen diario por email: tareas vencidas y de hoy, ausentes del día y solicitudes por aprobar.
// Es código puro (sin red ni navegador) para usarlo desde la función programada de Vercel y en los tests.
import { bucketOf, taskCompare } from './tasks.js';
import { isFullDay, leaveLength, HOURS } from './personal.js';
import { addDays, weekday } from './time.js';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fmt = (k) => (k ? `${k.slice(8)}/${k.slice(5, 7)}` : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Arma el resumen del día. `data` = { tasks, employees: {legajo: {name, exitDate}}, leaves }.
 * Devuelve { empty, subject, html, text, counts }. `empty` = no hay nada que avisar.
 */
export function buildDigest(data, today, appUrl = '') {
  const emps = data.employees || {};
  const name = (l) => emps[l]?.name || `Leg. ${l}`;
  const active = (l) => !emps[l]?.exitDate || emps[l].exitDate > today;
  const pending = (data.tasks || []).filter((t) => !t.done);
  const overdue = pending.filter((t) => bucketOf(t, today) === 'vencidas').sort(taskCompare);
  const forToday = pending.filter((t) => bucketOf(t, today) === 'hoy').sort(taskCompare);
  const tomorrow = pending.filter((t) => t.due === addDays(today, 1)).sort(taskCompare);
  const leaves = (data.leaves || []).filter((l) => active(l.legajo));
  const absent = leaves.filter((l) => (l.status || 'aprobada') === 'aprobada' && l.from <= today && (l.to || l.from) >= today)
    .sort((a, b) => name(a.legajo).localeCompare(name(b.legajo), 'es'));
  const requests = leaves.filter((l) => l.status === 'pendiente').sort((a, b) => a.from.localeCompare(b.from));

  const counts = { overdue: overdue.length, today: forToday.length, tomorrow: tomorrow.length, absent: absent.length, requests: requests.length };
  const empty = !overdue.length && !forToday.length && !requests.length;

  const taskLine = (t) => `${t.text}${t.legajo ? ` — ${name(t.legajo)}` : ''}${t.note ? ` (${t.note})` : ''}`;
  const absentLine = (l) => `${name(l.legajo)} — ${l.type}${l.type === HOURS ? ` ${l.startTime}–${l.endTime}` : (l.to || l.from) === today ? ', vuelve mañana' : ` hasta el ${fmt(l.to)}`}`;
  const reqLine = (l) => `${name(l.legajo)} — ${l.type} desde el ${fmt(l.from)}${isFullDay(l) ? ` (${leaveLength(l)} d)` : ''}`;

  const dayTitle = `${DAYS[weekday(today)]} ${fmt(today)}`;
  const parts = [];
  if (overdue.length) parts.push(`${overdue.length} vencida${overdue.length === 1 ? '' : 's'}`);
  if (forToday.length) parts.push(`${forToday.length} para hoy`);
  if (requests.length) parts.push(`${requests.length} solicitud${requests.length === 1 ? '' : 'es'} por aprobar`);
  const subject = `Gestión de Personal · ${dayTitle}${parts.length ? ` · ${parts.join(', ')}` : ''}`;

  const sections = [
    ['⚠️ Tareas vencidas', overdue, (t) => `${esc(taskLine(t))} <span style="color:#dc2626">(${fmt(t.due)})</span>`, (t) => `${taskLine(t)} (${fmt(t.due)})`],
    ['📌 Para hoy', forToday, (t) => esc(taskLine(t)), taskLine],
    ['🗓️ Mañana', tomorrow, (t) => esc(taskLine(t)), taskLine],
    ['🏖️ Ausentes hoy', absent, (l) => esc(absentLine(l)), absentLine],
    ['📥 Solicitudes por aprobar', requests, (l) => esc(reqLine(l)), reqLine],
  ].filter(([, items]) => items.length);

  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f9;font-family:Segoe UI,Arial,sans-serif;color:#1b2433">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border:1px solid #e3e7ee;border-radius:14px;overflow:hidden">
<div style="background:#2563eb;color:#fff;padding:16px 20px"><div style="font-size:12px;opacity:.85">Gestión de Personal</div><div style="font-size:19px;font-weight:700;text-transform:capitalize">${esc(dayTitle)}</div></div>
<div style="padding:8px 20px 16px">
${sections.map(([title, items, h]) => `<h3 style="font-size:14px;margin:16px 0 6px">${title} (${items.length})</h3><ul style="margin:0;padding-left:18px;line-height:1.6;font-size:14px">${items.map((x) => `<li>${h(x)}</li>`).join('')}</ul>`).join('\n')}
${appUrl ? `<p style="margin:20px 0 4px"><a href="${esc(appUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:9px 16px;border-radius:9px;font-weight:600;font-size:14px">Abrir la app</a></p>` : ''}
</div></div>
<p style="font-size:11.5px;color:#667085;text-align:center;margin-top:12px">Resumen automático diario. Solo llega si hay tareas vencidas, tareas para hoy o solicitudes por aprobar.</p>
</div></body></html>`;

  const text = [`Gestión de Personal · ${dayTitle}`, ...sections.map(([title, items, , t]) => `\n${title} (${items.length})\n${items.map((x) => `- ${t(x)}`).join('\n')}`), appUrl ? `\nAbrir la app: ${appUrl}` : ''].join('\n');
  return { empty, subject, html, text, counts };
}

/** Fecha de hoy (AAAA-MM-DD) en Argentina, sin depender de la zona horaria del servidor. */
export function todayInArgentina(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
