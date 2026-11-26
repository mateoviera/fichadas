import { useEffect, useMemo, useState } from 'react';
import { download } from '../lib/io.js';
import { buildXlsx } from '../lib/xlsx.js';
import { liquidacionSheets, monthLeaves, unpaidSummary } from '../lib/liquidacion.js';
import { useStore, upsertEmployee, bulkAssign, updateLeave, saveVacGroup, deleteVacGroup } from '../lib/store.js';
import { ConfirmButton, useToast, WarnDialog, Stamp, Help } from '../components/ui.jsx';
import RequestDialog, { STATUS_LABEL } from '../components/RequestDialog.jsx';
import { fmtDate, todayKey, eachDay, weekday, WEEKDAYS_LETTER, fmtDuration } from '../lib/time.js';
import {
  REQUEST_TYPES, HOURS, typeInfo, isFullDay, seniority, fmtSeniority, vacationConflicts, leaveLength, seniorityCompare, checkRequest, fmtStamp, requestMinutes,
} from '../lib/personal.js';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const STATUS_TONE = { pendiente: 'warn', aprobada: 'ok', rechazada: 'neutral' };
const SECTIONS = [['calendario', 'Calendario'], ['lista', 'Solicitudes'], ['grupos', 'Grupos']];
const active = (e, at = todayKey()) => !e.exitDate || e.exitDate >= at;
const isWe = (d) => weekday(d) === 0 || weekday(d) === 6;

export default function Solicitudes() {
  const [sec, setSec] = useState('calendario');
  const [dialog, setDialog] = useState(null); // solicitud a editar o borrador
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Vacaciones y solicitudes</h2>
          <p>Vacaciones, días particulares, licencias y permisos por horas. Dentro de cada grupo se controla que no falten más personas de las permitidas; si se pisan, tiene prioridad la de mayor antigüedad.</p>
        </div>
        <button className="btn primary" onClick={() => setDialog({})}>Nueva solicitud</button>
      </div>
      <div className="tabs" role="tablist">
        {SECTIONS.map(([k, l]) => <button key={k} role="tab" aria-selected={sec === k} onClick={() => setSec(k)}>{l}</button>)}
      </div>
      {sec === 'calendario' && <Calendario onOpen={setDialog} />}
      {sec === 'lista' && <Lista onOpen={setDialog} />}
      {sec === 'grupos' && <Grupos />}
      {dialog && <RequestDialog request={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}

/* ---------------- Calendario interactivo ---------------- */

function Calendario({ onOpen }) {
  const state = useStore();
  const emps = state.employees;
  const groups = state.vacGroups || [];
  const today = todayKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [groupF, setGroupF] = useState('');
  const [everyone, setEveryone] = useState(false);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null); // { legajo, start }
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && setPick(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(last).padStart(2, '0')}`;
  const days = [...eachDay(from, to)];
  const shift = (n) => setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));

  const conflicts = useMemo(() => vacationConflicts(state), [state]);
  const reqs = state.leaves.filter((l) => l.status !== 'rechazada' && l.from <= to && (l.to || l.from) >= from);
  const needle = q.trim().toLowerCase();
  const showAll = everyone || !!groupF;

  const sections = [...groups, { id: '', name: 'Sin grupo', max: 0 }]
    .filter((g) => !groupF || (groupF === '__none' ? g.id === '' : g.id === groupF))
    .map((g) => {
      const members = Object.values(emps).filter((e) => (e.vacGroup || '') === g.id && active(e, from));
      const withReq = new Set(reqs.map((l) => l.legajo));
      const rows = members
        .filter((e) => showAll || withReq.has(e.legajo))
        .filter((e) => !needle || `${e.legajo} ${e.name}`.toLowerCase().includes(needle))
        .sort(seniorityCompare);
      const count = (d) => reqs.filter((l) => isFullDay(l) && (emps[l.legajo]?.vacGroup || '') === g.id && d >= l.from && d <= (l.to || l.from)).length;
      return { g, rows, count };
    })
    .filter((x) => x.rows.length);

  const clickEmpty = (legajo, d) => {
    if (!pick || pick.legajo !== legajo) return setPick({ legajo, start: d });
    const [a, b] = pick.start <= d ? [pick.start, d] : [d, pick.start];
    setPick(null);
    onOpen({ legajo, from: a, to: b });
  };
  const inPick = (legajo, d) => {
    if (!pick || pick.legajo !== legajo) return false;
    const end = hover && hover.legajo === legajo ? hover.d : pick.start;
    const [a, b] = pick.start <= end ? [pick.start, end] : [end, pick.start];
    return d >= a && d <= b;
  };

  return (
    <div className="stack">
      <div className="panel panel-pad toolbar">
        <div className="row" style={{ gap: 4 }}>
          <button className="btn sm" onClick={() => shift(-1)} aria-label="Mes anterior">‹</button>
          <b className="month-label">{MONTHS[m - 1]} {y}</b>
          <button className="btn sm" onClick={() => shift(1)} aria-label="Mes siguiente">›</button>
          {month !== today.slice(0, 7) && <button className="btn sm ghost" onClick={() => setMonth(today.slice(0, 7))}>Hoy</button>}
        </div>
        <select id="c-group" className="input" value={groupF} onChange={(e) => setGroupF(e.target.value)} aria-label="Grupo">
          <option value="">Todos los grupos</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          <option value="__none">Sin grupo</option>
        </select>
        <input id="c-q" className="input" placeholder="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} />
        {!groupF && <label className="row small"><input id="c-all" type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> Mostrar a todo el personal</label>}
      </div>

      <div className={`notice small ${pick ? '' : 'calm'}`}>
        {pick
          ? <>Elegí el <b>último día</b> para {emps[pick.legajo]?.name || pick.legajo} (o tocá el mismo día si es uno solo). <button className="linklike" onClick={() => setPick(null)}>Cancelar</button></>
          : <>Tocá un día libre en la fila de una persona para empezar una solicitud, y otro día para terminarla. Tocá una solicitud para verla o cambiarla.{!showAll && ' Ahora se muestran solo quienes tienen algo cargado este mes.'}</>}
      </div>

      <div className="panel panel-pad cal-legend small">
        <span className="legend"><i className="lg vac" /> Vacaciones</span>
        <span className="legend"><i className="lg day" /> Día particular / franco</span>
        <span className="legend"><i className="lg med" /> Licencia médica</span>
        <span className="legend"><i className="lg unpaid" /> Sin goce de sueldo</span>
        <span className="legend"><i className="lg other" /> Otras</span>
        <span className="legend"><i className="lg pend" /> Pendiente</span>
        <span className="legend"><i className="lg clash" /> Se pisa</span>
        <span className="legend"><i className="dot" /> Permiso por horas</span>
        <span className="legend"><b className="lg-num">2</b> Personas del grupo ausentes ese día (en rojo si supera el máximo)</span>
      </div>
      {!sections.length && <div className="panel empty">No hay solicitudes en {MONTHS[m - 1].toLowerCase()}. Elegí un grupo o marcá «Mostrar a todo el personal» para cargar una desde el calendario.</div>}
      {sections.map(({ g, rows, count }) => (
        <section key={g.id || 'none'} className="panel cal-section">
          <header className="cal-head">
            <h3>{g.name}</h3>
            <span className="muted small">
              {rows.length} {rows.length === 1 ? 'persona' : 'personas'}
              {g.max > 0 ? ` · pueden faltar hasta ${g.max} a la vez` : g.id ? ' · sin límite de ausencias' : ''}
            </span>
          </header>
          <table className="cal">
            <colgroup><col className="cal-namecol" />{days.map((d) => <col key={d} />)}</colgroup>
            <thead>
              <tr>
                <th className="cal-name">Persona</th>
                {days.map((d) => <th key={d} className={`${isWe(d) ? 'we' : ''} ${d === today ? 'today' : ''}`}><span>{WEEKDAYS_LETTER[weekday(d)]}</span>{Number(d.slice(8))}</th>)}
              </tr>
              {g.max > 0 && (
                <tr className="avail">
                  <th className="cal-name" title="Cuántas personas del grupo están ausentes cada día. Se marca en amarillo al llegar al máximo y en rojo si lo supera.">Ausentes (máx. {g.max})</th>
                  {days.map((d) => {
                    const c = count(d);
                    return <th key={d} className={c > g.max ? 'over' : c === g.max ? 'full' : ''} title={`${c} ausente${c === 1 ? '' : 's'} de ${g.max} permitido${g.max === 1 ? '' : 's'}`}>{c || ''}</th>;
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map((e) => {
                const mine = reqs.filter((l) => l.legajo === e.legajo);
                return (
                  <tr key={e.legajo}>
                    <td className="cal-name">
                      <span className="nm" title={e.name}>{e.name || `#${e.legajo}`}</span>
                      <span className="muted sub">{fmtSeniority(seniority(e.hireDate)) || `Leg. ${e.legajo}`}</span>
                    </td>
                      {days.map((d) => {
                        const full = mine.find((l) => isFullDay(l) && d >= l.from && d <= (l.to || l.from));
                        const hrs = mine.filter((l) => !isFullDay(l) && l.from === d);
                        if (full) {
                          const c = conflicts.get(full.id);
                          const cls = ['on', typeInfo(full.type).tone, full.status === 'pendiente' ? 'pend' : '', c?.blockedBy.size ? 'clash' : '', d === full.from ? 'start' : '', d === (full.to || full.from) ? 'end' : ''].join(' ');
                          return (
                            <td key={d} className={cls}>
                              <button type="button" onClick={() => onOpen(full)} title={`${e.name}: ${full.type} ${fmtDate(full.from)} → ${fmtDate(full.to || full.from)} · ${STATUS_LABEL[full.status || 'aprobada']}${full.exception ? ' · excepción' : ''}${c?.blockedBy.size ? ' · se pisa' : ''}`} aria-label={`${full.type} de ${e.name}`} />
                            </td>
                          );
                        }
                        return (
                          <td key={d} className={`${isWe(d) ? 'we' : ''} ${inPick(e.legajo, d) ? 'picking' : ''}`}>
                            <button
                              type="button"
                              onClick={() => (hrs.length ? onOpen(hrs[0]) : clickEmpty(e.legajo, d))}
                              onMouseEnter={() => setHover({ legajo: e.legajo, d })}
                              title={hrs.length ? `${HOURS}: ${hrs.map((h) => `${h.startTime}–${h.endTime}`).join(', ')}` : `${e.name} · ${fmtDate(d)}`}
                              aria-label={`${e.name} ${fmtDate(d)}`}
                            >{hrs.length > 0 && <i className="dot" />}</button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </section>
      ))}
    </div>
  );
}

/* ---------------- Lista de solicitudes ---------------- */

/** Exportación del mes para liquidación de sueldos (con goce / sin goce de sueldo). */
function Liquidacion({ state }) {
  const toast = useToast();
  const today = todayKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const sum = unpaidSummary(state, month);
  const count = monthLeaves(state, month).length;
  const exportXlsx = () => {
    download(`ausencias-liquidacion-${month}.xlsx`, buildXlsx(liquidacionSheets(state, month)));
    toast('Excel para liquidación generado');
  };
  return (
    <div className="panel panel-pad liq">
      <b>Para liquidación</b>
      <input id="liq-month" type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value || today.slice(0, 7))} aria-label="Mes" />
      <span className="small muted">
        {count} {count === 1 ? 'ausencia aprobada' : 'ausencias aprobadas'}
        {sum.days > 0 && <> · <span className="tag unpaid">{sum.days} {sum.days === 1 ? 'día' : 'días'} sin goce de sueldo</span> ({sum.people} {sum.people === 1 ? 'persona' : 'personas'})</>}
      </span>
      <span className="spacer" />
      <button className="btn" disabled={!count} onClick={exportXlsx}>Exportar Excel del mes</button>
    </div>
  );
}

function Lista({ onOpen }) {
  const state = useStore();
  const toast = useToast();
  const emps = state.employees;
  const today = todayKey();
  const groups = state.vacGroups || [];
  const groupName = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [groupF, setGroupF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [q, setQ] = useState('');
  const [warn, setWarn] = useState(null); // { leave, problems }
  const conflicts = useMemo(() => vacationConflicts(state), [state]);

  const years = useMemo(() => {
    const set = new Set([year, Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]);
    state.leaves.forEach((l) => set.add(Number(l.from.slice(0, 4))));
    return [...set].sort();
  }, [state.leaves, year, today]);

  const needle = q.trim().toLowerCase();
  const list = state.leaves
    .filter((l) => l.from.startsWith(String(year)) || (l.to || '').startsWith(String(year)))
    .filter((l) => !groupF || (emps[l.legajo]?.vacGroup || '__none') === groupF)
    .filter((l) => !typeF || l.type === typeF)
    .filter((l) => !statusF || (statusF === 'conflicto' ? conflicts.get(l.id)?.blockedBy.size : (l.status || 'aprobada') === statusF))
    .filter((l) => !needle || `${l.legajo} ${emps[l.legajo]?.name || ''}`.toLowerCase().includes(needle))
    .sort((a, b) => b.from.localeCompare(a.from));
  const pending = state.leaves.filter((l) => l.status === 'pendiente').length;
  const names = (set) => [...set].map((l) => emps[l]?.name || `#${l}`).join(', ');

  const approve = (l) => {
    const problems = checkRequest(state, { ...l, status: 'aprobada' });
    if (problems.length) setWarn({ leave: l, problems });
    else { updateLeave(l.id, { status: 'aprobada', exception: false }); toast('Aprobada'); }
  };

  return (
    <div className="stack">
      <div className="panel panel-pad toolbar">
        <select id="l-year" className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Año">{years.map((y) => <option key={y}>{y}</option>)}</select>
        <select id="l-type" className="input" value={typeF} onChange={(e) => setTypeF(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {REQUEST_TYPES.map((t) => <option key={t.id}>{t.id}</option>)}
        </select>
        <select id="l-status" className="input" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendientes{pending ? ` (${pending})` : ''}</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="conflicto">Que se pisan</option>
        </select>
        <select id="l-group" className="input" value={groupF} onChange={(e) => setGroupF(e.target.value)} aria-label="Grupo">
          <option value="">Todos los grupos</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          <option value="__none">Sin grupo</option>
        </select>
        <input id="l-q" className="input" placeholder="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Liquidacion state={state} />

      <div className="panel">
        <table className="req-table">
          <colgroup><col className="c-person" /><col className="c-period" /><col className="c-status" /><col /><col className="c-actions" /></colgroup>
          <thead>
            <tr><th>Persona</th><th>Tipo y período</th><th>Estado</th><th>Observaciones</th><th /></tr>
          </thead>
          <tbody>
            {list.map((l) => {
              const e = emps[l.legajo];
              const c = conflicts.get(l.id);
              const st = l.status || 'aprobada';
              const hrs = l.type === HOURS;
              return (
                <tr key={l.id} className={st === 'rechazada' ? 'dim' : ''}>
                  <td>
                    <b>{e?.name || 'Sin nombre'}</b> <span className="mono muted small">#{l.legajo}</span>
                    <div className="small muted">{groupName[e?.vacGroup] || 'Sin grupo'}</div>
                  </td>
                  <td>
                    <span className={`tag ${typeInfo(l.type).tone}`}>{l.type}</span>
                    <div className="small">
                      {fmtDate(l.from)}{hrs ? ` ${l.startTime}–${l.endTime}` : (l.to || l.from) !== l.from ? ` → ${fmtDate(l.to)}` : ''}
                      <span className="muted"> · {hrs ? `${fmtDuration(requestMinutes(l))} h` : `${leaveLength(l)} ${leaveLength(l) === 1 ? 'día' : 'días'}`}</span>
                    </div>
                  </td>
                  <td>
                    <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}><span className={`pill ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span>{l.exception && <span className="pill info" title="Se cargó a pesar de no cumplir alguna regla">Excepción</span>}</span>
                    <div className="small muted" title="Última modificación">{fmtStamp(l) || ''}</div>
                  </td>
                  <td className="small">
                    {c?.blockedBy.size > 0 && <div className="bad-text">Se pisa con {names(c.blockedBy)} (más antigüedad)</div>}
                    {c?.displaces.size > 0 && <div className="muted">Tiene prioridad sobre {names(c.displaces)}</div>}
                    {l.note && <div className="muted">{l.note}</div>}
                  </td>
                  <td>
                    <span className="req-actions">
                      {st === 'pendiente' && <button className="btn sm" onClick={() => approve(l)}>Aprobar</button>}
                      {st === 'pendiente' && <button className="btn sm ghost" onClick={() => updateLeave(l.id, { status: 'rechazada' })}>Rechazar</button>}
                      <button className="btn sm ghost" onClick={() => onOpen(l)}>Abrir</button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={5} className="empty">No hay solicitudes con esos filtros en {year}.</td></tr>}
          </tbody>
        </table>
      </div>
      {warn && (
        <WarnDialog
          title="Esta solicitud no debería aprobarse"
          intro={`${emps[warn.leave.legajo]?.name || ''} · ${warn.leave.type} · ${fmtDate(warn.leave.from)}${(warn.leave.to || warn.leave.from) !== warn.leave.from ? ` al ${fmtDate(warn.leave.to)}` : ''}`}
          problems={warn.problems}
          confirmLabel="Aprobar igual"
          onConfirm={() => { updateLeave(warn.leave.id, { status: 'aprobada', exception: true }); toast('Aprobada como excepción'); setWarn(null); }}
          onClose={() => setWarn(null)}
        />
      )}
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
  const label = (e) => `${e.name || 'Sin nombre'} · #${e.legajo}`;
  const addSector = (g, sector) => {
    const legs = emps.filter((e) => e.sector === sector && e.vacGroup !== g.id).map((e) => e.legajo);
    bulkAssign(legs, { vacGroup: g.id });
    toast(`${legs.length} de ${sector} agregados a ${g.name}`);
  };

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 380px' }}>
          <p className="muted small" style={{ margin: 0 }}>
            Cada grupo define cuántas personas pueden faltar al mismo tiempo (vacaciones, días particulares, licencias). Los grupos nuevos arrancan en «No pueden superponerse».
            Dentro del grupo las personas están ordenadas por antigüedad: la primera tiene prioridad.
          </p>
        </div>
        <NewGroup />
      </div>
      {groups.map((g) => {
        const members = emps.filter((e) => e.vacGroup === g.id).sort(seniorityCompare);
        const others = emps.filter((e) => e.vacGroup !== g.id).sort((a, b) => (a.name || '~').localeCompare(b.name || '~', 'es'));
        return (
          <div key={g.id} className="panel">
            <div className="panel-head">
              <input id={`vg-n-${g.id}`} className="input" style={{ fontWeight: 600, flex: '1 1 240px' }} value={g.name} onChange={(e) => saveVacGroup({ ...g, name: e.target.value })} aria-label="Nombre del grupo" />
              <select id={`vg-m-${g.id}`} className="input" style={{ width: 'auto' }} value={g.max} onChange={(e) => saveVacGroup({ ...g, max: Number(e.target.value) })} aria-label="Cuántos pueden faltar a la vez">
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
                    <span className="muted small">{e.position || e.sector || ''}{e.position || e.sector ? ' · ' : ''}{e.hireDate ? `${fmtSeniority(seniority(e.hireDate))} de antigüedad` : 'sin fecha de ingreso'}</span>
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
                <span className="spacer" />
                <Stamp text={fmtStamp(g)} />
              </div>
            </div>
          </div>
        );
      })}
      {!groups.length && <div className="panel empty">No hay grupos. Creá uno para controlar que no falten varias personas a la vez.</div>}
      <Help summary="¿Cómo funciona la prioridad?">
        <p>Si dentro de un grupo hay más personas ausentes que las permitidas, conservan el lugar las de mayor antigüedad (fecha de ingreso más vieja). Las demás quedan marcadas en rojo como «se pisa».</p>
        <p>Cuando cargás o aprobás algo que no corresponde, aparece un aviso con el motivo y te pregunta si querés hacerlo igual. Si aceptás, queda como <b>excepción</b> y deja de marcarse.</p>
      </Help>
    </div>
  );
}

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
