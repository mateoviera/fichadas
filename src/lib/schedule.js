// Textos cortos para describir un horario (ej.: "Lun 14:00–17:30 · Mié a Vie 09:00–16:00").
import { endOffset } from './engine.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function daysText(days = [], long = false) {
  const N = long ? LONG : SHORT;
  const ds = ORDER.filter((d) => days.includes(d));
  if (!ds.length) return '';
  if (ds.length === 7) return 'Todos los días';
  const name = (i) => N[ORDER[i]];
  // tramos consecutivos: Lun a Vie
  const idx = ds.map((d) => ORDER.indexOf(d));
  const runs = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  const txt = runs.map(([a, b]) => (a === b ? name(a) : b === a + 1 ? `${name(a)}, ${name(b)}` : `${name(a)} a ${name(b)}`)).join(', ');
  return long ? txt.replace(/(?<=.)\b(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)\b/g, (d) => d.toLowerCase()) : txt;
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

/**
 * Texto para mandar por WhatsApp (negritas con *asteriscos*). Junta los bloques que tienen los mismos días:
 * «• Lunes a viernes: 08:30 a 12:30 y 16:30 a 20:30».
 */
export function scheduleWhatsapp(sch, person, estName) {
  if (!sch) return '';
  const hours = (b) => {
    const off = endOffset(b);
    return `${b.start} a ${b.end}${off === 1 ? ' (del día siguiente)' : off === 2 ? ' (a los 2 días)' : ''}`;
  };
  const where = (bs) => {
    const ests = [...new Set(bs.map((b) => b.est).filter(Boolean))];
    return estName && ests.length ? ` (${ests.map(estName).join(', ')})` : '';
  };
  const lines = [`*Horario${person ? ` de ${person}` : ''}*`];
  if (sch.type === 'rotativo') {
    if (sch.split) lines.push(`Turno cortado: ${sch.blocks.map(hours).join(' y ')}${where(sch.blocks)}`);
    else lines.push('Rotativo, turnos:', ...sch.blocks.map((b) => `• ${hours(b)}${where([b])}`));
    lines.push('Francos: 1, 2, 1 y 2 por semana');
  } else {
    const groups = new Map();
    for (const b of sch.blocks) {
      const key = ORDER.filter((d) => (b.days || []).includes(d)).join(',');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    }
    const first = (k) => ORDER.indexOf(Number(k.split(',')[0]));
    for (const [key, bs] of [...groups].sort((a, b) => first(a[0]) - first(b[0]))) {
      if (!key) continue;
      const sorted = [...bs].sort((a, b) => a.start.localeCompare(b.start));
      lines.push(`• ${daysText(key.split(',').map(Number), true)}: ${sorted.map(hours).join(' y ')}${where(sorted)}`);
    }
  }
  return lines.join('\n');
}
