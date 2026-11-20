import { useMemo, useRef, useState } from 'react';
import { useStore, upsertEmployee, bulkAssign, punchesByLegajo } from '../lib/store.js';
import { useToast, Modal } from '../components/ui.jsx';
import { download, toCSV, parseCSV } from '../lib/io.js';
import { fmtDate, todayKey } from '../lib/time.js';
import { seniority, fmtSeniority, fmtStamp } from '../lib/personal.js';
import { scheduleSummary } from '../lib/schedule.js';
import EmployeeDrawer, { splitName } from './EmployeeDrawer.jsx';

export default function Personal() {
  const state = useStore();
  const toast = useToast();
  const today = todayKey();
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [statusF, setStatusF] = useState('activos');
  const [onlyNoSch, setOnlyNoSch] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [bulk, setBulk] = useState({ sch: '', sector: '', group: '' });
  const [detail, setDetail] = useState(null);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef();

  const byLeg = useMemo(() => punchesByLegajo(state.punches), [state.punches]);
  const sectors = useMemo(() => [...new Set(Object.values(state.employees).map((e) => e.sector).filter(Boolean))].sort(), [state.employees]);
  const schById = Object.fromEntries(state.schedules.map((s) => [s.id, s]));
  const groupName = Object.fromEntries((state.vacGroups || []).map((g) => [g.id, g.name]));

  const all = Object.values(state.employees);
  const counts = { activos: all.filter((e) => !e.exitDate || e.exitDate > today).length, baja: all.filter((e) => e.exitDate && e.exitDate <= today).length };
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return Object.values(state.employees)
      .filter((e) => statusF === 'todos' || (statusF === 'baja' ? e.exitDate && e.exitDate <= today : !e.exitDate || e.exitDate > today))
      .filter((e) => !n || `${e.legajo} ${e.name} ${e.dni || ''} ${e.position || ''} ${e.sector || ''}`.toLowerCase().includes(n))
      .filter((e) => !sector || e.sector === sector)
      .filter((e) => !onlyNoSch || !e.scheduleId)
      .sort((a, b) => splitName(a).join(' ').localeCompare(splitName(b).join(' '), 'es') || Number(a.legajo) - Number(b.legajo));
  }, [state.employees, q, sector, statusF, onlyNoSch, today]);

  const allSel = list.length > 0 && list.every((e) => sel.has(e.legajo));
  const toggle = (l) => setSel((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n; });

  const exportCsv = () => {
    const rows = [['legajo', 'apellido', 'nombre', 'dni', 'cuil', 'puesto', 'sector', 'ingreso', 'baja', 'horario', 'grupo', 'telefono', 'email', 'ultima_modificacion'],
      ...list.map((e) => {
        const [last, first] = splitName(e);
        return [e.legajo, last, first, e.dni || '', e.cuil || '', e.position || '', e.sector || '', e.hireDate || '', e.exitDate || '', schById[e.scheduleId]?.name || '', groupName[e.vacGroup] || '', e.phone || '', e.email || '', fmtStamp(e)];
      })];
    download('personal.csv', toCSV(rows), 'text/csv');
  };

  const importCsv = async (file) => {
    const rows = parseCSV(await file.text());
    if (!rows.length) return;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    if (!head.includes('legajo')) { toast('El CSV tiene que tener una columna «legajo»'); return; }
    const col = (k) => head.indexOf(k);
    const bySchName = Object.fromEntries(state.schedules.map((s) => [s.name.trim().toLowerCase(), s.id]));
    const map = { apellido: 'lastName', nombre: 'firstName', dni: 'dni', cuil: 'cuil', puesto: 'position', sector: 'sector', ingreso: 'hireDate', baja: 'exitDate', telefono: 'phone', email: 'email' };
    let n = 0;
    for (const r of rows.slice(1)) {
      const leg = String(parseInt(r[col('legajo')], 10));
      if (leg === 'NaN') continue;
      const patch = {};
      for (const [k, f] of Object.entries(map)) if (col(k) >= 0 && r[col(k)]?.trim()) patch[f] = r[col(k)].trim();
      const h = col('horario') >= 0 && r[col('horario')]?.trim().toLowerCase();
      if (h && bySchName[h]) patch.scheduleId = bySchName[h];
      upsertEmployee(leg, patch);
      n++;
    }
    toast(`${n} personas actualizadas`);
  };

  const applyBulk = () => {
    const patch = {};
    if (bulk.sch) patch.scheduleId = bulk.sch === '__none' ? '' : bulk.sch;
    if (bulk.sector) patch.sector = bulk.sector;
    if (bulk.group) patch.vacGroup = bulk.group === '__none' ? '' : bulk.group;
    bulkAssign([...sel], patch);
    toast(`${sel.size} personas actualizadas`);
    setSel(new Set());
    setBulk({ sch: '', sector: '', group: '' });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Personal</h2>
          <p>Todo el personal con sus datos, horario y antigüedad. Tocá una persona para ver y editar su ficha.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => fileRef.current.click()} title="Columnas: legajo, apellido, nombre, dni, cuil, puesto, sector, ingreso, baja, horario, telefono, email">Importar CSV</button>
          <button className="btn" onClick={exportCsv} disabled={!list.length}>Exportar CSV</button>
          <button className="btn primary" onClick={() => setAdding(true)}>Agregar persona</button>
          <input ref={fileRef} type="file" accept=".csv,.txt" hidden onChange={(e) => { e.target.files[0] && importCsv(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>

      <div className="panel panel-pad toolbar">
        <input id="p-q" className="input grow" placeholder="Buscar por nombre, legajo, DNI o puesto" value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="p-sector" className="input" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
          <option value="">Todos los sectores</option>
          {sectors.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="seg" role="group" aria-label="Estado">
          <button aria-pressed={statusF === 'activos'} onClick={() => setStatusF('activos')}>Activos ({counts.activos})</button>
          <button aria-pressed={statusF === 'baja'} onClick={() => setStatusF('baja')}>De baja ({counts.baja})</button>
          <button aria-pressed={statusF === 'todos'} onClick={() => setStatusF('todos')}>Todos</button>
        </div>
        <label className="row small"><input id="p-nosch" type="checkbox" checked={onlyNoSch} onChange={(e) => setOnlyNoSch(e.target.checked)} /> Sin horario</label>
      </div>

      {sel.size > 0 && (
        <div className="panel panel-pad row bulkbar">
          <b>{sel.size} {sel.size === 1 ? 'seleccionada' : 'seleccionadas'}</b>
          <select id="b-sch" className="input" value={bulk.sch} onChange={(e) => setBulk({ ...bulk, sch: e.target.value })}>
            <option value="">Horario…</option>
            <option value="__none">Sin horario</option>
            {state.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input id="b-sector" className="input" list="p-sectors" placeholder="Sector…" value={bulk.sector} onChange={(e) => setBulk({ ...bulk, sector: e.target.value })} />
          <select id="b-group" className="input" value={bulk.group} onChange={(e) => setBulk({ ...bulk, group: e.target.value })}>
            <option value="">Grupo de vacaciones…</option>
            <option value="__none">Sin grupo</option>
            {(state.vacGroups || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button className="btn primary" disabled={!bulk.sch && !bulk.sector && !bulk.group} onClick={applyBulk}>Aplicar</button>
          <button className="btn ghost" onClick={() => setSel(new Set())}>Cancelar</button>
          <datalist id="p-sectors">{sectors.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
      )}

      <div className="panel table-wrap">
        <table className="people">
          <thead>
            <tr>
              <th style={{ width: 32 }}><input type="checkbox" aria-label="Seleccionar todos" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(list.map((e) => e.legajo)))} /></th>
              <th>Persona</th><th>Puesto</th><th>Antigüedad</th><th className="right">Última modificación</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => {
              const [last, first] = splitName(e);
              const sch = schById[e.scheduleId];
              const gone = e.exitDate && e.exitDate <= today;
              const noPunches = !(byLeg.get(e.legajo) || []).length;
              return (
                <tr key={e.legajo} className={`clickable ${gone ? 'dim' : ''}`} onClick={() => setDetail(e.legajo)}>
                  <td onClick={(ev) => ev.stopPropagation()}><input type="checkbox" aria-label={`Seleccionar ${e.name}`} checked={sel.has(e.legajo)} onChange={() => toggle(e.legajo)} /></td>
                  <td style={{ minWidth: 200 }}>
                    <button className="person" onClick={(ev) => { ev.stopPropagation(); setDetail(e.legajo); }}>
                      <b>{last || 'Sin nombre'}</b>{first && `, ${first}`}
                    </button>
                    <div className="small muted">Leg. {e.legajo}{e.dni ? ` · DNI ${e.dni}` : ''}{gone ? ` · baja ${fmtDate(e.exitDate)}` : ''}{noPunches && !gone ? ' · sin fichadas' : ''}</div>
                  </td>
                  <td className="small">{e.position || <span className="muted">—</span>}{e.sector && <div className="muted">{e.sector}</div>}</td>
                  {/* <td className="small" style={{ maxWidth: 300 }}>{sch ? <span title={sch.name}>{scheduleSummary(sch)}</span> : <span className="pill neutral">Sin horario</span>}</td> Ver horario desde el personal */}
                  <td className="small nowrap">{e.hireDate ? fmtSeniority(seniority(e.hireDate)) : <span className="muted">—</span>}</td>
                  <td className="small muted right" style={{ minWidth: 140 }}>{fmtStamp(e) || '—'}</td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={7} className="empty">No hay personas para mostrar.</td></tr>}
          </tbody>
        </table>
      </div>
      {detail && <EmployeeDrawer legajo={detail} onClose={() => setDetail(null)} />}
      {adding && <AddPerson onClose={() => setAdding(false)} onCreated={(l) => { setAdding(false); setDetail(l); }} />}
    </>
  );
}

function AddPerson({ onClose, onCreated }) {
  const state = useStore();
  const toast = useToast();
  const [f, setF] = useState({ legajo: '', lastName: '', firstName: '', dni: '' });
  const leg = String(parseInt(f.legajo, 10));
  const exists = leg !== 'NaN' && state.employees[leg];
  const ok = leg !== 'NaN' && !exists && (f.lastName.trim() || f.firstName.trim());
  const save = () => {
    if (!ok) return;
    upsertEmployee(leg, { lastName: f.lastName.trim(), firstName: f.firstName.trim(), dni: f.dni.trim() });
    toast('Persona agregada');
    onCreated(leg);
  };
  return (
    <Modal
      title="Agregar persona"
      onClose={onClose}
      footer={<><span className="spacer" /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!ok} onClick={save}>Agregar y completar ficha</button></>}
    >
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field"><span>Legajo</span><input id="ap-leg" className="input mono" inputMode="numeric" autoFocus value={f.legajo} onChange={(e) => setF({ ...f, legajo: e.target.value })} />
          {exists && <small className="bad-text">Ese legajo ya existe ({exists.name || 'sin nombre'}).</small>}
          {!exists && <small className="muted">El mismo número que usa en el reloj.</small>}
        </label>
        <label className="field"><span>DNI</span><input id="ap-dni" className="input mono" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} /></label>
        <label className="field"><span>Apellido</span><input id="ap-last" className="input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></label>
        <label className="field"><span>Nombre</span><input id="ap-first" className="input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></label>
        <button hidden />
      </form>
    </Modal>
  );
}
