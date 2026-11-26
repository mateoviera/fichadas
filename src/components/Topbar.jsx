import { useMemo, useRef, useState, useEffect } from 'react';
import { useStore } from '../lib/store.js';
import { Avatar } from './ui.jsx';
import { Icon } from './Icon.jsx';
import TaskDialog from './TaskDialog.jsx';
import RequestDialog from './RequestDialog.jsx';
import EmployeeDrawer from '../views/EmployeeDrawer.jsx';
import { todayKey, weekday } from '../lib/time.js';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const norm = (x) => String(x || '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Barra superior: buscador de personas (desde cualquier sección) y accesos para cargar tareas y solicitudes. */
export default function Topbar() {
  const employees = useStore((s) => s.employees);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [person, setPerson] = useState(null);
  const [task, setTask] = useState(null);
  const [request, setRequest] = useState(null);
  const box = useRef();
  const today = todayKey();

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return Object.values(employees)
      .filter((e) => words.every((w) => norm(`${e.name} ${e.legajo} ${e.dni || ''} ${e.sector || ''} ${e.position || ''}`).includes(w)))
      .sort((a, b) => (a.name || '~').localeCompare(b.name || '~', 'es'))
      .slice(0, 8);
  }, [q, employees]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (e) => {
    setPerson(e.legajo);
    setQ('');
    setOpen(false);
  };

  // Las ventanas van fuera del <header>: dentro quedaban encerradas en la barra (60 px de alto).
  return (
    <>
    <header className="topbar2 no-print">
      <div className="gsearch" ref={box}>
        <Icon name="search" size={16} />
        <input
          id="g-search"
          className="input"
          type="search"
          placeholder="Buscar persona por nombre, legajo o DNI"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && results[idx]) pick(results[idx]);
            if (e.key === 'Escape') { setQ(''); setOpen(false); }
          }}
        />
        {open && q.trim() && (
          <div className="gsearch-results" role="listbox">
            {results.map((e, i) => (
              <button key={e.legajo} type="button" className={`gsearch-item ${i === idx ? 'on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => pick(e)}>
                <Avatar emp={e} size={30} title="" />
                <span><b>{e.name || 'Sin nombre'}</b><small>Leg. {e.legajo}{e.sector ? ` · ${e.sector}` : ''}{e.exitDate && e.exitDate <= today ? ' · de baja' : ''}</small></span>
              </button>
            ))}
            {!results.length && <div className="muted small" style={{ padding: 10 }}>No se encontró a nadie.</div>}
          </div>
        )}
      </div>
      <span className="spacer" />
      <span className="today-label">{DAYS[weekday(today)]} {Number(today.slice(8))} de {MONTHS[Number(today.slice(5, 7)) - 1]}</span>
      <button className="btn soft sm" onClick={() => setRequest({})}><Icon name="plus" size={15} />Solicitud</button>
      <button className="btn primary sm" onClick={() => setTask({})}><Icon name="plus" size={15} />Tarea</button>
    </header>
      {person && <EmployeeDrawer legajo={person} onClose={() => setPerson(null)} />}
      {task && <TaskDialog task={task} onClose={() => setTask(null)} />}
      {request && <RequestDialog request={request} onClose={() => setRequest(null)} />}
    </>
  );
}
