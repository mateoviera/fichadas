import { useMemo, useState } from 'react';
import { useStore, upsertEmployee, bulkAssign, addLeave, updateLeave, removeLeave, saveVacGroup, deleteVacGroup } from '../lib/store.js';
import { ConfirmButton, useToast } from '../components/ui.jsx';
import { fmtDate, todayKey, eachDay, weekday, WEEKDAYS_LETTER } from '../lib/time.js';
import { VACATION, seniority, fmtSeniority, vacationConflicts, vacationBalance, leaveLength, seniorityCompare } from '../lib/personal.js';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const STATUS = { pendiente: ['Pendiente', 'warn'], aprobada: ['Aprobada', 'ok'], rechazada: ['Rechazada', 'neutral'] };
const SECTIONS = [['vacaciones', 'Vacaciones'], ['legajos', 'Legajos y antigüedad'], ['grupos', 'Grupos de vacaciones']];

const label = (e) => (e ? `${e.name || 'Sin nombre'} #${e.legajo}` : '');
const active = (e, at = todayKey()) => !e.exitDate || e.exitDate >= at;

export default function Gestion() {
  const [sec, setSec] = useState('vacaciones');
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Gestión del personal</h2>
          <p>Antigüedad, vacaciones según la Ley de Contrato de Trabajo y control de superposición: dentro de cada grupo, si se pisan, tiene prioridad la persona más antigua.</p>
        </div>
        <div className="seg" role="group" aria-label="Sección">
          {SECTIONS.map(([k, l]) => <button key={k} aria-pressed={sec === k} onClick={() => setSec(k)}>{l}</button>)}
        </div>
      </div>
      {sec === 'vacaciones' && <Vacaciones />}
      {sec === 'legajos' && <Legajos />}
      {sec === 'grupos' && <Grupos />}
    </>
  );
}

/* ---------------- Vacaciones ---------------- */

function Vacaciones() {
  const state = useStore();
  const toast = useToast();
  const today = todayKey();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [groupF, setGroupF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [form, setForm] = useState({ legajo: '', from: today, to: today, note: '' });
  const [calMonth, setCalMonth] = useState(today.slice(0, 7));

  const emps = state.employees;
  const groups = state.vacGroups || [];
  const groupName = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const conflicts = useMemo(() => vacationConflicts(state), [state]);
  const people = useMemo(() => Object.values(emps).filter((e) => active(e)).sort((a, b) => (a.name || '~').localeCompare(b.name || '~', 'es')), [emps]);
  const years = useMemo(() => {
    const set = new Set([year, Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
    state.leaves.forEach((l) => l.type === VACATION && set.add(Number(l.from.slice(0, 4))));
    return [...set].sort();
  }, [state.leaves, year, today]);

  const list = state.leaves
    .filter((l) => l.type === VACATION && (l.from.startsWith(String(year)) || (l.to || '').startsWith(String(year))))
    .filter((l) => !groupF || (emps[l.legajo]?.vacGroup || '__none') === groupF)
    .filter((l) => !statusF || (statusF === 'conflicto' ? conflicts.get(l.id)?.blockedBy.size : (l.status || 'aprobada') === statusF))
    .sort((a, b) => a.from.localeCompare(b.from) || seniorityCompare(emps[a.legajo], emps[b.legajo]));

  const pendingConflicts = state.leaves.filter((l) => l.type === VACATION && l.status !== 'rechazada' && conflicts.get(l.id)?.blockedBy.size).length;
  const selEmp = emps[form.legajo];
  const bal = selEmp ? vacationBalance(selEmp, state.leaves, Number(form.from.slice(0, 4))) : null;
  const names = (set) => [...set].map((l) => emps[l]?.name || `#${l}`).join(', ');

  const submit = (e) => {
    e.preventDefault();
    if (!form.legajo || !form.from || form.to < form.from) return;
    addLeave({ legajo: form.legajo, from: form.from, to: form.to, type: VACATION, status: 'pendiente', note: form.note });
    toast('Pedido de vacaciones cargado como pendiente');
    setForm({ ...form, note: '' });
  };

  return (
    <div className="stack">
      <form className="panel panel-pad filters" onSubmit={submit}>
        <label className="field">
          <span>Persona</span>
          <select id="v-emp" className="input" value={form.legajo} onChange={(e) => setForm({ ...form, legajo: e.target.value })}>
            <option value="">Elegí…</option>
            {people.map((p) => <option key={p.legajo} value={p.legajo}>{label(p)}</option>)}
          </select>
        </label>
        <label className="field"><span>Desde</span><input id="v-from" type="date" className="input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} /></label>
        <label className="field"><span>Hasta</span><input id="v-to" type="date" className="input" value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
        <label className="field"><span>Nota</span><input id="v-note" className="input" placeholder="Opcional" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <button className="btn primary" disabled={!form.legajo || form.to < form.from}>Cargar pedido</button>
        {selEmp && (
          <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
            {leaveLength(form)} días corridos · Antigüedad {fmtSeniority(seniority(selEmp.hireDate))}
            {bal?.corr ? ` · ${form.from.slice(0, 4)}: le corresponden ${bal.corr.days}, aprobados ${bal.approved}${bal.pending ? `, pendientes ${bal.pending}` : ''}, restan ${bal.left}` : ' · Cargá la fecha de ingreso en «Legajos» para calcular los días que le corresponden'}
            {selEmp.vacGroup ? ` · Grupo: ${groupName[selEmp.vacGroup] || '—'}` : ' · Sin grupo (no se controla superposición)'}
          </p>
        )}
      </form>

      {pendingConflicts > 0 && (
        <div className="notice warn">
          {pendingConflicts === 1 ? 'Hay 1 pedido que se superpone' : `Hay ${pendingConflicts} pedidos que se superponen`} con el de alguien más antiguo del mismo grupo.
          Podés rechazarlo, cambiar las fechas, o aprobarlo como excepción.
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <select id="v-year" className="input" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Año">
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <select id="v-group" className="input" style={{ width: 'auto' }} value={groupF} onChange={(e) => setGroupF(e.target.value)} aria-label="Grupo">
            <option value="">Todos los grupos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value="__none">Sin grupo</option>
          </select>
          <select id="v-status" className="input" style={{ width: 'auto' }} value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Estado">
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
            <option value="conflicto">Con superposición</option>
          </select>
          <span className="spacer" />
          <span className="muted small">{list.length} {list.length === 1 ? 'período' : 'períodos'}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Persona</th><th>Grupo</th><th>Antigüedad</th><th>Período</th><th className="right">Días</th><th>Estado</th><th>Superposición</th><th /></tr>
            </thead>
            <tbody>
              {list.map((l) => {
                const e = emps[l.legajo];
                const c = conflicts.get(l.id);
                const st = l.status || 'aprobada';
                const blocked = c?.blockedBy.size > 0;
                return (
                  <tr key={l.id} className={st === 'rechazada' ? 'dim' : ''}>
                    <td style={{ minWidth: 160 }}><b>{e?.name || 'Sin nombre'}</b> <span className="mono muted">#{l.legajo}</span>{l.note && <div className="small muted">{l.note}</div>}</td>
                    <td className="small">{groupName[e?.vacGroup] || <span className="muted">—</span>}</td>
                    <td className="small nowrap">{fmtSeniority(seniority(e?.hireDate))}</td>
                    <td className="mono nowrap">{fmtDate(l.from)} → {fmtDate(l.to || l.from)}</td>
                    <td className="num right">{leaveLength(l)}</td>
                    <td><span className="row" style={{ gap: 4 }}><span className={`pill ${STATUS[st][1]}`}>{STATUS[st][0]}</span>{l.exception && <span className="pill info">Excepción</span>}</span></td>
                    <td className="small" style={{ minWidth: 180 }}>
                      {blocked && <div className="bad-text">Se pisa con {names(c.blockedBy)} (más antigüedad) · {c.days} {c.days === 1 ? 'día' : 'días'}</div>}
                      {c?.displaces.size > 0 && <div className="muted">Tiene prioridad sobre {names(c.displaces)}</div>}
                      {!c && st !== 'rechazada' && <span className="muted">—</span>}
                    </td>
                    <td>
                      <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        {st !== 'aprobada' && !blocked && <button className="btn sm" onClick={() => updateLeave(l.id, { status: 'aprobada', exception: false })}>Aprobar</button>}
                        {st !== 'aprobada' && blocked && (
                          <ConfirmButton className="btn sm" confirmLabel="Sí, como excepción" onConfirm={() => { updateLeave(l.id, { status: 'aprobada', exception: true }); toast('Aprobada como excepción'); }}>Aprobar igual…</ConfirmButton>
                        )}
                        {st === 'aprobada' && blocked && !l.exception && (
                          <ConfirmButton className="btn sm" confirmLabel="Marcar excepción" onConfirm={() => updateLeave(l.id, { exception: true })}>Excepción…</ConfirmButton>
                        )}
                        {st === 'aprobada' && l.exception && <button className="btn sm ghost" onClick={() => updateLeave(l.id, { exception: false })}>Quitar excepción</button>}
                        {st === 'pendiente' && <button className="btn sm ghost" onClick={() => updateLeave(l.id, { status: 'rechazada' })}>Rechazar</button>}
                        {st !== 'pendiente' && <button className="btn sm ghost" onClick={() => updateLeave(l.id, { status: 'pendiente', exception: false })}>A pendiente</button>}
                        <ConfirmButton confirmLabel="Borrar" onConfirm={() => removeLeave(l.id)}>Borrar</ConfirmButton>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={8} className="empty">No hay vacaciones cargadas para {year}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Calendario month={calMonth} setMonth={setCalMonth} conflicts={conflicts} />
    </div>
  );
}

/** Calendario mensual por grupo: quién está de vacaciones cada día. */
function Calendario({ month, setMonth, conflicts }) {
  const state = useStore();
  const emps = state.employees;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(last).padStart(2, '0')}`;
  const days = [...eachDay(from, to)];
  const shift = (n) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const vacs = state.leaves.filter((l) => l.type === VACATION && l.status !== 'rechazada' && l.from <= to && (l.to || l.from) >= from);
  const groups = [...(state.vacGroups || []), { id: '', name: 'Sin grupo' }];
  const sections = groups
    .map((g) => {
      const legs = [...new Set(vacs.filter((l) => (emps[l.legajo]?.vacGroup || '') === g.id).map((l) => l.legajo))]
        .sort((a, b) => seniorityCompare(emps[a], emps[b]));
      return { g, legs };
    })
    .filter((x) => x.legs.length);

  return (
    <div className="panel">
      <div className="panel-head">
        <b>Calendario</b>
        <button className="btn sm ghost" onClick={() => shift(-1)} aria-label="Mes anterior">‹</button>
        <span style={{ minWidth: 120, textAlign: 'center' }}>{MONTHS[m - 1]} {y}</span>
        <button className="btn sm ghost" onClick={() => shift(1)} aria-label="Mes siguiente">›</button>
        <span className="spacer" />
        <span className="row small muted" style={{ gap: 10 }}>
          <span><i className="cal-key ok" /> Aprobada</span>
          <span><i className="cal-key warn" /> Pendiente</span>
          <span><i className="cal-key bad" /> Se pisa</span>
        </span>
      </div>
      {!sections.length && <div className="empty">Nadie de vacaciones en {MONTHS[m - 1].toLowerCase()}.</div>}
      {sections.map(({ g, legs }) => (
        <div key={g.id || 'none'} className="table-wrap">
          <table className="cal">
            <thead>
              <tr>
                <th className="cal-name">{g.name}{g.max > 0 ? <span className="muted small"> · máx. {g.max} a la vez</span> : g.id ? <span className="muted small"> · sin control</span> : ''}</th>
                {days.map((d) => <th key={d} className={weekday(d) === 0 || weekday(d) === 6 ? 'we' : ''}><span>{WEEKDAYS_LETTER[weekday(d)]}</span>{Number(d.slice(8))}</th>)}
              </tr>
            </thead>
            <tbody>
              {legs.map((leg) => {
                const mine = vacs.filter((l) => l.legajo === leg);
                return (
                  <tr key={leg}>
                    <td className="cal-name">{emps[leg]?.name || `#${leg}`}</td>
                    {days.map((d) => {
                      const l = mine.find((x) => d >= x.from && d <= (x.to || x.from));
                      if (!l) return <td key={d} className={weekday(d) === 0 || weekday(d) === 6 ? 'we' : ''} />;
                      const bad = conflicts.get(l.id)?.blockedBy.size > 0;
                      const tone = bad ? 'bad' : l.status === 'pendiente' ? 'warn' : 'ok';
                      return <td key={d} className={`on ${tone}`} title={`${emps[leg]?.name || leg}: ${fmtDate(l.from)} → ${fmtDate(l.to || l.from)}${bad ? ' · se pisa' : ''}`} />;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Legajos ---------------- */

function Legajos() {
  const state = useStore();
  const today = todayKey();
  const [q, setQ] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [groupF, setGroupF] = useState('');
  const [sectorF, setSectorF] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [target, setTarget] = useState('');
  const toast = useToast();
  const year = Number(today.slice(0, 4));
  const groups = state.vacGroups || [];
  const sectors = useMemo(() => [...new Set(Object.values(state.employees).map((e) => e.sector).filter(Boolean))].sort(), [state.employees]);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return Object.values(state.employees)
      .filter((e) => (showOld || active(e, today)) && (!n || `${e.legajo} ${e.name} ${e.position} ${e.sector}`.toLowerCase().includes(n)))
      .filter((e) => !groupF || (e.vacGroup || '__none') === groupF)
      .filter((e) => !sectorF || (e.sector || '') === sectorF)
      .sort((a, b) => seniorityCompare(a, b));
  }, [state.employees, q, showOld, groupF, sectorF, today]);
  const allSel = list.length > 0 && list.every((e) => sel.has(e.legajo));
  const toggle = (l) => setSel((x) => { const n = new Set(x); n.has(l) ? n.delete(l) : n.add(l); return n; });
  const move = () => {
    const legs = [...sel];
    bulkAssign(legs, { vacGroup: target === '__none' ? '' : target });
    toast(`${legs.length} ${legs.length === 1 ? 'persona movida' : 'personas movidas'} a ${target === '__none' ? 'Sin grupo' : groups.find((g) => g.id === target)?.name}`);
    setSel(new Set());
    setTarget('');
  };

  const set = (leg, patch) => upsertEmployee(leg, patch);

  return (
    <div className="stack">
      <div className="panel panel-pad filters">
        <label className="field"><span>Buscar</span><input id="g-q" className="input" placeholder="Nombre, legajo o puesto" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="field">
          <span>Grupo de vacaciones</span>
          <select id="g-gf" className="input" value={groupF} onChange={(e) => setGroupF(e.target.value)}>
            <option value="">Todos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value="__none">Sin grupo</option>
          </select>
        </label>
        <label className="field">
          <span>Sector</span>
          <select id="g-sf" className="input" value={sectorF} onChange={(e) => setSectorF(e.target.value)}>
            <option value="">Todos</option>
            {sectors.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="row small" style={{ height: 34 }}><input id="g-old" type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Mostrar dados de baja</label>
      </div>
      {sel.size > 0 && (
        <div className="panel panel-pad row">
          <b>{sel.size} {sel.size === 1 ? 'seleccionada' : 'seleccionadas'}</b>
          <select id="g-target" className="input" style={{ width: 'auto' }} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Grupo destino">
            <option value="">Mover al grupo…</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value="__none">Sin grupo</option>
          </select>
          <button className="btn primary" disabled={!target} onClick={move}>Mover</button>
          <button className="btn ghost" onClick={() => setSel(new Set())}>Cancelar</button>
        </div>
      )}
      <p className="muted small">Ordenado por antigüedad (el primero tiene prioridad para las vacaciones). Los días de vacaciones se calculan por la LCT con la antigüedad al 31/12/{year}. Quien tiene fecha de egreso deja de aparecer en el control de fichadas desde ese día.</p>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}><input type="checkbox" aria-label="Seleccionar todos" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(list.map((e) => e.legajo)))} /></th>
              <th>Legajo</th><th>Nombre</th><th>Sector</th><th>Puesto</th><th>Ingreso</th><th>Antigüedad</th><th className="right" title={`Vacaciones ${year}`}>Vac. {year}</th><th>Grupo de vacaciones</th><th>Egreso</th><th>DNI</th><th>CUIL</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => {
              const bal = vacationBalance(e, state.leaves, year);
              const gone = e.exitDate && e.exitDate < today;
              return (
                <tr key={e.legajo} className={gone ? 'dim' : ''}>
                  <td><input type="checkbox" aria-label={`Seleccionar ${e.legajo}`} checked={sel.has(e.legajo)} onChange={() => toggle(e.legajo)} /></td>
                  <td className="mono">{e.legajo}</td>
                  <td style={{ minWidth: 160 }}><input id={`gn-${e.legajo}`} className="input inline" value={e.name} placeholder="Sin nombre" onChange={(ev) => set(e.legajo, { name: ev.target.value })} /></td>
                  <td className="small nowrap">{e.sector || <span className="muted">—</span>}</td>
                  <td style={{ minWidth: 140 }}><input id={`gp-${e.legajo}`} className="input inline" value={e.position || ''} placeholder="—" onChange={(ev) => set(e.legajo, { position: ev.target.value })} /></td>
                  <td><input id={`gi-${e.legajo}`} type="date" className="input inline" value={e.hireDate || ''} onChange={(ev) => set(e.legajo, { hireDate: ev.target.value })} /></td>
                  <td className="small nowrap">{fmtSeniority(seniority(e.hireDate))}</td>
                  <td className="num right nowrap" title={bal.corr?.rule || 'Falta la fecha de ingreso'}>
                    {bal.corr ? <>{bal.corr.days} <span className="muted">· restan</span> <b className={bal.left < 0 ? 'bad-text' : ''}>{bal.left}</b></> : '—'}
                    {bal.pending > 0 && <div className="small muted">{bal.pending} pendientes</div>}
                  </td>
                  <td style={{ minWidth: 220 }}>
                    <select id={`gg-${e.legajo}`} className="input inline" value={e.vacGroup || ''} onChange={(ev) => set(e.legajo, { vacGroup: ev.target.value })}>
                      <option value="">Sin grupo</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </td>
                  <td><input id={`ge-${e.legajo}`} type="date" className="input inline" value={e.exitDate || ''} onChange={(ev) => set(e.legajo, { exitDate: ev.target.value })} /></td>
                  <td style={{ minWidth: 100 }}><input id={`gd-${e.legajo}`} className="input inline mono" value={e.dni || ''} placeholder="—" onChange={(ev) => set(e.legajo, { dni: ev.target.value })} /></td>
                  <td style={{ minWidth: 120 }}><input id={`gc-${e.legajo}`} className="input inline mono" value={e.cuil || ''} placeholder="—" onChange={(ev) => set(e.legajo, { cuil: ev.target.value })} /></td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={12} className="empty">No hay personas para mostrar.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Grupos ---------------- */

function Grupos() {
  const state = useStore();
  const toast = useToast();
  const groups = state.vacGroups || [];
  const emps = Object.values(state.employees).filter((e) => active(e));
  const sectors = [...new Set(emps.map((e) => e.sector).filter(Boolean))].sort();
  const addSector = (g, sector) => {
    const legs = emps.filter((e) => e.sector === sector && e.vacGroup !== g.id).map((e) => e.legajo);
    bulkAssign(legs, { vacGroup: g.id });
    toast(`${legs.length} de ${sector} agregados a ${g.name}`);
  };

  return (
    <div className="stack">
      <div className="row">
        <p className="muted small" style={{ flex: 1, margin: 0 }}>
          Cada grupo define cuántas personas pueden estar de vacaciones al mismo tiempo; los grupos nuevos arrancan en «No pueden superponerse». Si se pasan, conservan el lugar las de mayor antigüedad y las demás quedan marcadas para que decidas: cambiar fechas, rechazar o aprobar como excepción. «Sin control» no marca superposiciones.
        </p>
        <NewGroup />
      </div>
      {groups.map((g) => {
        const members = emps.filter((e) => e.vacGroup === g.id).sort(seniorityCompare);
        const others = emps.filter((e) => e.vacGroup !== g.id).sort((a, b) => (a.name || '~').localeCompare(b.name || '~', 'es'));
        return (
          <div key={g.id} className="panel">
            <div className="panel-head">
              <input id={`vg-n-${g.id}`} className="input" style={{ fontWeight: 600, flex: '1 1 240px' }} value={g.name} onChange={(e) => saveVacGroup({ ...g, name: e.target.value })} />
              <select id={`vg-m-${g.id}`} className="input" style={{ width: 'auto' }} value={g.max} onChange={(e) => saveVacGroup({ ...g, max: Number(e.target.value) })} aria-label="Máximo a la vez">
                <option value={0}>Sin control (flexible)</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? 'No pueden superponerse' : `Hasta ${n} a la vez`}</option>)}
              </select>
              <span className="muted small">{members.length} {members.length === 1 ? 'persona' : 'personas'}</span>
              <ConfirmButton confirmLabel="Eliminar grupo" onConfirm={() => deleteVacGroup(g.id)}>Eliminar</ConfirmButton>
            </div>
            <div className="panel-pad stack" style={{ gap: 8 }}>
              <input id={`vg-note-${g.id}`} className="input" placeholder="Nota (opcional): criterios, excepciones acordadas…" value={g.note || ''} onChange={(e) => saveVacGroup({ ...g, note: e.target.value })} />
              <ol className="members">
                {members.map((e) => (
                  <li key={e.legajo}>
                    <span>{e.name || 'Sin nombre'} <span className="mono muted">#{e.legajo}</span></span>
                    <span className="muted small">{e.position || ''}{e.position ? ' · ' : ''}{e.hireDate ? `ingreso ${fmtDate(e.hireDate)} (${fmtSeniority(seniority(e.hireDate))})` : 'sin fecha de ingreso'}</span>
                    <select className="input" style={{ width: 'auto', height: 26, marginLeft: 6 }} value="" aria-label={`Mover a ${e.name} a otro grupo`} onChange={(ev) => ev.target.value && upsertEmployee(e.legajo, { vacGroup: ev.target.value === '__none' ? '' : ev.target.value })}>
                      <option value="">Mover a…</option>
                      {groups.filter((x) => x.id !== g.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      <option value="__none">Sacar del grupo</option>
                    </select>
                  </li>
                ))}
              </ol>
              <div className="row">
                <select id={`vg-add-${g.id}`} className="input" style={{ maxWidth: 360 }} value="" onChange={(e) => e.target.value && upsertEmployee(e.target.value, { vacGroup: g.id })}>
                  <option value="">Agregar persona…</option>
                  {others.map((e) => <option key={e.legajo} value={e.legajo}>{label(e)}{e.sector ? ` · ${e.sector}` : ''}{e.vacGroup ? ` (en ${groups.find((x) => x.id === e.vacGroup)?.name || 'otro grupo'})` : ''}</option>)}
                </select>
                {sectors.length > 0 && (
                  <select id={`vg-sec-${g.id}`} className="input" style={{ maxWidth: 280 }} value="" onChange={(e) => e.target.value && addSector(g, e.target.value)}>
                    <option value="">Agregar todo un sector…</option>
                    {sectors.map((x) => <option key={x} value={x}>{x} ({emps.filter((e) => e.sector === x).length})</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {!groups.length && <div className="panel empty">No hay grupos. Creá uno para controlar que no se superpongan las vacaciones.</div>}
    </div>
  );
}

/** Alta de grupo con nombre (por defecto: no pueden superponerse). */
function NewGroup() {
  const [name, setName] = useState('');
  const toast = useToast();
  return (
    <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; saveVacGroup({ name: name.trim(), max: 1 }); toast(`Grupo «${name.trim()}» creado`); setName(''); }}>
      <input id="vg-new" className="input" style={{ width: 240 }} placeholder="Nombre del grupo (ej. Enfermería)" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn primary" disabled={!name.trim()}>Crear grupo</button>
    </form>
  );
}
