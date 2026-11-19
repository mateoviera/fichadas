// Gestión del personal: antigüedad, días de vacaciones según la LCT y superposición de vacaciones.
import { eachDay, keyToTs, DAY, weekday, todayKey } from './time.js';

export const VACATION = 'Vacaciones';
export const HOURS = 'Permiso por horas';

/**
 * Tipos de solicitud. `fullDay`: ocupa días completos (cuenta para la disponibilidad del grupo y
 * excusa ausencias en Fichadas). Los permisos por horas solo quedan registrados.
 */
export const REQUEST_TYPES = [
  { id: VACATION, tone: 'vac', fullDay: true },
  { id: 'Día particular', tone: 'day', fullDay: true },
  { id: 'Franco compensatorio', tone: 'day', fullDay: true },
  { id: 'Licencia médica', tone: 'med', fullDay: true },
  { id: 'Licencia por examen', tone: 'other', fullDay: true },
  { id: 'Capacitación', tone: 'other', fullDay: true },
  { id: HOURS, tone: 'hours', fullDay: false },
  { id: 'Otra', tone: 'other', fullDay: true },
];
const TYPE = Object.fromEntries(REQUEST_TYPES.map((t) => [t.id, t]));
export const typeInfo = (id) => TYPE[id] || { id, tone: 'other', fullDay: true };
export const isFullDay = (l) => typeInfo(l.type).fullDay;

/** "19/11/2026 14:32 · nombre" para mostrar la última modificación. */
export function fmtStamp(x) {
  if (!x?.updatedAt) return '';
  const d = new Date(x.updatedAt);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}${x.updatedBy ? ` · ${x.updatedBy}` : ''}`;
}

/** Horas de un permiso por horas (en minutos). */
export function requestMinutes(l) {
  if (!l.startTime || !l.endTime) return 0;
  const [h1, m1] = l.startTime.split(':').map(Number);
  const [h2, m2] = l.endTime.split(':').map(Number);
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
}

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
 * Superposición de solicitudes de días completos (vacaciones, días particulares, licencias…) dentro de cada grupo.
 * En cada día, si hay más personas de vacaciones que el máximo del grupo, conservan el lugar las de mayor
 * antigüedad y las demás quedan "en conflicto". No cuentan las rechazadas ni las aprobadas como excepción.
 * Devuelve Map(leaveId -> { days: n° de días en conflicto, blockedBy: Set(legajo), displaces: Set(legajo) }).
 */
export function vacationConflicts(state) {
  const groups = new Map((state.vacGroups || []).map((g) => [g.id, g]));
  const result = new Map();
  const byGroup = new Map();
  for (const l of state.leaves) {
    if (!isFullDay(l) || l.status === 'rechazada' || l.exception) continue;
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

/**
 * Revisa una solicitud antes de guardarla o aprobarla. Devuelve la lista de motivos por los que
 * no debería permitirse (vacía si está todo bien). Cada motivo: { title, detail }.
 * `draft` = { id?, legajo, type, from, to, status }.
 */
export function checkRequest(state, draft) {
  const out = [];
  if (!draft.legajo || !draft.from || draft.status === 'rechazada') return out;
  const emps = state.employees;
  const emp = emps[draft.legajo] || { legajo: draft.legajo };
  const to = draft.to || draft.from;
  const nameOf = (l) => emps[l]?.name || `legajo ${l}`;
  const overlaps = (l) => l.from <= to && (l.to || l.from) >= draft.from;
  const others = state.leaves.filter((l) => l.id !== draft.id && l.status !== 'rechazada' && overlaps(l));

  if (emp.hireDate && draft.from < emp.hireDate) out.push({ title: 'Antes de la fecha de ingreso', detail: `Ingresó el ${fmtKey(emp.hireDate)}.` });
  if (emp.exitDate && to > emp.exitDate) out.push({ title: 'Después de la fecha de baja', detail: `Tiene baja el ${fmtKey(emp.exitDate)}.` });

  const own = others.filter((l) => l.legajo === draft.legajo);
  if (own.length) {
    out.push({ title: 'Ya tiene otra solicitud esos días', detail: own.map((l) => `${l.type} del ${fmtKey(l.from)} al ${fmtKey(l.to || l.from)}`).join(' · ') });
  }

  // Disponibilidad del grupo: cuántas personas del grupo ya faltan esos días.
  const group = (state.vacGroups || []).find((g) => g.id === emp.vacGroup);
  if (group && Number(group.max) > 0 && typeInfo(draft.type).fullDay) {
    const mates = others.filter((l) => l.legajo !== draft.legajo && emps[l.legajo]?.vacGroup === group.id && isFullDay(l));
    const busy = new Map();
    for (const dk of eachDay(draft.from, to)) {
      const that = mates.filter((l) => dk >= l.from && dk <= (l.to || l.from));
      if (that.length >= Number(group.max)) busy.set(dk, that);
    }
    if (busy.size) {
      const who = [...new Set([...busy.values()].flat().map((l) => l.legajo))];
      const senior = who.filter((l) => seniorityCompare(emps[l], emp) < 0);
      const junior = who.filter((l) => !senior.includes(l));
      const days = [...busy.keys()];
      const parts = [`En el grupo «${group.name}» ${Number(group.max) === 1 ? 'no puede faltar más de una persona' : `pueden faltar hasta ${group.max} personas`} a la vez.`];
      parts.push(`Se pisa ${days.length === 1 ? `el ${fmtKey(days[0])}` : `${days.length} días (del ${fmtKey(days[0])} al ${fmtKey(days[days.length - 1])})`} con ${who.map(nameOf).join(', ')}.`);
      if (senior.length) parts.push(`${senior.map(nameOf).join(', ')} ${senior.length === 1 ? 'tiene' : 'tienen'} más antigüedad y prioridad.`);
      if (junior.length) parts.push(`${fmtNames(junior, nameOf)} ${junior.length === 1 ? 'tiene' : 'tienen'} menos antigüedad: ${junior.length === 1 ? 'su solicitud quedaría' : 'sus solicitudes quedarían'} desplazada${junior.length === 1 ? '' : 's'}.`);
      out.push({ title: 'Se pisa con otras personas del grupo', detail: parts.join(' ') });
    }
  }

  if (draft.type === VACATION) {
    const year = Number(draft.from.slice(0, 4));
    const corr = vacationDays(emp.hireDate, year);
    if (!corr) {
      out.push({ title: 'No se pueden validar los días', detail: 'Falta la fecha de ingreso para calcular cuántos días de vacaciones le corresponden.' });
    } else {
      const used = state.leaves
        .filter((l) => l.id !== draft.id && l.legajo === draft.legajo && l.type === VACATION && l.status !== 'rechazada' && l.from.startsWith(String(year)))
        .reduce((a, l) => a + leaveLength(l), 0);
      const want = leaveLength({ from: draft.from, to });
      if (used + want > corr.days) {
        out.push({ title: 'Supera los días de vacaciones', detail: `Le corresponden ${corr.days} días en ${year}; ya tiene ${used} cargados y pide ${want} (se pasa por ${used + want - corr.days}).` });
      }
    }
  }
  return out;
}

const fmtKey = (k) => k.split('-').reverse().join('/');
const fmtNames = (legs, nameOf) => legs.map(nameOf).join(', ');
