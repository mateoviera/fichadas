import { useMemo, useState } from 'react';
import { useStore, addTask } from '../lib/store.js';
import { useToast } from '../components/ui.jsx';
import TaskItem from '../components/TaskItem.jsx';
import TaskDialog from '../components/TaskDialog.jsx';
import RequestDialog from '../components/RequestDialog.jsx';
import EmployeeDrawer from './EmployeeDrawer.jsx';
import { bucketOf, taskCompare, dueText } from '../lib/tasks.js';
import { typeInfo, isFullDay, leaveLength, HOURS } from '../lib/personal.js';
import { todayKey, addDays, fmtDate, weekday } from '../lib/time.js';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const longDate = (k) => `${DAYS[weekday(k)]} ${Number(k.slice(8))} de ${MONTHS[Number(k.slice(5, 7)) - 1]}`;
const greeting = () => { const h = new Date().getHours(); return h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; };

/** Pantalla de inicio: lo que hay que mirar hoy, con accesos a cada sección. */
export default function Inicio() {
  const state = useStore();
  const toast = useToast();
  const today = todayKey();
  const week = addDays(today, 7);
  const [person, setPerson] = useState(null);
  const [task, setTask] = useState(null);
  const [request, setRequest] = useState(null);
  const [quick, setQuick] = useState('');

  const emps = state.employees;
  const active = useMemo(() => Object.values(emps).filter((e) => !e.exitDate || e.exitDate > today), [emps, today]);
  const isActive = (l) => emps[l] && (!emps[l].exitDate || emps[l].exitDate > today);
  const byStart = (a, b) => a.from.localeCompare(b.from);

  const absentToday = state.leaves.filter((l) => l.status === 'aprobada' && l.from <= today && (l.to || l.from) >= today && isActive(l.legajo)).sort(byStart);
  const pendingReq = state.leaves.filter((l) => l.status === 'pendiente' && isActive(l.legajo)).sort(byStart);
  const upcoming = state.leaves.filter((l) => l.status === 'aprobada' && isFullDay(l) && l.from > today && l.from <= week && isActive(l.legajo)).sort(byStart);

  const tasks = (state.tasks || []).filter((t) => !t.done);
  const urgent = tasks.filter((t) => ['vencidas', 'hoy', 'semana'].includes(bucketOf(t, today))).sort(taskCompare);
  const overdue = tasks.filter((t) => bucketOf(t, today) === 'vencidas').length;
  const forToday = tasks.filter((t) => bucketOf(t, today) === 'hoy').length;

  const birthdays = active
    .filter((e) => e.birthDate)
    .map((e) => {
      let next = `${today.slice(0, 4)}${e.birthDate.slice(4)}`;
      if (next < today) next = `${Number(today.slice(0, 4)) + 1}${e.birthDate.slice(4)}`;
      return { e, next };
    })
    .filter((x) => x.next <= week)
    .sort((a, b) => a.next.localeCompare(b.next));

  const missing = [
    ['sin horario asignado', active.filter((e) => !e.scheduleId).length],
    ['sin fecha de ingreso', active.filter((e) => !e.hireDate).length],
    ['sin grupo de vacaciones', active.filter((e) => !e.vacGroup).length],
  ].filter(([, n]) => n);
  const lastPunchDay = state.files.reduce((m, f) => (f.to && f.to > m ? f.to : m), '');

  const addQuick = () => {
    if (!quick.trim()) return;
    addTask({ text: quick.trim(), due: today });
    setQuick('');
    toast('Tarea agregada para hoy');
  };

  const name = (l) => emps[l]?.name || `Leg. ${l}`;
  const leaveRow = (l, extra) => (
    <button key={l.id} className="home-row" onClick={() => setRequest(l)}>
      <span className="home-row-main">
        <b>{name(l.legajo)}</b>
        <span className="muted small">{emps[l.legajo]?.sector || emps[l.legajo]?.position || ''}</span>
      </span>
      <span className={`tag ${typeInfo(l.type).tone}`}>{l.type}</span>
      <span className="muted small nowrap">{extra(l)}</span>
    </button>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{greeting()}</h2>
          <p>Hoy es {longDate(today)}. Esto es lo que hay para mirar.</p>
        </div>
      </div>

      <div className="home-stats">
        <a href="#tareas" className={`home-stat ${overdue ? 'bad' : forToday ? 'warn' : ''}`}>
          <span>Tareas para hoy</span>
          <b>{overdue + forToday}</b>
          <small>{overdue ? `${overdue} vencida${overdue === 1 ? '' : 's'}` : `${tasks.length} pendientes en total`}</small>
        </a>
        <a href="#solicitudes" className="home-stat">
          <span>Ausentes hoy</span>
          <b>{absentToday.filter(isFullDay).length}</b>
          <small>Vacaciones, licencias y francos</small>
        </a>
        <a href="#solicitudes" className={`home-stat ${pendingReq.length ? 'warn' : ''}`}>
          <span>Solicitudes por resolver</span>
          <b>{pendingReq.length}</b>
          <small>Pendientes de aprobar</small>
        </a>
        <a href="#personal" className="home-stat">
          <span>Personal activo</span>
          <b>{active.length}</b>
          <small>{lastPunchDay ? `Fichadas cargadas hasta el ${fmtDate(lastPunchDay)}` : 'Todavía no hay fichadas'}</small>
        </a>
      </div>

      <div className="home-grid">
        <div className="stack">
          <section className="panel task-section">
            <header className="cal-head">
              <h3>Tareas pendientes</h3>
              <span className="muted small">vencidas, de hoy y de los próximos 7 días</span>
              <span className="spacer" />
              <a className="home-more" href="#tareas">Ver todas ({tasks.length})</a>
            </header>
            <div className="home-quick">
              <input
                id="home-quick"
                className="input"
                placeholder="Anotar una tarea para hoy y apretar Enter"
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addQuick()}
              />
              <button className="btn" onClick={() => setTask({})}>Con persona o fecha…</button>
            </div>
            {urgent.length
              ? <div className="task-list">{urgent.slice(0, 10).map((t) => <TaskItem key={t.id} t={t} today={today} emp={emps[t.legajo]} onEdit={setTask} onOpenPerson={setPerson} />)}</div>
              : <div className="home-empty">No hay nada urgente. 🎉</div>}
            {urgent.length > 10 && <a className="home-foot" href="#tareas">y {urgent.length - 10} más…</a>}
          </section>

          <section className="panel task-section">
            <header className="cal-head">
              <h3>Solicitudes por resolver</h3>
              <span className="spacer" />
              <a className="home-more" href="#solicitudes">Ir a solicitudes</a>
            </header>
            {pendingReq.length
              ? <div className="task-list">{pendingReq.slice(0, 8).map((l) => leaveRow(l, (x) => (x.type === HOURS ? `${fmtDate(x.from)} ${x.startTime}–${x.endTime}` : `${fmtDate(x.from)} · ${leaveLength(x)} d`)))}</div>
              : <div className="home-empty">No hay solicitudes pendientes.</div>}
            {pendingReq.length > 8 && <a className="home-foot" href="#solicitudes">y {pendingReq.length - 8} más…</a>}
          </section>
        </div>

        <div className="stack">
          <section className="panel task-section">
            <header className="cal-head">
              <h3>Ausentes hoy</h3>
              <span className="muted small">{absentToday.length || ''}</span>
            </header>
            {absentToday.length
              ? <div className="task-list">{absentToday.map((l) => leaveRow(l, (x) => (x.type === HOURS ? `${x.startTime}–${x.endTime}` : (x.to || x.from) === today ? 'vuelve mañana' : `hasta el ${fmtDate(x.to)}`)))}</div>
              : <div className="home-empty">Hoy no falta nadie por solicitudes cargadas.</div>}
          </section>

          <section className="panel task-section">
            <header className="cal-head"><h3>Salen esta semana</h3></header>
            {upcoming.length
              ? <div className="task-list">{upcoming.map((l) => leaveRow(l, (x) => `desde ${dueText(x.from, today).toLowerCase()} · ${leaveLength(x)} d`))}</div>
              : <div className="home-empty">Nadie empieza vacaciones o licencias en los próximos 7 días.</div>}
          </section>

          {birthdays.length > 0 && (
            <section className="panel task-section">
              <header className="cal-head"><h3>Cumpleaños</h3></header>
              <div className="task-list">
                {birthdays.map(({ e, next }) => (
                  <button key={e.legajo} className="home-row" onClick={() => setPerson(e.legajo)}>
                    <span className="home-row-main"><b>{e.name}</b><span className="muted small">{e.sector || e.position || ''}</span></span>
                    <span className={`pill ${next === today ? 'ok' : 'neutral'}`}>{dueText(next, today)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {missing.length > 0 && (
            <section className="panel task-section">
              <header className="cal-head">
                <h3>Datos para completar</h3>
                <span className="spacer" />
                <a className="home-more" href="#personal">Ir a personal</a>
              </header>
              <div className="task-list">
                {missing.map(([label, n]) => (
                  <a key={label} className="home-row" href="#personal">
                    <span className="home-row-main"><span>{n} {n === 1 ? 'persona' : 'personas'} {label}</span></span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {task && <TaskDialog task={task} onClose={() => setTask(null)} />}
      {request && <RequestDialog request={request} onClose={() => setRequest(null)} />}
      {person && <EmployeeDrawer legajo={person} onClose={() => setPerson(null)} />}
    </>
  );
}
