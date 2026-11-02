import { analyzeEmployee, summarize, ISSUE_LABELS, INFO_LABELS } from './engine.js';
import { punchesByLegajo } from './store.js';
import { DAY, keyToTs, dateKey, fmtTime, fmtDate, WEEKDAYS_SHORT, weekday } from './time.js';

export const STATUS_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'incidencias', label: 'Con incidencias' },
  { id: 'tarde', label: 'Llegadas tarde' },
  { id: 'anticipada', label: 'Salidas anticipadas' },
  { id: 'incompleto', label: 'Incompletos' },
  { id: 'ausente', label: 'Ausencias' },
  { id: 'fuera', label: 'Fuera de horario' },
  { id: 'ok', label: 'Cumplidos' },
];

function rowMatches(r, status) {
  switch (status) {
    case 'todos': return true;
    case 'incidencias': return r.issues.length > 0;
    case 'incompleto': return r.issues.includes('sin_ingreso') || r.issues.includes('sin_egreso');
    case 'ok': return r.issues.length === 0 && (r.entry || r.exit);
    default: return r.issues.includes(status);
  }
}

export function computeReport(state, { from, to, estId = '', sector = '', q = '', status = 'todos' }) {
  const byLeg = punchesByLegajo(state.punches);
  const holidays = new Map(state.holidays.map((h) => [h.date, h.name]));
  const schedById = Object.fromEntries(state.schedules.map((s) => [s.id, s]));
  const coverage = {};
  for (const f of state.files) {
    if (!f.from) continue;
    (coverage[f.estId] ||= []).push([f.from, f.to]);
  }
  const covered = (e, dk) => (coverage[e] || []).some(([a, b]) => dk >= a && dk <= b);
  const lo = from ? keyToTs(from) - DAY : -Infinity;
  const hi = to ? keyToTs(to) + 2 * DAY : Infinity;
  const needle = q.trim().toLowerCase();

  const legajos = new Set([...byLeg.keys(), ...Object.values(state.employees).filter((e) => e.scheduleId).map((e) => e.legajo)]);
  const out = [];
  for (const l of legajos) {
    const emp = state.employees[l] || { legajo: l, name: '', sector: '', scheduleId: '' };
    if (sector && (emp.sector || '') !== sector) continue;
    if (needle && !`${emp.legajo} ${emp.name}`.toLowerCase().includes(needle)) continue;
    const all = byLeg.get(l) || [];
    const ests = new Set(all.map((p) => p.e));
    if (estId && !ests.has(estId)) continue;
    const sch = schedById[emp.scheduleId] || null;
    const punches = all.filter((p) => p.t >= lo && p.t < hi);
    let rows = analyzeEmployee({
      punches,
      schedule: sch,
      settings: state.settings,
      holidays,
      leaves: state.leaves.filter((x) => x.legajo === l),
      from,
      to,
      isCovered: (dk, est) => (est ? [est] : [...ests]).some((e) => covered(e, dk)),
    });
    if (estId) rows = rows.filter((r) => !r.est || r.est === estId);
    const summary = summarize(rows);
    const shown = rows.filter((r) => rowMatches(r, status));
    if (!rows.length || (status !== 'todos' && !shown.length)) continue;
    out.push({ emp, sch, rows: shown, allRows: rows, summary, ests: [...ests] });
  }
  out.sort((a, b) => (a.emp.name || '~').localeCompare(b.emp.name || '~', 'es') || Number(a.emp.legajo) - Number(b.emp.legajo));
  const total = summarize(out.flatMap((x) => x.allRows));
  return { list: out, total };
}

export function statusText(r) {
  const parts = r.issues.map((i) => ISSUE_LABELS[i]);
  if (r.issues.includes('tarde')) parts[r.issues.indexOf('tarde')] += ` (${r.lateMin} min)`;
  if (r.issues.includes('anticipada')) parts[r.issues.indexOf('anticipada')] += ` (${r.earlyMin} min)`;
  if (!parts.length) parts.push(r.entry || r.exit ? 'Cumplido' : '');
  return parts.filter(Boolean).join(' · ');
}

export function buildExportSheets(report, state) {
  const estName = (id) => state.establishments[id]?.name || '';
  const detail = [[
    'Legajo', 'Nombre', 'Sector', 'Horario', 'Establecimiento', 'Fecha', 'Día', 'Turno esperado', 'Ingreso', 'Egreso',
    'Fecha egreso', 'Horas trabajadas', 'Horas esperadas', 'Tarde (min)', 'Salida anticipada (min)', 'Extra (min)', 'Estado', 'Observaciones',
  ]];
  const summary = [[
    'Legajo', 'Nombre', 'Sector', 'Horario', 'Turnos', 'Cumplimiento %', 'Llegadas tarde', 'Minutos tarde',
    'Salidas anticipadas', 'Minutos anticipados', 'Incompletos', 'Ausencias', 'Fuera de horario', 'Horas trabajadas', 'Horas esperadas', 'Horas extra',
  ]];
  const h = (m) => Math.round((m / 60) * 100) / 100;
  for (const { emp, sch, rows, summary: s } of report.list) {
    summary.push([
      Number(emp.legajo), emp.name, emp.sector, sch?.name || 'Sin horario', s.turnos, s.cumplimiento ?? '', s.tarde, s.tardeMin,
      s.anticipada, s.anticipadaMin, s.incompleto, s.ausente, s.fuera, h(s.worked), h(s.expected), h(s.extra),
    ]);
    for (const r of rows) {
      const obs = [
        ...r.info.filter((i) => i !== 'sin_horario').map((i) => (i === 'feriado' ? `Feriado: ${r.holidayName}` : i === 'licencia' ? `Licencia: ${r.leaveType}` : INFO_LABELS[i])),
        r.mids.length ? `Fichadas intermedias: ${r.mids.map((m) => fmtTime(m.t)).join(', ')}` : '',
      ].filter(Boolean).join(' · ');
      detail.push([
        Number(emp.legajo), emp.name, emp.sector, sch?.name || 'Sin horario', estName(r.est), fmtDate(r.date), WEEKDAYS_SHORT[weekday(r.date)],
        r.inst ? r.inst.label : '', r.entry ? fmtTime(r.entry.t) : '', r.exit ? fmtTime(r.exit.t) : '',
        r.exit ? fmtDate(dateKey(r.exit.t)) : '', r.workedMin ? h(r.workedMin) : '', r.expectedMin ? h(r.expectedMin) : '',
        r.lateMin || '', r.earlyMin || '', r.extraMin || '', statusText(r), obs,
      ]);
    }
  }
  return [{ name: 'Resumen', rows: summary }, { name: 'Detalle', rows: detail }];
}
