import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS } from './engine.js';
import { dateKey } from './time.js';

const KEY = 'fichadas:v1';
const uid = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_SCHEDULES = [
  {
    id: 'enf-rot',
    name: 'Enfermería · rotativo 8 h',
    type: 'rotativo',
    blocks: [
      { start: '06:00', end: '14:00', est: '' },
      { start: '14:00', end: '22:00', est: '' },
      { start: '22:00', end: '06:00', est: '' },
    ],
  },
  {
    id: 'adm-lv',
    name: 'Lunes a viernes 08–16',
    type: 'fijo',
    blocks: [{ days: [1, 2, 3, 4, 5], start: '08:00', end: '16:00', est: '' }],
  },
];

const empty = () => ({
  version: 1,
  establishments: {}, // id -> { id, name, device, format, firmware }
  files: [], // { id, estId, name, loadedAt, count, from, to, format }
  punches: [], // { e, l, t, f, m?, id? }
  employees: {}, // legajo -> { legajo, name, sector, scheduleId }
  schedules: DEFAULT_SCHEDULES,
  holidays: [], // { date, name }
  leaves: [], // { id, legajo, from, to, type }
  settings: { ...DEFAULT_SETTINGS },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch {
    /* almacenamiento no disponible */
  }
  // Datos iniciales opcionales (se usa solo en la demo publicada).
  if (typeof window !== 'undefined' && window.__FICHADAS_SEED__) return { ...empty(), ...window.__FICHADAS_SEED__ };
  return empty();
}

let state = load();
const listeners = new Set();
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('No se pudo guardar en el navegador', e);
    }
  }, 150);
}

export function getState() {
  return state;
}

export function setState(fn) {
  state = typeof fn === 'function' ? fn(state) : fn;
  persist();
  listeners.forEach((l) => l());
}

export function useStore(selector = (s) => s) {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => selector(state),
  );
}

/* ---------------- Acciones ---------------- */

export function importParsed(parsed, { estId, newEstName }) {
  let addedCount = 0;
  setState((s) => {
    let id = estId;
    const establishments = { ...s.establishments };
    if (!id) {
      id = uid();
      establishments[id] = {
        id,
        name: newEstName || parsed.meta.fileName.replace(/\.[^.]+$/, ''),
        device: parsed.meta.device,
        format: parsed.meta.format,
        firmware: parsed.meta.firmware,
      };
    }
    const fileId = uid();
    const seen = new Set(s.punches.map((p) => `${p.e}|${p.l}|${p.t}`));
    const added = [];
    for (const r of parsed.records) {
      const k = `${id}|${r.legajo}|${r.ts}`;
      if (seen.has(k)) continue;
      seen.add(k);
      added.push({ e: id, l: r.legajo, t: r.ts, f: fileId });
    }
    addedCount = added.length;
    const employees = { ...s.employees };
    for (const r of parsed.records) {
      const cur = employees[r.legajo];
      if (!cur) employees[r.legajo] = { legajo: r.legajo, name: r.name || '', sector: '', scheduleId: '' };
      else if (!cur.name && r.name) employees[r.legajo] = { ...cur, name: r.name };
    }
    return {
      ...s,
      establishments,
      employees,
      punches: s.punches.concat(added),
      files: !added.length ? s.files : s.files.concat({
        id: fileId,
        estId: id,
        name: parsed.meta.fileName,
        loadedAt: Date.now(),
        count: added.length,
        total: parsed.records.length,
        from: parsed.summary.from,
        to: parsed.summary.to,
        format: parsed.meta.format,
      }),
    };
  });
  return addedCount;
}

export function removeFile(fileId) {
  setState((s) => {
    const files = s.files.filter((f) => f.id !== fileId);
    const estIds = new Set(files.map((f) => f.estId));
    const establishments = Object.fromEntries(Object.entries(s.establishments).filter(([id]) => estIds.has(id)));
    return { ...s, files, establishments, punches: s.punches.filter((p) => p.f !== fileId) };
  });
}

export function renameEstablishment(id, name) {
  setState((s) => ({ ...s, establishments: { ...s.establishments, [id]: { ...s.establishments[id], name } } }));
}

export function upsertEmployee(legajo, patch) {
  setState((s) => ({
    ...s,
    employees: {
      ...s.employees,
      [legajo]: { legajo, name: '', sector: '', scheduleId: '', ...s.employees[legajo], ...patch },
    },
  }));
}

export function bulkAssign(legajos, patch) {
  setState((s) => {
    const employees = { ...s.employees };
    legajos.forEach((l) => (employees[l] = { ...employees[l], ...patch }));
    return { ...s, employees };
  });
}

export function saveSchedule(sch) {
  setState((s) => {
    const exists = s.schedules.some((x) => x.id === sch.id);
    const next = { ...sch, _v: uid() };
    return { ...s, schedules: exists ? s.schedules.map((x) => (x.id === sch.id ? next : x)) : s.schedules.concat(next) };
  });
}

export function newSchedule(type = 'fijo') {
  const sch = {
    id: uid(),
    name: type === 'rotativo' ? 'Nuevo rotativo' : 'Nuevo horario',
    type,
    blocks: type === 'rotativo' ? [{ start: '06:00', end: '14:00', est: '' }] : [{ days: [1, 2, 3, 4, 5], start: '08:00', end: '16:00', est: '' }],
  };
  saveSchedule(sch);
  return sch.id;
}

export function deleteSchedule(id) {
  setState((s) => ({
    ...s,
    schedules: s.schedules.filter((x) => x.id !== id),
    employees: Object.fromEntries(Object.entries(s.employees).map(([k, e]) => [k, e.scheduleId === id ? { ...e, scheduleId: '' } : e])),
  }));
}

export function setSettings(patch) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function addHolidays(list) {
  setState((s) => {
    const map = new Map(s.holidays.map((h) => [h.date, h]));
    list.forEach((h) => map.set(h.date, h));
    return { ...s, holidays: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  });
}

export function removeHoliday(date) {
  setState((s) => ({ ...s, holidays: s.holidays.filter((h) => h.date !== date) }));
}

export function addLeave(leave) {
  setState((s) => ({ ...s, leaves: s.leaves.concat({ id: uid(), ...leave }) }));
}

export function removeLeave(id) {
  setState((s) => ({ ...s, leaves: s.leaves.filter((l) => l.id !== id) }));
}

export function addManualPunch({ legajo, estId, ts, note }) {
  setState((s) => ({ ...s, punches: s.punches.concat({ id: uid(), e: estId, l: legajo, t: ts, f: 'manual', m: note || 'Manual' }) }));
}

export function removeManualPunch(id) {
  setState((s) => ({ ...s, punches: s.punches.filter((p) => p.id !== id) }));
}

export function restoreBackup(obj) {
  if (!obj || !Array.isArray(obj.punches) || typeof obj.employees !== 'object') throw new Error('El archivo no es una copia de seguridad válida.');
  setState({ ...empty(), ...obj });
}

export function resetAll() {
  setState(empty());
}

/* ---------------- Derivados ---------------- */

export function punchesByLegajo(punches) {
  const m = new Map();
  for (const p of punches) {
    if (!m.has(p.l)) m.set(p.l, []);
    m.get(p.l).push(p);
  }
  return m;
}

/** Meses presentes en los datos: [{key:'2026-10', from, to}] del más nuevo al más viejo */
export function monthsInData(punches) {
  const set = new Set(punches.map((p) => dateKey(p.t).slice(0, 7)));
  return [...set].sort().reverse();
}
