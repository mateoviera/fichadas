// Gestión del personal: antigüedad, días de vacaciones según la LCT y superposición de vacaciones.
import { eachDay, keyToTs, DAY, weekday, todayKey } from './time.js';

export const VACATION = 'Vacaciones';

/** Antigüedad entre la fecha de ingreso y `at` (ambas 'YYYY-MM-DD'). */
export function seniority(hireDate, at = todayKey()) {
  if (!hireDate || hireDate > at) return null;
  const [y1, m1, d1] = hireDate.split('-').map(Number);
  const [y2, m2, d2] = at.split('-').map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12, totalMonths: months };
}

export function fmtSeniority(s) {
  if (!s) return '—';
  const y = s.years ? `${s.years} ${s.years === 1 ? 'año' : 'años'}` : '';
  const m = s.months ? `${s.months} ${s.months === 1 ? 'mes' : 'meses'}` : '';
  return [y, m].filter(Boolean).join(' ') || 'menos de 1 mes';
}

/** Días hábiles (lunes a viernes) entre dos fechas, inclusive. */
function workdays(from, to) {
  let n = 0;
  for (const dk of eachDay(from, to)) {
    const w = weekday(dk);
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/**
 * Días de vacaciones (corridos) que corresponden por el año `year`, según la Ley de Contrato de Trabajo:
 * - art. 150: antigüedad al 31/12 del año: < 5 años 14 días, 5 a 10 → 21, 10 a 20 → 28, más de 20 → 35.
 * - art. 153: si no trabajó al menos la mitad de los días hábiles del año, 1 día cada 20 trabajados.
 * Devuelve { days, rule } o null si no hay fecha de ingreso.
 */
export function vacationDays(hireDate, year) {
  if (!hireDate) return null;
  const end = `${year}-12-31`;
  if (hireDate > end) return { days: 0, rule: 'Ingresa después de este año' };
  const s = seniority(hireDate, end);
  const start = `${year}-01-01`;
  if (hireDate > start) {
    const worked = workdays(hireDate, end);
    const total = workdays(start, end);
    if (worked < total / 2) return { days: Math.floor(worked / 20), rule: `Ingresó en ${year}: 1 día cada 20 trabajados (${worked} días hábiles)` };
  }
  const y = s.totalMonths / 12;
  const days = y < 5 ? 14 : y < 10 ? 21 : y < 20 ? 28 : 35;
  return { days, rule: `${fmtSeniority(s)} al 31/12/${year}` };
}

/** Días corridos de una licencia (inclusive). */
export function leaveLength(l) {
  return Math.round((keyToTs(l.to || l.from) - keyToTs(l.from)) / DAY) + 1;
}

/** Orden de prioridad: más antiguo primero (sin fecha de ingreso, al final), y a igual antigüedad, legajo menor. */
export function seniorityCompare(a, b) {
  const ha = a?.hireDate || '9999-99-99';
  const hb = b?.hireDate || '9999-99-99';
  return ha.localeCompare(hb) || Number(a?.legajo) - Number(b?.legajo);
}

/**
 * Superposición de vacaciones dentro de cada grupo.
 * En cada día, si hay más personas de vacaciones que el máximo del grupo, conservan el lugar las de mayor
 * antigüedad y las demás quedan "en conflicto". No cuentan las rechazadas ni las aprobadas como excepción.
 * Devuelve Map(leaveId -> { days: n° de días en conflicto, blockedBy: Set(legajo), displaces: Set(legajo) }).
 */
export function vacationConflicts(state) {
  const groups = new Map((state.vacGroups || []).map((g) => [g.id, g]));
  const result = new Map();
  const byGroup = new Map();
  for (const l of state.leaves) {
    if (l.type !== VACATION || l.status === 'rechazada' || l.exception) continue;
    const emp = state.employees[l.legajo];
    const g = emp && groups.get(emp.vacGroup);
    if (!g || !(Number(g.max) > 0)) continue;
    if (!byGroup.has(g.id)) byGroup.set(g.id, []);
    byGroup.get(g.id).push(l);
  }
  const entry = (id) => {
    if (!result.has(id)) result.set(id, { days: 0, blockedBy: new Set(), displaces: new Set() });
    return result.get(id);
  };
  for (const [gid, list] of byGroup) {
    const max = Number(groups.get(gid).max);
    const days = new Map();
    for (const l of list) {
      for (const dk of eachDay(l.from, l.to || l.from)) {
        if (!days.has(dk)) days.set(dk, []);
        days.get(dk).push(l);
      }
    }
    for (const ls of days.values()) {
      if (ls.length <= max) continue;
      ls.sort((a, b) => seniorityCompare(state.employees[a.legajo], state.employees[b.legajo]));
      const keep = ls.slice(0, max);
      for (const l of ls.slice(max)) {
        // Si es la misma persona con dos pedidos, no es conflicto entre personas.
        const others = keep.filter((k) => k.legajo !== l.legajo);
        if (!others.length) continue;
        const e = entry(l.id);
        e.days++;
        others.forEach((k) => {
          e.blockedBy.add(k.legajo);
          entry(k.id).displaces.add(l.legajo);
        });
      }
    }
  }
  for (const [id, e] of result) if (!e.days && !e.displaces.size) result.delete(id);
  return result;
}

/** Saldo de vacaciones de una persona en un año: corresponden, aprobadas, pendientes y restantes. */
export function vacationBalance(emp, leaves, year) {
  const corr = vacationDays(emp?.hireDate, year);
  const mine = leaves.filter((l) => l.legajo === emp?.legajo && l.type === VACATION && l.from.startsWith(String(year)));
  const sum = (st) => mine.filter((l) => l.status === st || (st === 'aprobada' && !l.status)).reduce((a, l) => a + leaveLength(l), 0);
  const approved = sum('aprobada');
  const pending = sum('pendiente');
  return { corr, approved, pending, left: corr ? corr.days - approved : null };
}
