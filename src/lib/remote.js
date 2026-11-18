// Sincronización con Supabase.
// Si VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY no están definidas, la app funciona
// como siempre: todo en el navegador (localStorage) y este módulo no hace nada.
//
// Estrategia: la app sigue trabajando con el mismo estado en memoria. Después de cada
// cambio se compara el estado anterior con el nuevo y solo se envían a la base las filas
// que cambiaron (alta/modificación → upsert, baja → delete), en orden y en lotes.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const enabled = !!(URL && KEY);
export const supabase = enabled ? createClient(URL, KEY) : null;

const punchKey = (p) => p.id || `${p.e}|${p.l}|${p.t}`;

/** Cómo se guarda cada colección del estado en su tabla. */
const COLLECTIONS = [
  {
    name: 'establishments',
    list: (s) => Object.values(s.establishments),
    key: (x) => x.id,
    toRow: (x) => ({ id: x.id, name: x.name || '', device: x.device || '', format: x.format || '', firmware: x.firmware || '' }),
    fromRows: (rows) => Object.fromEntries(rows.map((r) => [r.id, { id: r.id, name: r.name, device: r.device, format: r.format, firmware: r.firmware }])),
  },
  {
    name: 'files',
    list: (s) => s.files,
    key: (x) => x.id,
    toRow: (x) => ({ id: x.id, est_id: x.estId, name: x.name || '', loaded_at: x.loadedAt || null, count: x.count || 0, total: x.total || 0, date_from: x.from || null, date_to: x.to || null, format: x.format || '' }),
    fromRows: (rows) => rows.map((r) => ({ id: r.id, estId: r.est_id, name: r.name, loadedAt: Number(r.loaded_at) || null, count: r.count, total: r.total, from: r.date_from, to: r.date_to, format: r.format })),
  },
  {
    name: 'punches',
    list: (s) => s.punches,
    key: punchKey,
    toRow: (p) => ({ id: punchKey(p), est_id: p.e, legajo: p.l, ts: p.t, file_id: p.f, note: p.m || null }),
    fromRows: (rows) => rows.map((r) => {
      const p = { e: r.est_id, l: r.legajo, t: Number(r.ts), f: r.file_id };
      if (r.file_id === 'manual') { p.id = r.id; p.m = r.note || 'Manual'; }
      return p;
    }),
  },
  {
    name: 'employees',
    list: (s) => Object.values(s.employees),
    key: (x) => x.legajo,
    toRow: (x) => ({ legajo: x.legajo, name: x.name || '', sector: x.sector || '', schedule_id: x.scheduleId || '' }),
    fromRows: (rows) => Object.fromEntries(rows.map((r) => [r.legajo, { legajo: r.legajo, name: r.name, sector: r.sector, scheduleId: r.schedule_id }])),
    pk: 'legajo',
  },
  {
    name: 'schedules',
    list: (s) => s.schedules,
    key: (x) => x.id,
    toRow: (x) => ({ id: x.id, name: x.name || '', type: x.type, blocks: x.blocks || [], v: x._v || '' }),
    fromRows: (rows) => rows.map((r) => ({ id: r.id, name: r.name, type: r.type, blocks: r.blocks, _v: r.v || '' })),
  },
  {
    name: 'holidays',
    list: (s) => s.holidays,
    key: (x) => x.date,
    toRow: (x) => ({ date: x.date, name: x.name || '' }),
    fromRows: (rows) => rows.map((r) => ({ date: r.date, name: r.name })).sort((a, b) => a.date.localeCompare(b.date)),
    pk: 'date',
  },
  {
    name: 'leaves',
    list: (s) => s.leaves,
    key: (x) => x.id,
    toRow: (x) => ({ id: x.id, legajo: x.legajo, date_from: x.from, date_to: x.to || x.from, type: x.type || '' }),
    fromRows: (rows) => rows.map((r) => ({ id: r.id, legajo: r.legajo, from: r.date_from, to: r.date_to, type: r.type })),
  },
];

/* ---------------- Estado de la sincronización (para mostrar en pantalla) ---------------- */

let status = { pending: 0, error: '' };
const statusListeners = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  statusListeners.forEach((l) => l());
}
export const getSyncStatus = () => status;
export const subscribeSync = (l) => (statusListeners.add(l), () => statusListeners.delete(l));

/* ---------------- Lectura ---------------- */

const PAGE = 1000; // máximo de filas por pedido que permite Supabase por defecto

async function fetchAll(table) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').order(table === 'employees' ? 'legajo' : table === 'holidays' ? 'date' : 'id').range(from, from + PAGE - 1);
    if (error) throw new Error(`No se pudo leer ${table}: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

/** Trae todos los datos de la base y los devuelve con la forma del estado de la app. */
export async function loadAll(base) {
  const results = await Promise.all([...COLLECTIONS.map((c) => fetchAll(c.name)), supabase.from('settings').select('data').eq('id', 1).maybeSingle()]);
  const next = { ...base };
  COLLECTIONS.forEach((c, i) => (next[c.name] = c.fromRows(results[i])));
  const settingsRes = results[COLLECTIONS.length];
  if (settingsRes.error) throw new Error(`No se pudo leer settings: ${settingsRes.error.message}`);
  next.settings = { ...base.settings, ...(settingsRes.data?.data || {}) };
  return next;
}

/* ---------------- Escritura ---------------- */

const CHUNK_UPSERT = 500;
const CHUNK_DELETE = 100;
let queue = Promise.resolve();

function diff(c, prev, next) {
  const a = c.list(prev);
  const b = c.list(next);
  if (a === b) return null;
  const before = new Map(a.map((x) => [c.key(x), x]));
  const upserts = [];
  const seen = new Set();
  for (const x of b) {
    const k = c.key(x);
    seen.add(k);
    if (before.get(k) !== x) upserts.push(c.toRow(x)); // nuevo o modificado (los cambios crean objetos nuevos)
  }
  const deletes = [...before.keys()].filter((k) => !seen.has(k));
  return upserts.length || deletes.length ? { upserts, deletes } : null;
}

async function run(table, pk, { upserts, deletes }) {
  for (let i = 0; i < upserts.length; i += CHUNK_UPSERT) {
    const { error } = await supabase.from(table).upsert(upserts.slice(i, i + CHUNK_UPSERT), { onConflict: pk });
    if (error) throw new Error(`${table}: ${error.message}`);
    setStatus({ pending: Math.max(0, status.pending - Math.min(CHUNK_UPSERT, upserts.length - i)) });
  }
  for (let i = 0; i < deletes.length; i += CHUNK_DELETE) {
    const { error } = await supabase.from(table).delete().in(pk, deletes.slice(i, i + CHUNK_DELETE));
    if (error) throw new Error(`${table}: ${error.message}`);
    setStatus({ pending: Math.max(0, status.pending - Math.min(CHUNK_DELETE, deletes.length - i)) });
  }
}

/** Envía a la base las diferencias entre dos estados. Las escrituras se hacen en orden. */
export function push(prev, next) {
  const jobs = [];
  for (const c of COLLECTIONS) {
    const d = diff(c, prev, next);
    if (d) jobs.push([c.name, c.pk || 'id', d]);
  }
  if (prev.settings !== next.settings) jobs.push(['settings', 'id', { upserts: [{ id: 1, data: next.settings }], deletes: [] }]);
  if (!jobs.length) return;
  const count = jobs.reduce((n, [, , d]) => n + d.upserts.length + d.deletes.length, 0);
  setStatus({ pending: status.pending + count });
  queue = queue
    .then(async () => {
      for (const [table, pk, d] of jobs) await run(table, pk, d);
    })
    .then(() => status.error && setStatus({ error: '' }))
    .catch((e) => {
      console.error(e);
      setStatus({ pending: 0, error: `No se pudieron guardar cambios en la base (${e.message}). Recargá la página para ver los datos guardados.` });
    });
}
