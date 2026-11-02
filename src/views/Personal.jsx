import { useMemo, useRef, useState } from 'react';
import { useStore, upsertEmployee, bulkAssign, punchesByLegajo } from '../lib/store.js';
import { EstSelect, useToast } from '../components/ui.jsx';
import { download, toCSV, parseCSV } from '../lib/io.js';
import { fmtDate, dateKey } from '../lib/time.js';
import EmployeeDrawer from './EmployeeDrawer.jsx';

export default function Personal() {
  const state = useStore();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [estId, setEst] = useState('');
  const [onlyNoSch, setOnlyNoSch] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [bulkSch, setBulkSch] = useState('');
  const [bulkSector, setBulkSector] = useState('');
  const [detail, setDetail] = useState(null);
  const [newLeg, setNewLeg] = useState('');
  const fileRef = useRef();

  const byLeg = useMemo(() => punchesByLegajo(state.punches), [state.punches]);
  const sectors = useMemo(() => [...new Set(Object.values(state.employees).map((e) => e.sector).filter(Boolean))].sort(), [state.employees]);
  const schName = Object.fromEntries(state.schedules.map((s) => [s.id, s.name]));

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return Object.values(state.employees)
      .map((e) => {
        const ps = byLeg.get(e.legajo) || [];
        return { ...e, count: ps.length, last: ps.reduce((m, p) => Math.max(m, p.t), 0), ests: [...new Set(ps.map((p) => p.e))] };
      })
      .filter((e) => (!n || `${e.legajo} ${e.name} ${e.sector}`.toLowerCase().includes(n)) && (!estId || e.ests.includes(estId)) && (!onlyNoSch || !e.scheduleId))
      .sort((a, b) => Number(a.legajo) - Number(b.legajo));
  }, [state.employees, byLeg, q, estId, onlyNoSch]);

  const allSel = list.length > 0 && list.every((e) => sel.has(e.legajo));
  const toggle = (l) => setSel((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n; });

  const exportCsv = () => {
    const rows = [['legajo', 'nombre', 'sector', 'horario'], ...list.map((e) => [e.legajo, e.name, e.sector, schName[e.scheduleId] || ''])];
    download('personal.csv', toCSV(rows), 'text/csv');
  };

  const importCsv = async (file) => {
    const rows = parseCSV(await file.text());
    if (!rows.length) return;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const hasHead = head.includes('legajo');
    const idx = (k, d) => (hasHead ? head.indexOf(k) : d);
    const iL = idx('legajo', 0), iN = idx('nombre', 1), iS = idx('sector', 2), iH = idx('horario', 3);
    const byName = Object.fromEntries(state.schedules.map((s) => [s.name.trim().toLowerCase(), s.id]));
    let n = 0;
    for (const r of rows.slice(hasHead ? 1 : 0)) {
      const leg = String(parseInt(r[iL], 10));
      if (leg === 'NaN') continue;
      const patch = {};
      if (iN >= 0 && r[iN]?.trim()) patch.name = r[iN].trim();
      if (iS >= 0 && r[iS]?.trim()) patch.sector = r[iS].trim();
      if (iH >= 0 && r[iH]?.trim() && byName[r[iH].trim().toLowerCase()]) patch.scheduleId = byName[r[iH].trim().toLowerCase()];
      upsertEmployee(leg, patch);
      n++;
    }
    toast(`${n} personas actualizadas`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Personal</h2>
          <p>Cada legajo aparece al cargar un archivo. Completá nombre y sector, y asigná el horario pactado.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => fileRef.current.click()}>Importar CSV</button>
          <button className="btn" onClick={exportCsv} disabled={!list.length}>Exportar CSV</button>
          <input ref={fileRef} type="file" accept=".csv,.txt" hidden onChange={(e) => { e.target.files[0] && importCsv(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>

      <div className="panel panel-pad filters">
        <label className="field"><span>Buscar</span><input id="p-q" className="input" placeholder="Nombre, legajo o sector" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="field"><span>Establecimiento</span><EstSelect id="p-est" establishments={state.establishments} value={estId} onChange={setEst} /></label>
        <label className="row small" style={{ height: 34 }}><input id="p-nosch" type="checkbox" checked={onlyNoSch} onChange={(e) => setOnlyNoSch(e.target.checked)} /> Solo sin horario</label>
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); const l = String(parseInt(newLeg, 10)); if (l !== 'NaN') { upsertEmployee(l, {}); setDetail(l); setNewLeg(''); } }}>
          <input id="p-new" className="input" style={{ flex: 1 }} placeholder="Nuevo legajo" inputMode="numeric" value={newLeg} onChange={(e) => setNewLeg(e.target.value)} />
          <button className="btn" disabled={!newLeg}>Agregar</button>
        </form>
      </div>

      {sel.size > 0 && (
        <div className="panel panel-pad row">
          <b>{sel.size} seleccionados</b>
          <select id="b-sch" className="input" value={bulkSch} onChange={(e) => setBulkSch(e.target.value)}>
            <option value="">Asignar horario…</option>
            <option value="__none">Sin horario</option>
            {state.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input id="b-sector" className="input" list="p-sectors" placeholder="Asignar sector…" value={bulkSector} onChange={(e) => setBulkSector(e.target.value)} />
          <button
            className="btn primary"
            disabled={!bulkSch && !bulkSector}
            onClick={() => {
              const patch = {};
              if (bulkSch) patch.scheduleId = bulkSch === '__none' ? '' : bulkSch;
              if (bulkSector) patch.sector = bulkSector;
              bulkAssign([...sel], patch);
              toast(`${sel.size} personas actualizadas`);
              setSel(new Set()); setBulkSch(''); setBulkSector('');
            }}
          >Aplicar</button>
          <button className="btn ghost" onClick={() => setSel(new Set())}>Cancelar</button>
        </div>
      )}

      <div className="panel table-wrap">
        <datalist id="p-sectors">{sectors.map((s) => <option key={s} value={s} />)}</datalist>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}><input type="checkbox" aria-label="Seleccionar todos" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(list.map((e) => e.legajo)))} /></th>
              <th>Legajo</th><th>Nombre</th><th>Sector</th><th>Horario</th><th>Establecimientos</th><th className="right">Fichadas</th><th>Última</th><th />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.legajo}>
                <td><input type="checkbox" aria-label={`Seleccionar ${e.legajo}`} checked={sel.has(e.legajo)} onChange={() => toggle(e.legajo)} /></td>
                <td className="mono">{e.legajo}</td>
                <td style={{ minWidth: 160 }}><input id={`n-${e.legajo}`} className="input inline" value={e.name} placeholder="Sin nombre" onChange={(ev) => upsertEmployee(e.legajo, { name: ev.target.value })} /></td>
                <td style={{ minWidth: 130 }}><input id={`s-${e.legajo}`} className="input inline" list="p-sectors" value={e.sector} placeholder="—" onChange={(ev) => upsertEmployee(e.legajo, { sector: ev.target.value })} /></td>
                <td style={{ minWidth: 190 }}>
                  <select id={`h-${e.legajo}`} className="input inline" value={e.scheduleId} onChange={(ev) => upsertEmployee(e.legajo, { scheduleId: ev.target.value })}>
                    <option value="">Sin horario</option>
                    {state.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td className="small muted">{e.ests.map((x) => state.establishments[x]?.name).join(', ')}</td>
                <td className="num right">{e.count}</td>
                <td className="mono muted nowrap">{e.last ? fmtDate(dateKey(e.last)) : '—'}</td>
                <td><button className="btn sm ghost" onClick={() => setDetail(e.legajo)}>Detalle</button></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={9} className="empty">No hay personas para mostrar.</td></tr>}
          </tbody>
        </table>
      </div>
      {detail && <EmployeeDrawer legajo={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
