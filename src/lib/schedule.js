// Textos cortos para describir un horario (ej.: "Lun 14:00–17:30 · Mié a Vie 09:00–16:00").
import { endOffset } from './engine.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function daysText(days = []) {
  const ds = ORDER.filter((d) => days.includes(d));
  if (!ds.length) return '';
  if (ds.length === 7) return 'Todos los días';
  // tramos consecutivos: Lun a Vie
  const idx = ds.map((d) => ORDER.indexOf(d));
  const runs = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs.map(([a, b]) => (a === b ? SHORT[ORDER[a]] : b === a + 1 ? `${SHORT[ORDER[a]]}, ${SHORT[ORDER[b]]}` : `${SHORT[ORDER[a]]} a ${SHORT[ORDER[b]]}`)).join(', ');
}

export function blockText(b, estName) {
  const off = endOffset(b);
  const end = off === 0 ? b.end : `${b.end} ${off === 1 ? '(día sig.)' : '(+2 días)'}`;
  const est = estName && b.est ? ` en ${estName(b.est)}` : '';
  return `${b.start}–${end}${est}`;
}

/** Lista de renglones legibles de un horario. */
export function scheduleLines(sch, estName) {
  if (!sch) return [];
  if (sch.type === 'rotativo') return [`${sch.split ? 'Rotativo cortado' : 'Rotativo'}: ${sch.blocks.map((b) => blockText(b, estName)).join(' · ')}`];
  return sch.blocks.map((b) => `${daysText(b.days)} ${blockText(b, estName)}`);
}

/** Resumen de una línea, con "+N" si hay más bloques. */
export function scheduleSummary(sch, max = 2) {
  if (!sch) return '';
  const lines = scheduleLines(sch);
  if (sch.type === 'rotativo') return sch.split ? 'Rotativo cortado' : 'Rotativo';
  return lines.slice(0, max).join(' · ') + (lines.length > max ? ` · +${lines.length - max} más` : '');
}
