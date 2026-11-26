// Tareas y recordatorios: propios o asociados a una persona (ej. «avisarle que pase a buscar su alta»).
import { addDays, fmtDate, fmtDateShort } from './time.js';

/** Grupos en los que se muestran las tareas pendientes, en este orden. */
export const BUCKETS = [
  ['vencidas', 'Vencidas', 'bad'],
  ['hoy', 'Hoy', 'warn'],
  ['semana', 'Próximos 7 días', 'info'],
  ['despues', 'Más adelante', 'neutral'],
  ['sinfecha', 'Sin fecha', 'neutral'],
];

export function bucketOf(t, today) {
  if (!t.due) return 'sinfecha';
  if (t.due < today) return 'vencidas';
  if (t.due === today) return 'hoy';
  if (t.due <= addDays(today, 7)) return 'semana';
  return 'despues';
}

/** Orden: con fecha primero (la más próxima arriba), después sin fecha por fecha de carga. */
export function taskCompare(a, b) {
  if (a.due && b.due) return a.due.localeCompare(b.due) || (a.createdAt || 0) - (b.createdAt || 0);
  if (a.due) return -1;
  if (b.due) return 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

/** Pendientes que ya hay que atender (vencidas o de hoy): se muestran en el menú. */
export function dueCount(tasks = [], today) {
  return tasks.filter((t) => !t.done && t.due && t.due <= today).length;
}

/** «Hoy», «Mañana», «Vie 30/10» (esta semana) o «30/10/2026». */
export function dueText(due, today) {
  if (!due) return '';
  if (due === today) return 'Hoy';
  if (due === addDays(today, 1)) return 'Mañana';
  if (due === addDays(today, -1)) return 'Ayer';
  if (due > today && due <= addDays(today, 6)) return fmtDateShort(due);
  return fmtDate(due);
}
