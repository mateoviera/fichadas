// Exportación mensual de ausencias: persona, tipo, fechas, días del mes, si es con goce de sueldo y la nota.
import { leaveLength, isPaid, isFullDay, requestMinutes } from './personal.js';
import { fmtDuration } from './time.js';

const fmtK = (k) => (k ? k.split('-').reverse().join('/') : '');
const lastDay = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Solicitudes aprobadas que tocan el mes (AAAA-MM), con las fechas y los días que caen dentro del mes. */
export function monthLeaves(state, month) {
  const from = `${month}-01`;
  const to = lastDay(month);
  const name = (l) => state.employees[l]?.name || '';
  return state.leaves
    .filter((l) => (l.status || 'aprobada') === 'aprobada' && l.from <= to && (l.to || l.from) >= from)
    .map((l) => {
      const a = l.from < from ? from : l.from;
      const b = (l.to || l.from) > to ? to : l.to || l.from;
      return { l, a, b, days: isFullDay(l) ? leaveLength({ from: a, to: b }) : 0 };
    })
    .sort((x, y) => name(x.l.legajo).localeCompare(name(y.l.legajo), 'es') || x.a.localeCompare(y.a));
}

/** Hoja de Excel del mes: una fila por ausencia. Si cruza de mes, cuenta solo los días de este mes. */
export function monthSheet(state, month) {
  const emp = (l) => state.employees[l] || {};
  return {
    name: 'Ausencias',
    rows: [
      ['Legajo', 'Apellido y nombre', 'Tipo', 'Desde', 'Hasta', 'Días', 'Con goce de sueldo', 'Nota'],
      ...monthLeaves(state, month).map(({ l, a, b, days }) => [
        Number(l.legajo) || l.legajo,
        emp(l.legajo).name || '',
        l.type,
        fmtK(a),
        isFullDay(l) ? fmtK(b) : `${l.startTime}–${l.endTime}`,
        isFullDay(l) ? days : `${fmtDuration(requestMinutes(l))} h`,
        isPaid(l) ? 'Sí' : 'No',
        l.note || '',
      ]),
    ],
  };
}
