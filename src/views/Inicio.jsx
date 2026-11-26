import { useMemo, useState } from 'react';
import { useStore, addTask, toggleTask, updateLeave } from '../lib/store.js';
import { useToast, Avatar } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import TaskDialog from '../components/TaskDialog.jsx';
import RequestDialog from '../components/RequestDialog.jsx';
import EmployeeDrawer from './EmployeeDrawer.jsx';
import { bucketOf, taskCompare, dueText } from '../lib/tasks.js';
import { typeInfo, isFullDay, leaveLength, checkRequest, HOURS } from '../lib/personal.js';
import { todayKey, addDays, fmtDate, weekday, eachDay } from '../lib/time.js';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MON3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const longDate = (k) => `${DAYS[weekday(k)]} ${Number(k.slice(8))} de ${MONTHS[Number(k.slice(5, 7)) - 1]}`;

/** Próxima fecha (desde hoy) en que se cumple un aniversario de `date` (AAAA-MM-DD). */
function nextAnniversary(date, today) {
  const y = Number(today.slice(0, 4));
  let next = `${y}${date.slice(4)}`;
  if (next < today) next = `${y + 1}${date.slice(4)}`;
  return { next, years: Number(next.slice(0, 4)) - Number(date.slice(0, 4)) };
}

function DateBadge({ date, kind = '' }) {
  return (
    <span className={`date-badge ${kind}`}>
      <small>{MON3[Number(date.slice(5, 7)) - 1]}</small>
      <b>{Number(date.slice(8))}</b>
    </span>
  );
}

/** Pantalla de inicio: widgets con lo que hay que mirar hoy y accesos a cada sección. */
export default function Inicio() {
  const state = useStore();
  const toast = useToast();
  const today = todayKey();
  const [person, setPerson] = useState(null);
  const [task, setTask] = useState(null);
  const [request, setRequest] = useState(null);
  const [quick, setQuick] = useState('');

  const emps = state.employees;
  const active = useMemo(() => Object.values(emps).filter((e) => !e.exitDate || e.exitDate > today), [emps, today]);
  const isActive = (l) => emps[l] && (!emps[l].exitDate || emps[l].exitDate > today);
  const byStart = (a, b) => a.from.localeCompare(b.from);
  const onDay = (l, d) => l.from <= d && (l.to || l.from) >= d;

  const approvedFull = state.leaves.filter((l) => l.status === 'aprobada' && isActive(l.legajo));
  const absentToday = approvedFull.filter((l) => onDay(l, today)).sort(byStart);
  const pendingReq = state.leaves.filter((l) => l.status === 'pendiente' && isActive(l.legajo)).sort(byStart);
  const upcoming = approvedFull.filter((l) => isFullDay(l) && l.from > today && l.from <= addDays(today, 7)).sort(byStart);

  const tasks = (state.tasks || []).filter((t) => !t.done);
  const urgent = tasks.filter((t) => ['vencidas', 'hoy', 'semana'].includes(bucketOf(t, today))).sort(taskCompare);
  const overdue = tasks.filter((t) => bucketOf(t, today) === 'vencidas').length;
  const forToday = tasks.filter((t) => bucketOf(t, today) === 'hoy').length;

  const in30 = addDays(today, 30);
  const celebrations = [
    ...active.filter((e) => e.birthDate).map((e) => ({ e, kind: 'bday', ...nextAnniversary(e.birthDate, today) })),
    ...active.filter((e) => e.hireDate && e.hireDate < today).map((e) => ({ e, kind: 'work', ...nextAnniversary(e.hireDate, today) })).filter((x) => x.years > 0),
  ].filter((x) => x.next <= in30).sort((a, b) => a.next.localeCompare(b.next) || (a.kind === 'bday' ? -1 : 1));

  const events = [
    ...state.holidays.filter((h) => h.date >= today && h.date <= addDays(today, 45)).map((h) => ({ date: h.date, kind: 'hol', title: h.name || 'Feriado', sub: 'Feriado' })),
    ...approvedFull.filter((l) => isFullDay(l) && l.from >= today && l.from <= addDays(today, 14)).map((l) => ({ date: l.from, kind: '', title: emps[l.legajo]?.name, sub: `Empieza ${l.type.toLowerCase()} · ${leaveLength(l)} d`, l })),
    ...approvedFull.filter((l) => isFullDay(l) && (l.to || l.from) >= today && (l.to || l.from) <= addDays(today, 7)).map((l) => ({ date: addDays(l.to || l.from, 1), kind: '', title: emps[l.legajo]?.name, sub: `Vuelve de ${l.type.toLowerCase()}`, l })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

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
  const approve = (l) => {
    if (checkRequest(state, { ...l, status: 'aprobada' }).length) { setRequest(l); return; } // tiene reparos: se resuelve en la ventana
    updateLeave(l.id, { status: 'aprobada' });
    toast(`Aprobada: ${emps[l.legajo]?.name || ''}`);
  };

  const name = (l) => emps[l]?.name || `Leg. ${l}`;
  const stat = (href, icon, label, value, sub, tone = '') => (
    <a href={href} className={`home-stat ${tone}`}>
      <span className="stat-ico"><Icon name={icon} size={18} /></span>
      <span>{label}</span>
      <b>{value}</b>
      <small>{sub}</small>
    </a>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Inicio</h2>
        </div>
      </div>

      <div className="home-stats">
        {stat('#tareas', 'check', 'Tareas para hoy', overdue + forToday, overdue ? `${overdue} vencida${overdue === 1 ? '' : 's'}` : `${tasks.length} pendientes en total`, overdue ? 'bad' : forToday ? 'warn' : '')}
        {stat('#solicitudes', 'plane', 'Ausentes hoy', absentToday.filter(isFullDay).length, 'Vacaciones, licencias y francos')}
        {stat('#solicitudes', 'inbox', 'Solicitudes por resolver', pendingReq.length, 'Pendientes de aprobar', pendingReq.length ? 'warn' : '')}
        {stat('#personal', 'users', 'Personal activo', active.length, lastPunchDay ? `Fichadas hasta el ${fmtDate(lastPunchDay)}` : 'Todavía no hay fichadas')}
      </div>

      <div className="dash">
        {/* Columna izquierda: calendario y accesos */}
        <div className="dash-left">
          <MiniCalendar state={state} today={today} isActive={isActive} onRequest={(d) => setRequest({ from: d, to: d })} onPerson={setPerson} />
          <section className="panel widget">
            <div className="widget-head"><h3>Accesos rápidos</h3></div>
            <div className="widget-body quick-grid">
              <a className="quick" href="#personal"><Icon name="users" /><span>Personal</span></a>
              <a className="quick" href="#fichadas"><Icon name="clock" /><span>Control de fichadas</span></a>
              <a className="quick" href="#archivos"><Icon name="upload" /><span>Cargar archivos del reloj</span></a>
              <a className="quick" href="#horarios"><Icon name="sliders" /><span>Horarios</span></a>
            </div>
          </section>
        </div>

        {/* Columna central: tareas y solicitudes con acciones */}
        <div>
          <section className="panel widget">
            <div className="widget-head">
              <h3>Mis tareas</h3>
              <a href="#tareas">Ver todas ({tasks.length})</a>
            </div>
            <div className="widget-body" style={{ paddingBottom: 10 }}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input id="home-quick" className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Anotar una tarea para hoy y apretar Enter" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQuick()} />
                <button className="btn soft" onClick={() => setTask({})} title="Con persona, fecha o nota"><Icon name="plus" size={15} />Detallada</button>
              </div>
            </div>
            {urgent.length ? (
              <div className="task-list" style={{ borderTop: '1px solid var(--line)' }}>
                {urgent.slice(0, 8).map((t) => {
                  const emp = emps[t.legajo];
                  const b = bucketOf(t, today);
                  return (
                    <div key={t.id} className="wtask">
                      {emp ? <Avatar emp={emp} size={30} /> : <span className="avatar" style={{ '--av': '30px', background: 'var(--sunken)', color: 'var(--muted)' }}><Icon name="check" size={15} /></span>}
                      <button type="button" className="task-main" onClick={() => setTask(t)}>
                        <span className="task-text">{t.text}</span>
                        <span className="task-note">
                          {emp ? emp.name : 'Propia'}
                          {t.due && <> · <span className={b === 'vencidas' ? 'bad-text' : b === 'hoy' ? '' : ''} style={{ color: b === 'vencidas' ? 'var(--bad)' : b === 'hoy' ? 'var(--warn)' : undefined, fontWeight: b !== 'semana' ? 600 : 400 }}>{dueText(t.due, today)}</span></>}
                        </span>
                      </button>
                      <button className="btn sm soft" onClick={() => { toggleTask(t.id); toast('Tarea completada'); }}><Icon name="check" size={14} />Completar</button>
                    </div>
                  );
                })}
              </div>
            ) : <div className="home-empty" style={{ borderTop: '1px solid var(--line)' }}>No hay tareas urgentes. Todo al día.</div>}
            {urgent.length > 8 && <a className="home-foot" href="#tareas">y {urgent.length - 8} más…</a>}
          </section>

          <section className="panel widget">
            <div className="widget-head">
              <h3>Solicitudes por resolver</h3>
              <a href="#solicitudes">Ir a vacaciones</a>
            </div>
            {pendingReq.length ? (
              <div className="task-list" style={{ borderTop: '1px solid var(--line)' }}>
                {pendingReq.slice(0, 6).map((l) => (
                  <div key={l.id} className="wtask">
                    <Avatar emp={emps[l.legajo]} size={30} />
                    <button type="button" className="task-main" onClick={() => setRequest(l)}>
                      <span className="task-text">{name(l.legajo)} <span className={`tag ${typeInfo(l.type).tone}`} style={{ marginLeft: 4 }}>{l.type}</span></span>
                      <span className="task-note">{l.type === HOURS ? `${fmtDate(l.from)} ${l.startTime}–${l.endTime}` : `${fmtDate(l.from)}${(l.to || l.from) !== l.from ? ` al ${fmtDate(l.to)}` : ''} · ${leaveLength(l)} d`}</span>
                    </button>
                    <button className="btn sm ok-soft" onClick={() => approve(l)}>Aprobar</button>
                    <button className="btn sm ghost" onClick={() => setRequest(l)}>Ver</button>
                  </div>
                ))}
              </div>
            ) : <div className="home-empty" style={{ borderTop: '1px solid var(--line)' }}>No hay solicitudes pendientes.</div>}
            {pendingReq.length > 6 && <a className="home-foot" href="#solicitudes">y {pendingReq.length - 6} más…</a>}
          </section>

          {missing.length > 0 && (
            <section className="panel widget">
              <div className="widget-head"><h3>Datos para completar</h3><a href="#personal">Ir a personal</a></div>
              <div className="widget-body">
                {missing.map(([label, n]) => (
                  <a key={label} className="event" href="#personal" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className="avatar" style={{ '--av': '30px', background: 'var(--warn-soft)', color: 'var(--warn)' }}><Icon name="alert" size={15} /></span>
                    <span className="event-main"><b>{n} {n === 1 ? 'persona' : 'personas'}</b><small>{label}</small></span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Columna derecha: estado del personal, eventos y celebraciones */}
        <div>
          <section className="panel widget">
            <div className="widget-head"><h3>Estado del personal</h3></div>
            <div className="widget-body">
              <div className="widget-sub" style={{ marginTop: 0 }}>Ausentes hoy ({absentToday.length})</div>
              {absentToday.length ? (
                <div className="avatars">
                  {absentToday.map((l) => (
                    <button key={l.id} className="avatar-btn" onClick={() => setRequest(l)} title={`${name(l.legajo)} · ${l.type}${(l.to || l.from) !== today ? ` hasta el ${fmtDate(l.to)}` : ''}`}>
                      <Avatar emp={emps[l.legajo]} size={38} title="" />
                      <small>{(emps[l.legajo]?.name || '').split(' ')[0]}</small>
                    </button>
                  ))}
                </div>
              ) : <p className="muted small">Hoy no falta nadie por solicitudes cargadas.</p>}
              <div className="widget-sub">Salen en los próximos 7 días ({upcoming.length})</div>
              {upcoming.length ? (
                <div className="avatars">
                  {upcoming.map((l) => (
                    <button key={l.id} className="avatar-btn" onClick={() => setRequest(l)} title={`${name(l.legajo)} · ${l.type} desde ${dueText(l.from, today).toLowerCase()}`}>
                      <Avatar emp={emps[l.legajo]} size={38} title="" />
                      <small>{(emps[l.legajo]?.name || '').split(' ')[0]}</small>
                    </button>
                  ))}
                </div>
              ) : <p className="muted small">Nadie empieza vacaciones o licencias esta semana.</p>}
            </div>
          </section>

          <section className="panel widget">
            <div className="widget-head"><h3>Próximos eventos</h3></div>
            <div className="widget-body">
              {events.length ? events.map((ev, i) => (
                <div key={i} className="event" style={{ cursor: ev.l ? 'pointer' : 'default' }} onClick={() => ev.l && setRequest(ev.l)}>
                  <DateBadge date={ev.date} kind={ev.kind} />
                  <span className="event-main"><b>{ev.title}</b><small>{ev.sub} · {dueText(ev.date, today)}</small></span>
                </div>
              )) : <p className="muted small">No hay feriados ni salidas en los próximos días.</p>}
            </div>
          </section>

          <section className="panel widget">
            <div className="widget-head"><h3>Próximas celebraciones</h3></div>
            <div className="widget-body">
              {celebrations.length ? (
                <div className="celebs">
                  {celebrations.slice(0, 12).map(({ e, kind, next, years }) => (
                    <button key={`${kind}${e.legajo}`} className={`celeb ${next === today ? 'today' : ''}`} onClick={() => setPerson(e.legajo)}>
                      <Avatar emp={e} size={44} title="" />
                      <b>{e.name}</b>
                      <small>{kind === 'bday' ? '🎂 Cumpleaños' : `🎉 ${years} ${years === 1 ? 'año' : 'años'} en la institución`}</small>
                      <span className={`pill ${next === today ? 'ok' : 'neutral'}`}>{dueText(next, today)}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="muted small">No hay cumpleaños ni aniversarios en los próximos 30 días.</p>}
            </div>
          </section>
        </div>
      </div>

      {task && <TaskDialog task={task} onClose={() => setTask(null)} />}
      {request && <RequestDialog request={request} onClose={() => setRequest(null)} />}
      {person && <EmployeeDrawer legajo={person} onClose={() => setPerson(null)} />}
    </>
  );
}

/** Calendario del mes: puntos verdes = ausencias, naranjas = tareas; feriados en rojo. Tocar un día muestra el detalle. */
function MiniCalendar({ state, today, isActive, onRequest, onPerson }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const start = addDays(first, -((weekday(first) + 6) % 7)); // lunes anterior
  const end = addDays(last, (7 - weekday(last)) % 7); // domingo siguiente
  const days = [...eachDay(start, end)];
  const shift = (n) => setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  const hol = new Map(state.holidays.map((h) => [h.date, h.name]));
  const leaves = state.leaves.filter((l) => l.status === 'aprobada' && isFullDay(l) && isActive(l.legajo) && l.from <= end && (l.to || l.from) >= start);
  const tasks = (state.tasks || []).filter((t) => !t.done && t.due);
  const away = (d) => leaves.filter((l) => l.from <= d && (l.to || l.from) >= d);
  const due = (d) => tasks.filter((t) => t.due === d);
  const selAway = away(sel);
  const selTasks = due(sel);

  return (
    <section className="panel widget">
      <div className="widget-head"><h3>Calendario</h3></div>
      <div className="widget-body">
        <div className="minical-head">
          <button className="btn sm ghost icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior"><Icon name="chevl" size={16} /></button>
          <b>{MONTHS[m - 1]} {y}</b>
          <button className="btn sm ghost icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente"><Icon name="chevr" size={16} /></button>
        </div>
        <table className="minical">
          <thead><tr>{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: days.length / 7 }, (_, w) => (
              <tr key={w}>
                {days.slice(w * 7, w * 7 + 7).map((d) => {
                  const a = away(d).length;
                  const t = due(d).length;
                  const cls = [d.slice(0, 7) !== month && 'out', d === today && 'today', d === sel && 'sel', hol.has(d) && 'hol', [0, 6].includes(weekday(d)) && 'we'].filter(Boolean).join(' ');
                  return (
                    <td key={d} className={cls}>
                      <button onClick={() => setSel(d)} title={hol.get(d) || ''}>
                        {Number(d.slice(8))}
                        {(a > 0 || t > 0) && <span className="dots">{a > 0 && <i />}{t > 0 && <i className="t" />}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="day-detail">
          <b>{longDate(sel).replace(/^./, (c) => c.toUpperCase())}</b>
          {hol.has(sel) && <span style={{ color: 'var(--bad)' }}>Feriado: {hol.get(sel)}</span>}
          {selAway.map((l) => (
            <button key={l.id} className="linklike" style={{ textAlign: 'left', textDecoration: 'none', color: 'inherit' }} onClick={() => onPerson(l.legajo)}>
              <span style={{ color: 'var(--ok)' }}>●</span> {state.employees[l.legajo]?.name} <span className="muted">· {l.type}</span>
            </button>
          ))}
          {selTasks.map((t) => <span key={t.id}><span style={{ color: 'var(--warn)' }}>●</span> {t.text}</span>)}
          {!hol.has(sel) && !selAway.length && !selTasks.length && <span className="muted">Sin ausencias ni tareas.</span>}
          <button className="btn soft sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => onRequest(sel)}><Icon name="plus" size={14} />Cargar ausencia este día</button>
        </div>
      </div>
    </section>
  );
}
