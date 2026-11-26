import { useMemo, useState } from 'react';
import { useStore, addTask } from '../lib/store.js';
import { useToast } from '../components/ui.jsx';
import TaskDialog from '../components/TaskDialog.jsx';
import TaskItem from '../components/TaskItem.jsx';
import EmployeeDrawer from './EmployeeDrawer.jsx';
import { BUCKETS, bucketOf, taskCompare } from '../lib/tasks.js';
import { todayKey } from '../lib/time.js';

const WHO = [['todas', 'Todas'], ['mias', 'Mías'], ['personas', 'De personas']];

export default function Tareas() {
  const state = useStore();
  const toast = useToast();
  const today = todayKey();
  const [dialog, setDialog] = useState(null);
  const [person, setPerson] = useState(null);
  const [who, setWho] = useState('todas');
  const [showDone, setShowDone] = useState(false);
  const [q, setQ] = useState('');
  const [quick, setQuick] = useState({ text: '', due: '' });

  const tasks = state.tasks || [];
  const emps = state.employees;
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return tasks
      .filter((t) => who === 'todas' || (who === 'mias' ? !t.legajo : !!t.legajo))
      .filter((t) => !n || `${t.text} ${t.note} ${emps[t.legajo]?.name || ''} ${t.legajo}`.toLowerCase().includes(n));
  }, [tasks, who, q, emps]);

  const pending = list.filter((t) => !t.done);
  const done = list.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const groups = BUCKETS.map(([k, label, tone]) => ({ k, label, tone, items: pending.filter((t) => bucketOf(t, today) === k).sort(taskCompare) })).filter((g) => g.items.length);

  const addQuick = () => {
    if (!quick.text.trim()) return;
    addTask({ text: quick.text.trim(), due: quick.due });
    setQuick({ text: '', due: quick.due });
    toast('Tarea agregada');
  };

  const item = (t) => <TaskItem key={t.id} t={t} today={today} emp={emps[t.legajo]} onEdit={setDialog} onOpenPerson={setPerson} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Tareas y recordatorios</h2>
          <p>Tus pendientes y las cosas que tenés que hacer o avisarle a cada persona, ordenadas por fecha. Las tareas de una persona también se ven en su ficha.</p>
        </div>
        <button className="btn primary" onClick={() => setDialog({})}>Nueva tarea</button>
      </div>

      <div className="stack">
        <div className="panel panel-pad toolbar">
          <input
            id="tq-text"
            className="input grow"
            placeholder="Agregar una tarea propia rápida y apretar Enter"
            value={quick.text}
            onChange={(e) => setQuick({ ...quick, text: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addQuick()}
          />
          <input id="tq-due" type="date" className="input" value={quick.due} onChange={(e) => setQuick({ ...quick, due: e.target.value })} aria-label="Fecha" />
          <button className="btn" disabled={!quick.text.trim()} onClick={addQuick}>Agregar</button>
        </div>

        <div className="toolbar">
          <div className="seg" role="group" aria-label="De quién">
            {WHO.map(([k, l]) => <button key={k} aria-pressed={who === k} onClick={() => setWho(k)}>{l}</button>)}
          </div>
          <input id="tq-q" className="input" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="spacer" />
          <span className="muted small">{pending.length} {pending.length === 1 ? 'pendiente' : 'pendientes'}</span>
        </div>

        {!groups.length && (
          <div className="panel empty">
            {tasks.some((t) => !t.done) ? 'No hay pendientes con este filtro.' : 'No tenés tareas pendientes.'}
          </div>
        )}
        {groups.map((g) => (
          <section key={g.k} className={`panel task-section tone-${g.tone}`}>
            <header className="cal-head">
              <h3>{g.label}</h3>
              <span className="muted small">{g.items.length} {g.items.length === 1 ? 'tarea' : 'tareas'}</span>
            </header>
            <div className="task-list">{g.items.map(item)}</div>
          </section>
        ))}

        {done.length > 0 && (
          <section className="panel task-section tone-neutral">
            <header className="cal-head">
              <h3>Hechas</h3>
              <span className="muted small">{done.length}</span>
              <span className="spacer" />
              <button className="btn sm ghost" onClick={() => setShowDone((v) => !v)}>{showDone ? 'Ocultar' : 'Mostrar'}</button>
            </header>
            {showDone && <div className="task-list">{done.map(item)}</div>}
          </section>
        )}
      </div>

      {dialog && <TaskDialog task={dialog} onClose={() => setDialog(null)} />}
      {person && <EmployeeDrawer legajo={person} initialTab="tareas" onClose={() => setPerson(null)} />}
    </>
  );
}
