// Exportación de solicitudes a Excel: persona, tipo, fechas, días, si es con goce de sueldo y la nota.
import { leaveLength, isPaid, isFullDay, requestMinutes } from './personal.js';
import { fmtDuration } from './time.js';

const fmtK = (k) => (k ? k.split('-').reverse().join('/') : '');
const STATUS = { aprobada: 'Aprobada', pendiente: 'Pendiente', rechazada: 'Rechazada' };

/** Una hoja con una fila por solicitud, en el orden recibido. */
export function leavesSheet(state, leaves) {
  const emp = (l) => state.employees[l] || {};
  return {
    name: 'Ausencias',
    rows: [
      ['Legajo', 'Apellido y nombre', 'Tipo', 'Desde', 'Hasta', 'Días', 'Con goce de sueldo', 'Nota', 'Estado'],
      ...leaves.map((l) => [
        Number(l.legajo) || l.legajo,
        emp(l.legajo).name || '',
        l.type,
        fmtK(l.from),
        isFullDay(l) ? fmtK(l.to || l.from) : `${l.startTime}–${l.endTime}`,
        isFullDay(l) ? leaveLength(l) : `${fmtDuration(requestMinutes(l))} h`,
        isPaid(l) ? 'Sí' : 'No',
        l.note || '',
        STATUS[l.status || 'aprobada'],
      ]),
    ],
  };
}
