import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.js';
import { Avatar } from './ui.jsx';
import { Icon } from './Icon.jsx';
import TaskDialog from './TaskDialog.jsx';
import RequestDialog from './RequestDialog.jsx';
import EmployeeDrawer from '../views/EmployeeDrawer.jsx';
import { scheduleSummary } from '../lib/schedule.js';

const norm = (x) => String(x || '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
const go = (hash) => { location.hash = hash; };

/**
 * Buscador rápido (Ctrl+K): personas, acciones, secciones, horarios y tareas pendientes.
 * Queda siempre montado para que la ficha o la ventana que se abre desde acá siga abierta al cerrarlo.
 */
export default function CommandPalette({ open, onClose, sections }) {
  const state = useStore();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [person, setPerson] = useState(null);
  const [task, setTask] = useState(null);
  const [request, setRequest] = useState(null);
  const list = useRef();

  useEffect(() => { if (open) { setQ(''); setIdx(0); } }, [open]);

  const groups = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const hit = (text) => words.every((w) => norm(text).includes(w));
    const actions = [
      { key: 'a-task', icon: 'plus', label: 'Nueva tarea', hint: 'tarea recordatorio pendiente', run: () => setTask({}) },
      { key: 'a-req', icon: 'plane', label: 'Nueva solicitud', hint: 'vacaciones licencia franco permiso ausencia', run: () => setRequest({}) },
      { key: 'a-files', icon: 'upload', label: 'Cargar archivos del reloj', hint: 'fichadas txt importar', run: () => go('#archivos') },
      { key: 'a-person', icon: 'users', label: 'Agregar persona', hint: 'alta nuevo empleado', run: () => { sessionStorage.setItem('personal-add', '1'); go('#personal'); window.dispatchEvent(new Event('personal-add')); } },
    ];
    const secs = sections.map(([k, label, icon]) => ({ key: `s-${k}`, icon, label: `Ir a ${label}`, hint: label, run: () => go(`#${k}`) }));
    if (!words.length) return [['Acciones', actions], ['Secciones', secs]];

    const people = Object.values(state.employees)
      .filter((e) => hit(`${e.name} ${e.legajo} ${e.dni || ''} ${e.sector || ''} ${e.position || ''}`))
      .sort((a, b) => (a.name || '~').localeCompare(b.name || '~', 'es'))
      .slice(0, 8)
      .map((e) => ({ key: `p-${e.legajo}`, emp: e, label: e.name || 'Sin nombre', sub: `Leg. ${e.legajo}${e.sector ? ` · ${e.sector}` : ''}${e.exitDate && e.exitDate <= new Date().toISOString().slice(0, 10) ? ' · de baja' : ''}`, run: () => setPerson(e.legajo) }));
    const schedules = state.schedules
      .filter((s) => hit(`${s.name} horario`))
      .slice(0, 5)
      .map((s) => ({ key: `h-${s.id}`, icon: 'sliders', label: s.name, sub: scheduleSummary(s), run: () => { sessionStorage.setItem('horarios-q', s.name); go('#horarios'); window.dispatchEvent(new Event('horarios-q')); } }));
    const tasks = (state.tasks || [])
      .filter((t) => !t.done && hit(`${t.text} ${t.note} ${state.employees[t.legajo]?.name || ''}`))
      .slice(0, 5)
      .map((t) => ({ key: `t-${t.id}`, icon: 'check', label: t.text, sub: state.employees[t.legajo]?.name || 'Tarea propia', run: () => setTask(t) }));
    return [
      ['Personas', people],
      ['Acciones', actions.filter((a) => hit(`${a.label} ${a.hint}`))],
      ['Secciones', secs.filter((a) => hit(`${a.label} ${a.hint}`))],
      ['Horarios', schedules],
      ['Tareas pendientes', tasks],
    ].filter(([, items]) => items.length);
  }, [q, state.employees, state.schedules, state.tasks, sections]);

  const flat = groups.flatMap(([, items]) => items);
  const choose = (item) => { onClose(); item.run(); };

  useEffect(() => {
    list.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  return (
    <>
      {open && (
        <div className="modal-wrap cmdk-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <div className="cmdk" role="dialog" aria-modal="true" aria-label="Buscar">
            <div className="cmdk-input">
              <Icon name="search" size={18} />
              <input
                id="cmdk-q"
                autoFocus
                placeholder="Buscar persona, acción, sección u horario…"
                value={q}
                onChange={(e) => { setQ(e.target.value); setIdx(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, flat.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
                  if (e.key === 'Enter' && flat[idx]) choose(flat[idx]);
                  if (e.key === 'Escape') onClose();
                }}
              />
              <kbd>Esc</kbd>
            </div>
            <div className="cmdk-list" ref={list}>
              {groups.map(([title, items]) => (
                <div key={title} className="cmdk-group">
                  <div className="cmdk-title">{title}</div>
                  {items.map((it) => {
                    const i = flat.indexOf(it);
                    return (
                      <button key={it.key} type="button" className="cmdk-item" data-on={i === idx} onMouseMove={() => setIdx(i)} onClick={() => choose(it)}>
                        {it.emp ? <Avatar emp={it.emp} size={28} title="" /> : <span className="cmdk-ico"><Icon name={it.icon} size={16} /></span>}
                        <span className="cmdk-text"><b>{it.label}</b>{it.sub && <small>{it.sub}</small>}</span>
                        {i === idx && <kbd>↵</kbd>}
                      </button>
                    );
                  })}
                </div>
              ))}
              {!flat.length && <div className="home-empty">No se encontró nada para «{q}».</div>}
            </div>
            <div className="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>↵</kbd> abrir</span><span><kbd>Ctrl</kbd><kbd>K</kbd> abrir desde cualquier pantalla</span></div>
          </div>
        </div>
      )}
      {person && <EmployeeDrawer legajo={person} onClose={() => setPerson(null)} />}
      {task && <TaskDialog task={task} onClose={() => setTask(null)} />}
      {request && <RequestDialog request={request} onClose={() => setRequest(null)} />}
    </>
  );
}
