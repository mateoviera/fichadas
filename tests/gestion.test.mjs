// Pruebas de guardias de 48 h, cupo mensual de rotativos y gestión de vacaciones (datos inventados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEmployee, summarize, rotativoQuota, blockDuration } from '../src/lib/engine.js';
import { computeReport } from '../src/lib/report.js';
import { vacationDays, vacationConflicts, seniority, vacationBalance } from '../src/lib/personal.js';
import { toTs } from '../src/lib/time.js';

const at = (y, m, d, h, mi = 0) => toTs(y, m, d, h, mi);

const NURSE = { id: 'enf', type: 'rotativo', blocks: [
  { start: '06:00', end: '14:00' }, { start: '14:00', end: '22:00' }, { start: '22:00', end: '06:00' },
] };

test('guardia de 48 h: domingo 22:00 → martes 22:00 es un solo turno', () => {
  const sch = { id: 'g48', type: 'fijo', blocks: [{ days: [0], start: '22:00', end: '22:00', endDays: 2, est: '' }] };
  assert.equal(blockDuration(sch.blocks[0]), 48 * 60);
  // domingo 1/11/2026
  const punches = [{ e: 'A', t: at(2026, 11, 1, 22, 5) }, { e: 'A', t: at(2026, 11, 3, 21, 58) }];
  const rows = analyzeEmployee({ punches, schedule: sch, from: '2026-11-01', to: '2026-11-07' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-11-01');
  assert.deepEqual(rows[0].issues, []);
  assert.equal(rows[0].workedMin, 48 * 60 - 7);
  assert.equal(rows[0].inst.label, '22:00–22:00 (+2)');
});

test('guardia de 48 h: si no viene, es una sola ausencia', () => {
  const sch = { id: 'g48b', type: 'fijo', blocks: [{ days: [0], start: '22:00', end: '22:00', endDays: 2, est: '' }] };
  const rows = analyzeEmployee({ punches: [], schedule: sch, from: '2026-11-01', to: '2026-11-07' });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].issues, ['ausente']);
});

test('guardia de 24 h sigue igual (22:00 → 22:00 del día siguiente)', () => {
  assert.equal(blockDuration({ start: '22:00', end: '22:00' }), 24 * 60);
  assert.equal(blockDuration({ start: '22:00', end: '06:00' }), 8 * 60);
  assert.equal(blockDuration({ start: '08:00', end: '16:00' }), 8 * 60);
});

test('rotativo: cupo del mes = del 1 al anteúltimo menos 6 francos', () => {
  const nov = rotativoQuota({ schedule: NURSE, from: '2026-11-01', to: '2026-11-30' });
  assert.equal(nov.days, 29 - 6);
  assert.equal(nov.minutes, 23 * 480);
  assert.deepEqual(nov.weeks.map((w) => w.francos), [1, 2, 1, 2]);
  const dic = rotativoQuota({ schedule: NURSE, from: '2026-12-01', to: '2026-12-31' });
  assert.equal(dic.days, 30 - 6);
  const feb = rotativoQuota({ schedule: NURSE, from: '2026-02-01', to: '2026-02-28' });
  assert.equal(feb.days, 27 - 6);
});

test('rotativo: una semana de licencia descuenta los días de esa semana', () => {
  const q = rotativoQuota({ schedule: NURSE, from: '2026-11-01', to: '2026-11-30', isOff: (dk) => dk >= '2026-11-08' && dk <= '2026-11-14' });
  assert.equal(q.days, 23 - 5);
});

test('rotativo en el reporte: esperado = cupo mensual, sin ausencias', () => {
  const punches = [];
  for (let d = 1; d <= 20; d++) punches.push({ e: 'A', l: '5', t: at(2026, 11, d, 6, 0), f: 'f' }, { e: 'A', l: '5', t: at(2026, 11, d, 14, 0), f: 'f' });
  const state = {
    punches, schedules: [NURSE], holidays: [], leaves: [], vacGroups: [],
    employees: { 5: { legajo: '5', name: 'Enfermera', sector: '', scheduleId: 'enf' } },
    files: [{ id: 'f', estId: 'A', from: '2026-11-01', to: '2026-11-30' }], settings: {},
  };
  const { list, total } = computeReport(state, { from: '2026-11-01', to: '2026-11-30' });
  const s = list[0].summary;
  assert.equal(s.quota.days, 23);
  assert.equal(s.expected, 23 * 480);
  assert.equal(s.worked, 20 * 480);
  assert.equal(s.saldo, -3 * 480);
  assert.equal(s.daysWorked, 20);
  assert.equal(s.ausente, 0);
  assert.equal(total.expected, 23 * 480);
});

test('vacaciones según LCT', () => {
  assert.equal(vacationDays('2010-10-21', 2026).days, 28); // 16 años
  assert.equal(vacationDays('2022-03-01', 2026).days, 14); // 4 años
  assert.equal(vacationDays('2021-11-01', 2026).days, 21); // 5 años al 31/12
  assert.equal(vacationDays('2005-01-01', 2026).days, 35); // 21 años
  const nuevo = vacationDays('2026-10-01', 2026); // menos de la mitad del año: 1 día cada 20 hábiles
  assert.equal(nuevo.days, 3);
  assert.equal(vacationDays('', 2026), null);
  assert.deepEqual(seniority('2016-09-21', '2026-11-19'), { years: 10, months: 1, totalMonths: 121 });
});

test('superposición: dentro del grupo tiene prioridad el más antiguo', () => {
  const state = {
    vacGroups: [{ id: 'g', name: 'Guardia', max: 1 }, { id: 'flex', name: '114', max: 0 }],
    employees: {
      10: { legajo: '10', name: 'Antiguo', hireDate: '2010-10-21', vacGroup: 'g' },
      101: { legajo: '101', name: 'Nuevo', hireDate: '2024-12-28', vacGroup: 'g' },
      13: { legajo: '13', name: 'Flex A', hireDate: '2023-03-01', vacGroup: 'flex' },
      47: { legajo: '47', name: 'Flex B', hireDate: '2016-09-21', vacGroup: 'flex' },
    },
    leaves: [
      // el nuevo pidió primero, pero el antiguo tiene prioridad
      { id: 'n', legajo: '101', from: '2027-01-05', to: '2027-01-18', type: 'Vacaciones', status: 'aprobada' },
      { id: 'a', legajo: '10', from: '2027-01-15', to: '2027-01-28', type: 'Vacaciones', status: 'pendiente' },
      { id: 'f1', legajo: '13', from: '2027-01-05', to: '2027-01-18', type: 'Vacaciones', status: 'aprobada' },
      { id: 'f2', legajo: '47', from: '2027-01-05', to: '2027-01-18', type: 'Vacaciones', status: 'aprobada' },
    ],
  };
  const c = vacationConflicts(state);
  assert.deepEqual([...c.get('n').blockedBy], ['10']);
  assert.equal(c.get('n').days, 4); // 15 al 18
  assert.deepEqual([...c.get('a').displaces], ['101']);
  assert.equal(c.get('a').blockedBy.size, 0);
  assert.ok(!c.has('f1') && !c.has('f2'), 'grupo sin control no marca superposición');

  // aprobada como excepción: deja de contar
  state.leaves[0].exception = true;
  assert.equal(vacationConflicts(state).size, 0);

  const bal = vacationBalance(state.employees[101], state.leaves, 2027);
  assert.equal(bal.corr.days, 14);
  assert.equal(bal.approved, 14);
  assert.equal(bal.left, 0);
});

test('vacaciones pendientes no cuentan como licencia en las fichadas', () => {
  const sch = { id: 'lv', type: 'fijo', blocks: [{ days: [1, 2, 3, 4, 5], start: '08:00', end: '16:00', est: '' }] };
  const state = {
    punches: [{ e: 'A', l: '7', t: at(2026, 11, 2, 8, 0), f: 'f' }, { e: 'A', l: '7', t: at(2026, 11, 2, 16, 0), f: 'f' }],
    schedules: [sch], holidays: [], vacGroups: [],
    leaves: [{ id: 'x', legajo: '7', from: '2026-11-03', to: '2026-11-04', type: 'Vacaciones', status: 'pendiente' }],
    employees: { 7: { legajo: '7', name: 'X', sector: '', scheduleId: 'lv' } },
    files: [{ id: 'f', estId: 'A', from: '2026-11-01', to: '2026-11-04' }], settings: {},
  };
  const r1 = computeReport(state, { from: '2026-11-02', to: '2026-11-04' });
  assert.equal(r1.list[0].summary.ausente, 2);
  state.leaves[0].status = 'aprobada';
  const r2 = computeReport(state, { from: '2026-11-02', to: '2026-11-04' });
  assert.equal(r2.list[0].summary.ausente, 0);
  assert.equal(summarize(r2.list[0].allRows).ausente, 0);
});

test('aviso antes de guardar: se pisa en el grupo, supera días y repite fechas', async () => {
  const { checkRequest } = await import('../src/lib/personal.js');
  const state = {
    vacGroups: [{ id: 'enf', name: 'Enfermería', max: 1 }],
    employees: {
      1: { legajo: '1', name: 'Antigua', hireDate: '2012-01-01', vacGroup: 'enf' },
      2: { legajo: '2', name: 'Nueva', hireDate: '2025-03-01', vacGroup: 'enf' },
    },
    leaves: [{ id: 'x', legajo: '1', from: '2027-01-10', to: '2027-01-20', type: 'Licencia médica', status: 'aprobada' }],
  };
  // la nueva pide vacaciones que se pisan con la licencia de la antigua y superan sus 14 días
  const p = checkRequest(state, { legajo: '2', type: 'Vacaciones', from: '2027-01-15', to: '2027-01-31', status: 'aprobada' });
  const titles = p.map((x) => x.title);
  assert.ok(titles.includes('Se pisa con otras personas del grupo'));
  assert.ok(titles.includes('Supera los días de vacaciones'));
  assert.match(p.find((x) => x.title.startsWith('Se pisa')).detail, /Antigua tiene más antigüedad/);
  // la misma persona con dos solicitudes superpuestas
  const own = checkRequest(state, { legajo: '1', type: 'Día particular', from: '2027-01-12', to: '2027-01-12', status: 'pendiente' });
  assert.deepEqual(own.map((x) => x.title), ['Ya tiene otra solicitud esos días']);
  // un permiso por horas no ocupa el lugar del grupo
  assert.deepEqual(checkRequest(state, { legajo: '2', type: 'Permiso por horas', from: '2027-01-12', status: 'aprobada' }), []);
  // rechazada: no se valida
  assert.deepEqual(checkRequest(state, { legajo: '2', type: 'Vacaciones', from: '2027-01-15', to: '2027-01-31', status: 'rechazada' }), []);
});

test('un permiso por horas no excusa la ausencia del día', () => {
  const sch = { id: 'lv2', type: 'fijo', blocks: [{ days: [1, 2, 3, 4, 5], start: '08:00', end: '16:00', est: '' }] };
  const state = {
    punches: [{ e: 'A', l: '8', t: at(2026, 11, 2, 8, 0), f: 'f' }, { e: 'A', l: '8', t: at(2026, 11, 2, 16, 0), f: 'f' }],
    schedules: [sch], holidays: [], vacGroups: [],
    leaves: [{ id: 'h', legajo: '8', from: '2026-11-03', to: '2026-11-03', type: 'Permiso por horas', startTime: '10:00', endTime: '12:00', status: 'aprobada' }],
    employees: { 8: { legajo: '8', name: 'Y', sector: '', scheduleId: 'lv2' } },
    files: [{ id: 'f', estId: 'A', from: '2026-11-01', to: '2026-11-04' }], settings: {},
  };
  assert.equal(computeReport(state, { from: '2026-11-02', to: '2026-11-03' }).list[0].summary.ausente, 1);
});

test('vacaciones que superan el saldo: se calcula cuánto queda y cuánto va sin goce', async () => {
  const { vacationRoom } = await import('../src/lib/personal.js');
  const { liquidacionSheets, unpaidSummary } = await import('../src/lib/liquidacion.js');
  const state = {
    employees: { 7: { legajo: '7', name: 'Prueba Ana', hireDate: '2023-01-10', cuil: '27-1-1' } },
    leaves: [
      { id: 'a', legajo: '7', type: 'Vacaciones', from: '2026-03-02', to: '2026-03-08', status: 'aprobada' },
      { id: 'b', legajo: '7', type: 'Vacaciones', from: '2026-07-20', to: '2026-07-26', status: 'aprobada' },
      { id: 'c', legajo: '7', type: 'Licencia sin goce de sueldo', from: '2026-07-27', to: '2026-08-02', status: 'aprobada' },
    ],
  };
  // 14 días por antigüedad < 5 años; ya usó 7 (marzo) → con el pedido de julio (7) no se pasa
  const room = vacationRoom(state, { id: 'b', legajo: '7', from: '2026-07-20', to: '2026-08-02' });
  assert.equal(room.left, 7);
  assert.equal(room.want, 14);
  assert.equal(room.extra, 7);
  // En julio: 5 días sin goce (27 al 31); en agosto, 2.
  assert.deepEqual(unpaidSummary(state, '2026-07'), { days: 5, people: 1 });
  assert.deepEqual(unpaidSummary(state, '2026-08'), { days: 2, people: 1 });
  const [summary, detail] = liquidacionSheets(state, '2026-07');
  assert.deepEqual(summary.rows[1].slice(3, 5), [7, 5]);
  assert.equal(detail.rows.find((r) => r[4] === 'Licencia sin goce de sueldo')[5], 'NO');
});
