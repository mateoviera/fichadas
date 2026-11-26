// Ausencias del mes para liquidación de sueldos: con goce / sin goce de sueldo, días que caen en el mes.
import { leaveLength, isPaid, isFullDay, requestMinutes, HOURS, VACATION, UNPAID } from './personal.js';
import { fmtDuration } from './time.js';

const fmtK = (k) => (k ? k.split('-').reverse().join('/') : '');
const lastDay = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Solicitudes aprobadas que tocan el mes (AAAA-MM), con los días que caen dentro del mes. */
export function monthLeaves(state, month) {
  const from = `${month}-01`;
  const to = lastDay(month);
  return state.leaves
    .filter((l) => (l.status || 'aprobada') === 'aprobada' && l.from <= to && (l.to || l.from) >= from)
    .map((l) => {
      const a = l.from < from ? from : l.from;
      const b = (l.to || l.from) > to ? to : l.to || l.from;
      return { l, a, b, days: isFullDay(l) ? leaveLength({ from: a, to: b }) : 0 };
    })
    .sort((x, y) => (state.employees[x.l.legajo]?.name || '').localeCompare(state.employees[y.l.legajo]?.name || '', 'es') || x.a.localeCompare(y.a));
}

/** Totales del mes: días sin goce y cuántas personas. */
export function unpaidSummary(state, month) {
  const rows = monthLeaves(state, month).filter((r) => !isPaid(r.l));
  return { days: rows.reduce((n, r) => n + r.days, 0), people: new Set(rows.map((r) => r.l.legajo)).size };
}

/** Hojas de Excel: detalle por solicitud y resumen por persona. */
export function liquidacionSheets(state, month) {
  const rows = monthLeaves(state, month);
  const emp = (l) => state.employees[l] || {};
  const detail = [
    ['Legajo', 'Apellido y nombre', 'CUIL', 'Sector', 'Tipo', 'Con goce de sueldo', 'Desde', 'Hasta', 'Días en el mes', 'Horas', 'Período completo', 'Excepción', 'Nota'],
    ...rows.map(({ l, a, b, days }) => [
      Number(l.legajo) || l.legajo, emp(l.legajo).name || '', emp(l.legajo).cuil || '', emp(l.legajo).sector || '', l.type,
      isPaid(l) ? 'Sí' : 'NO', fmtK(a), fmtK(b), isFullDay(l) ? days : '',
      l.type === HOURS ? `${l.startTime}–${l.endTime} (${fmtDuration(requestMinutes(l))} h)` : '',
      isFullDay(l) ? `${fmtK(l.from)} al ${fmtK(l.to || l.from)} (${leaveLength(l)} d)` : fmtK(l.from),
      l.exception ? 'Sí' : '', l.note || '',
    ]),
  ];
  const by = new Map();
  for (const { l, days } of rows) {
    if (!by.has(l.legajo)) by.set(l.legajo, { vac: 0, unpaid: 0, med: 0, otherPaid: 0, hoursMin: 0 });
    const t = by.get(l.legajo);
    if (l.type === HOURS) t.hoursMin += requestMinutes(l);
    else if (l.type === VACATION) t.vac += days;
    else if (l.type === UNPAID || !isPaid(l)) t.unpaid += days;
    else if (l.type === 'Licencia médica') t.med += days;
    else t.otherPaid += days;
  }
  const summary = [
    ['Legajo', 'Apellido y nombre', 'CUIL', 'Días de vacaciones', 'Días SIN goce de sueldo', 'Días de licencia médica', 'Otros días con goce', 'Permisos por horas'],
    ...[...by].sort((x, y) => (emp(x[0]).name || '').localeCompare(emp(y[0]).name || '', 'es')).map(([leg, t]) => [
      Number(leg) || leg, emp(leg).name || '', emp(leg).cuil || '', t.vac || '', t.unpaid || '', t.med || '', t.otherPaid || '', t.hoursMin ? `${fmtDuration(t.hoursMin)} h` : '',
    ]),
  ];
  return [{ name: 'Resumen por persona', rows: summary }, { name: 'Detalle', rows: detail }];
}
