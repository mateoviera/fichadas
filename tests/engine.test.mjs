// Ejecutar con: npm test   (usa el runner nativo de Node, sin dependencias)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseClockFile } from '../src/lib/parser.js';
import { analyzeEmployee, summarize, rowToText } from '../src/lib/engine.js';

const load = (f) => parseClockFile(readFileSync(new URL(`../src/samples/${f}`, import.meta.url), 'latin1'), f);

const NURSE = { id: 'enf', type: 'rotativo', blocks: [
  { start: '06:00', end: '14:00' }, { start: '14:00', end: '22:00' }, { start: '22:00', end: '06:00' },
] };

const punchesOf = (file, legajo) => file.records.filter((r) => r.legajo === legajo).map((r) => ({ e: 'A', t: r.ts }));

test('lee formato AllGLog con nombres', () => {
  const f = load('AllGLog001.txt');
  assert.equal(f.meta.format, 'AllGLog');
  assert.equal(f.records.length, 203);
  assert.equal(f.records[0].name, 'Ana');
  assert.equal(f.records[0].legajo, '61');
  assert.equal(f.errors.length, 0);
});

test('lee formato UDISKLOG v2 sin nombres', () => {
  const f = load('114.txt');
  assert.equal(f.meta.format, 'UDISKLOG v2');
  assert.equal(f.meta.firmware, 'F254HS10s_Psf_v138');
  assert.equal(f.records.length, 175);
  assert.equal(f.records[0].legajo, '174');
  assert.equal(f.records[0].name, '');
});

test('enfermería: turno nocturno 22→06 queda en el día de ingreso', () => {
  const f = load('AllGLog001.txt');
  const rows = analyzeEmployee({ punches: punchesOf(f, '61'), schedule: NURSE, from: '2026-10-01', to: '2026-10-31' });
  const night = rows.find((r) => r.date === '2026-10-02');
  assert.equal(night.inst.label, '22:00–06:00');
  assert.ok(night.nextDayExit);
  assert.deepEqual(night.issues, []);
  // 10/05 13:39 → 21:58 es turno tarde
  const tarde = rows.find((r) => r.date === '2026-10-05');
  assert.equal(tarde.inst.label, '14:00–22:00');
  assert.ok(tarde.exit);
});

test('fichadas dobles y salidas intermedias no rompen el turno', () => {
  const f = load('AllGLog001.txt');
  const rows = analyzeEmployee({ punches: punchesOf(f, '149'), schedule: NURSE, from: '2026-10-01', to: '2026-10-31' });
  const r23 = rows.find((r) => r.date === '2026-10-23');
  assert.equal(r23.inst.label, '06:00–14:00');
  assert.equal(r23.mids.length, 1); // 07:30
  assert.ok(r23.exit);
  const g = analyzeEmployee({ punches: punchesOf(f, '332'), schedule: NURSE, from: '2026-10-01', to: '2026-10-31' });
  const g25 = g.filter((r) => r.date === '2026-10-25');
  assert.equal(g25.length, 1, g25.map(rowToText).join('\n'));
});

test('horario fijo: tardanzas, ausencias y feriados', () => {
  const f = load('114.txt');
  const sch = { id: 'adm', type: 'fijo', blocks: [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:30' }] };
  const holidays = new Map([['2026-08-17', 'Paso a la Inmortalidad de San Martín']]);
  const rows = analyzeEmployee({ punches: punchesOf(f, '36'), schedule: sch, holidays, from: '2026-08-03', to: '2026-08-31' });
  assert.ok(rows.find((r) => r.date === '2026-08-17').info.includes('feriado'));
  assert.ok(summarize(rows).evaluables > 15);
  const sch2 = { id: 'tarde', type: 'fijo', blocks: [{ days: [1, 2, 3, 4, 5], start: '13:00', end: '18:00' }] };
  const r47 = analyzeEmployee({ punches: punchesOf(f, '47'), schedule: sch2, holidays, from: '2026-08-03', to: '2026-08-31' });
  assert.ok(r47.find((r) => r.date === '2026-08-31').issues.includes('ausente'));
  assert.ok(r47.find((r) => r.date === '2026-08-05').issues.includes('tarde')); // 13:18
});

test('imprime resumen de ejemplo', () => {
  const f = load('AllGLog001.txt');
  for (const leg of ['61', '149', '332']) {
    const rows = analyzeEmployee({ punches: punchesOf(f, leg), schedule: NURSE, from: '2026-10-01', to: '2026-10-31' });
    const odd = rows.filter((r) => r.issues.length);
    console.log(`\n# ${leg}: ${rows.length} turnos, ${odd.length} con incidencias`);
    odd.forEach((r) => console.log('  ' + rowToText(r)));
  }
});
