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

/** «16:00» → «16hs», «08:30» → «8:30hs». */
const hs = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''}hs`;
};

/** Días con nombre completo: «Lunes a Viernes», «Lunes y Viernes», «Lunes, Miércoles y Viernes». */
function daysLong(days) {
  const idx = ORDER.map((d, i) => (days.includes(d) ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 7) return 'Todos los días';
  const runs = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  const parts = runs.flatMap(([x, y]) => (y - x >= 2 ? [`${LONG[ORDER[x]]} a ${LONG[ORDER[y]]}`] : y > x ? [LONG[ORDER[x]], LONG[ORDER[y]]] : [LONG[ORDER[x]]]));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0] || '';
}

/**
 * Texto para mandar por WhatsApp, separado por establecimiento:
 *   1070:
 *   Lunes de 16hs a 17hs
 *   Lunes y Viernes de 9hs a 14hs
 */
export function scheduleWhatsapp(sch, person, estName) {
  if (!sch) return '';
  const range = (b) => {
    const off = endOffset(b);
    return `de ${hs(b.start)} a ${hs(b.end)}${off === 1 ? ' (del día siguiente)' : off === 2 ? ' (a los 2 días)' : ''}`;
  };
  // Agrupa por establecimiento, respetando el orden en que aparecen.
  const byEst = new Map();
  for (const b of sch.blocks) {
    const k = b.est || '';
    if (!byEst.has(k)) byEst.set(k, []);
    byEst.get(k).push(b);
  }
  const named = [...byEst.keys()].some(Boolean);
  const sections = [];
  for (const [est, bs] of byEst) {
    const lines = [];
    if (sch.type === 'rotativo') {
      if (sch.split) lines.push(`Turno cortado ${bs.map(range).join(' y ')}`);
      else lines.push(...bs.map((b) => `Turno ${range(b)}`));
    } else {
      const groups = new Map();
      for (const b of bs) {
        const key = ORDER.filter((d) => (b.days || []).includes(d)).join(',');
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(b);
      }
      const first = (k) => ORDER.indexOf(Number(k.split(',')[0]));
      for (const [key, g] of [...groups].sort((x, y) => first(x[0]) - first(y[0]))) {
        const sorted = [...g].sort((x, y) => x.start.localeCompare(y.start));
        lines.push(`${daysLong(key.split(',').map(Number))} ${sorted.map(range).join(' y ')}`);
      }
    }
    if (!lines.length) continue;
    const title = named ? `${(est && estName && estName(est)) || 'Sin establecimiento'}:` : '';
    sections.push([title, ...lines].filter(Boolean).join('\n'));
  }
  if (sch.type === 'rotativo') sections.push('Francos: 1, 2, 1 y 2 por semana');
  return sections.join('\n\n');
}
