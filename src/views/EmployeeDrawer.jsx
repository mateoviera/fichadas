import { useState } from 'react';
import { useStore, upsertEmployee, deleteEmployee, createOwnSchedule, addManualPunch, removeManualPunch } from '../lib/store.js';
import { Drawer, ConfirmButton, useToast, TimeInput, Stamp, Avatar } from '../components/ui.jsx';
import RequestDialog, { STATUS_LABEL } from '../components/RequestDialog.jsx';
import { ScheduleCard } from './Horarios.jsx';
import { fmtDate, fmtTime, dateKey, keyToTs, hmToMin, todayKey, fmtDuration } from '../lib/time.js';
import { seniority, fmtSeniority, vacationBalance, fmtStamp, typeInfo, leaveLength, requestMinutes, isPaid, HOURS } from '../lib/personal.js';
import { scheduleLines, scheduleWhatsapp } from '../lib/schedule.js';
import TaskDialog from '../components/TaskDialog.jsx';
import TaskItem from '../components/TaskItem.jsx';
import { taskCompare } from '../lib/tasks.js';

const TABS = [['datos', 'Datos'], ['horario', 'Horario'], ['solicitudes', 'Vacaciones y solicitudes'], ['tareas', 'Tareas'], ['manuales', 'Fichadas manuales']];

/** Separa "Apellido Nombre" cuando todavía no se cargaron por separado (solo para mostrar). */
export function splitName(e) {
  if (e.lastName || e.firstName) return [e.lastName || '', e.firstName || ''];
  const w = (e.name || '').trim().split(/\s+/).filter(Boolean);
  if (w.length < 2) return [w[0] || '', ''];
  return [w[0], w.slice(1).join(' ')];
}

/** Ficha completa de una persona. */
export default function EmployeeDrawer({ legajo, onClose, initialTab = 'datos' }) {
  const state = useStore();
  const toast = useToast();
  const [tab, setTab] = useState(initialTab);
  const emp = state.employees[legajo];
  if (!emp) return null;
  const today = todayKey();
  const gone = emp.exitDate && emp.exitDate <= today;

  return (
    <Drawer
      wide
      title={<><span className="row" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><Avatar emp={emp} size={30} title="" /></span>{emp.name || 'Sin nombre'} <span className="mono muted">#{legajo}</span> {gone ? <span className="pill neutral">De baja</span> : <span className="pill ok">Activo</span>}</>}
      onClose={onClose}
      footer={
        <>
          <Stamp text={fmtStamp(emp)} label="Última modificación" />
          <span className="spacer" />
          {gone
            ? <button className="btn sm" onClick={() => { upsertEmployee(legajo, { exitDate: '' }); toast('Persona reactivada'); }}>Reactivar</button>
            : <ConfirmButton className="btn sm" confirmLabel={`Dar de baja hoy (${fmtDate(today)})`} onConfirm={() => { upsertEmployee(legajo, { exitDate: today }); toast('Persona dada de baja'); }}>Dar de baja</ConfirmButton>}
          <ConfirmButton confirmLabel="Eliminar definitivamente" onConfirm={() => { deleteEmployee(legajo); toast('Persona eliminada'); onClose(); }}>Eliminar</ConfirmButton>
        </>
      }
    >
      <div className="tabs compact" role="tablist">
        {TABS.map(([k, l]) => {
          const n = k === 'tareas' ? (state.tasks || []).filter((t) => t.legajo === legajo && !t.done).length : 0;
          return <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}{n > 0 && <span className="count">{n}</span>}</button>;
        })}
      </div>
      {tab === 'datos' && <Datos emp={emp} state={state} />}
      {tab === 'horario' && <Horario emp={emp} state={state} />}
      {tab === 'solicitudes' && <Solicitudes emp={emp} state={state} />}
      {tab === 'tareas' && <Tareas emp={emp} state={state} />}
      {tab === 'manuales' && <Manuales emp={emp} state={state} />}
    </Drawer>
  );
}

function Datos({ emp, state }) {
  const set = (patch) => upsertEmployee(emp.legajo, patch);
  const [last, first] = splitName(emp);
  const sectors = [...new Set(Object.values(state.employees).map((e) => e.sector).filter(Boolean))].sort();
  const positions = [...new Set(Object.values(state.employees).map((e) => e.position).filter(Boolean))].sort();
  const sen = seniority(emp.hireDate);
  const txt = (k, label, props = {}) => (
    <label className={`field ${props.span ? 'span2' : ''}`}>
      <span>{label}</span>
      <input id={`pd-${k}`} className={`input ${props.mono ? 'mono' : ''}`} type={props.type || 'text'} value={emp[k] || ''} list={props.list} placeholder={props.placeholder || ''} onChange={(e) => set({ [k]: e.target.value })} />
      {props.help && <small className="muted">{props.help}</small>}
    </label>
  );
  return (
    <div className="stack">
      <div className="form-grid">
        <label className="field"><span>Apellido</span><input id="pd-last" className="input" value={last} onChange={(e) => set({ lastName: e.target.value, firstName: first })} /></label>
        <label className="field"><span>Nombre</span><input id="pd-first" className="input" value={first} onChange={(e) => set({ firstName: e.target.value, lastName: last })} /></label>
        <label className="field"><span>Legajo</span><input className="input mono" value={emp.legajo} disabled /></label>
        {txt('dni', 'DNI', { mono: true })}
        {txt('cuil', 'CUIL', { mono: true })}
        {txt('birthDate', 'Fecha de nacimiento', { type: 'date' })}
        {txt('phone', 'Teléfono')}
        {txt('email', 'Email', { type: 'email' })}
      </div>
      <div className="section-title">Trabajo</div>
      <div className="form-grid">
        {txt('position', 'Puesto', { list: 'pd-positions', placeholder: 'Ej.: Psicología' })}
        {txt('sector', 'Sector', { list: 'pd-sectors', placeholder: 'Ej.: Enfermería' })}
        {txt('hireDate', 'Fecha de ingreso', { type: 'date', help: sen ? `Antigüedad: ${fmtSeniority(sen)}` : 'Se usa para la antigüedad y las vacaciones' })}
        {txt('exitDate', 'Fecha de baja', { type: 'date', help: 'Desde ese día deja de aparecer en Fichadas' })}
        <label className="field span2">
          <span>Grupo de vacaciones</span>
          <select id="pd-group" className="input" value={emp.vacGroup || ''} onChange={(e) => set({ vacGroup: e.target.value })}>
            <option value="">Sin grupo (no se controla superposición)</option>
            {(state.vacGroups || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="field span2">
          <span>Notas</span>
          <textarea id="pd-notes" className="input textarea" rows={3} value={emp.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </div>
      <datalist id="pd-sectors">{sectors.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="pd-positions">{positions.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

function Horario({ emp, state }) {
  const sch = state.schedules.find((s) => s.id === emp.scheduleId);
  const used = Object.values(state.employees).filter((e) => e.scheduleId && e.scheduleId === emp.scheduleId).length;
  const estName = (id) => state.establishments[id]?.name || '?';
  return (
    <div className="stack">
      <label className="field">
        <span>Horario asignado</span>
        <select id="pd-sch" className="input" value={emp.scheduleId || ''} onChange={(e) => upsertEmployee(emp.legajo, { scheduleId: e.target.value })}>
          <option value="">Sin horario (no se controla el cumplimiento)</option>
          {state.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {!sch && (
        <div className="notice">
          Sin horario asignado. Elegí uno de la lista o <button className="linklike" onClick={() => createOwnSchedule(emp.legajo)}>creá un horario propio</button>.
        </div>
      )}
      {sch && used > 1 && (
        <>
          <div className="panel panel-pad">
            <ul className="plain">{scheduleLines(sch, estName).map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
          <div className="notice">
            Este horario lo comparten {used} personas: si lo cambiás, cambia para todas. Para cambiarlo solo para {emp.name || 'esta persona'},{' '}
            <button className="linklike" onClick={() => createOwnSchedule(emp.legajo)}>creá un horario propio a partir de este</button>.
          </div>
        </>
      )}
      {sch && used <= 1 && <ScheduleCard s={sch} used={used} establishments={state.establishments} />}
      {sch && <CopySchedule text={scheduleWhatsapp(sch, emp.name, (id) => state.establishments[id]?.name || '')} />}
      <p className="muted small">Los modelos de horario compartidos se administran en Configuración → Horarios.</p>
    </div>
  );
}

/** Copia el horario con formato de WhatsApp (negritas y viñetas) para pegarlo en un chat. */
function CopySchedule({ text }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Navegadores sin permiso de portapapeles: se copia con un campo oculto.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Horario copiado: pegalo en WhatsApp');
  };
  return <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={copy}>Copiar</button>;
}

function Solicitudes({ emp, state }) {
  const [dialog, setDialog] = useState(null);
  const year = Number(todayKey().slice(0, 4));
  const bal = vacationBalance(emp, state.leaves, year);
  const list = state.leaves.filter((l) => l.legajo === emp.legajo).sort((a, b) => b.from.localeCompare(a.from));
  const unpaid = list.filter((l) => !isPaid(l) && l.status !== 'rechazada' && l.from.startsWith(String(year))).reduce((n, l) => n + leaveLength(l), 0);
  return (
    <div className="stack">
      <div className="facts">
        <div><span>Vacaciones {year}</span><b>{bal.corr ? `${bal.corr.days} días` : 'Falta fecha de ingreso'}</b></div>
        <div><span>Aprobadas</span><b>{bal.approved}</b></div>
        <div><span>Pendientes</span><b>{bal.pending}</b></div>
        <div><span>Disponibles</span><b className={bal.left < 0 ? 'bad-text' : ''}>{bal.corr ? bal.corr.days - bal.approved - bal.pending : '—'}</b></div>
        {unpaid > 0 && <div><span>Sin goce de sueldo {year}</span><b style={{ color: '#ea580c' }}>{unpaid} {unpaid === 1 ? 'día' : 'días'}</b></div>}
      </div>
      <div className="row">
        <span className="muted small">{list.length} {list.length === 1 ? 'solicitud' : 'solicitudes'}</span>
        <span className="spacer" />
        <button className="btn primary sm" onClick={() => setDialog({ legajo: emp.legajo })}>Nueva solicitud</button>
      </div>
      {list.length > 0 && (
        <div className="panel list">
          {list.map((l) => (
            <button key={l.id} className="list-item" onClick={() => setDialog(l)}>
              <span className={`tag ${typeInfo(l.type).tone}`}>{l.type}</span>
              <span className="nowrap">{fmtDate(l.from)}{l.type === HOURS ? ` ${l.startTime}–${l.endTime}` : (l.to || l.from) !== l.from ? ` → ${fmtDate(l.to)}` : ''}</span>
              <span className="muted small">{l.type === HOURS ? `${fmtDuration(requestMinutes(l))} h` : `${leaveLength(l)} d`}</span>
              <span className="spacer" />
              {l.exception && <span className="pill info">Excepción</span>}
              <span className={`pill ${l.status === 'pendiente' ? 'warn' : l.status === 'rechazada' ? 'neutral' : 'ok'}`}>{STATUS_LABEL[l.status || 'aprobada']}</span>
            </button>
          ))}
        </div>
      )}
      {dialog && <RequestDialog request={dialog} lockPerson onClose={() => setDialog(null)} />}
    </div>
  );
}

function Tareas({ emp, state }) {
  const [dialog, setDialog] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const today = todayKey();
  const mine = (state.tasks || []).filter((t) => t.legajo === emp.legajo);
  const pending = mine.filter((t) => !t.done).sort(taskCompare);
  const done = mine.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const item = (t) => <TaskItem key={t.id} t={t} today={today} onEdit={setDialog} />;
  return (
    <div className="stack">
      <div className="row">
        <span className="muted small">Cosas pendientes con {emp.name || 'esta persona'} o que tenés que avisarle. También aparecen en la sección Tareas.</span>
        <span className="spacer" />
        <button className="btn primary sm" onClick={() => setDialog({ legajo: emp.legajo })}>Nueva tarea</button>
      </div>
      {pending.length > 0
        ? <div className="panel task-list">{pending.map(item)}</div>
        : <div className="panel empty">No hay tareas pendientes.</div>}
      {done.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <button className="linklike small" style={{ width: 'fit-content' }} onClick={() => setShowDone((v) => !v)}>{showDone ? 'Ocultar' : 'Ver'} hechas ({done.length})</button>
          {showDone && <div className="panel task-list">{done.map(item)}</div>}
        </div>
      )}
      {dialog && <TaskDialog task={dialog} lockPerson onClose={() => setDialog(null)} />}
    </div>
  );
}

function Manuales({ emp, state }) {
  const toast = useToast();
  const legajo = emp.legajo;
  const ests = Object.values(state.establishments);
  const empEsts = [...new Set(state.punches.filter((p) => p.l === legajo).map((p) => p.e))];
  const manual = state.punches.filter((p) => p.l === legajo && p.f === 'manual').sort((a, b) => b.t - a.t);
  const [mp, setMp] = useState({ date: todayKey(), time: '08:00', estId: empEsts[0] || ests[0]?.id || '', note: '' });
  return (
    <div className="stack">
      <p className="muted small">Para olvidos o fallas del reloj. En Fichadas se marcan con «M».</p>
      <div className="row">
        <input id="mp-date" type="date" className="input" value={mp.date} onChange={(e) => setMp({ ...mp, date: e.target.value })} />
        <TimeInput id="mp-time" value={mp.time} onChange={(v) => setMp({ ...mp, time: v })} />
        <select id="mp-est" className="input" style={{ flex: 1 }} value={mp.estId} onChange={(e) => setMp({ ...mp, estId: e.target.value })}>
          {ests.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="row">
        <input id="mp-note" className="input" style={{ flex: 1 }} placeholder="Motivo (opcional)" value={mp.note} onChange={(e) => setMp({ ...mp, note: e.target.value })} />
        <button
          className="btn"
          disabled={!mp.estId || !mp.date || !mp.time}
          onClick={() => {
            addManualPunch({ legajo, estId: mp.estId, ts: keyToTs(mp.date) + hmToMin(mp.time) * 60, note: mp.note || 'Fichada manual' });
            toast('Fichada manual agregada');
          }}
        >Agregar</button>
      </div>
      {!ests.length && <p className="notice warn">Primero cargá al menos un archivo del reloj para tener establecimientos.</p>}
      {manual.length > 0 && (
        <div className="panel list">
          {manual.map((p) => (
            <div key={p.id} className="row list-row">
              <span className="mono">{fmtDate(dateKey(p.t))} {fmtTime(p.t)}</span>
              <span className="muted small">{state.establishments[p.e]?.name} · {p.m}</span>
              <span className="spacer" />
              <ConfirmButton confirmLabel="Quitar" onConfirm={() => removeManualPunch(p.id)}>Quitar</ConfirmButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
