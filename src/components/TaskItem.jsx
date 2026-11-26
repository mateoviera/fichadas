import { toggleTask } from '../lib/store.js';
import { bucketOf, dueText } from '../lib/tasks.js';
import { useToast } from './ui.jsx';

const DUE_TONE = { vencidas: 'bad', hoy: 'warn', semana: 'info', despues: 'neutral', sinfecha: 'neutral' };

/** Renglón de una tarea: tilde para marcarla hecha, texto, persona y fecha. Tocarlo abre la edición. */
export default function TaskItem({ t, today, emp, onEdit, onOpenPerson }) {
  const toast = useToast();
  const tone = t.done ? 'neutral' : DUE_TONE[bucketOf(t, today)];
  return (
    <div className={`task ${t.done ? 'done' : ''}`}>
      <button
        type="button"
        className="task-check"
        aria-pressed={!!t.done}
        aria-label={t.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        title={t.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        onClick={() => { toggleTask(t.id); toast(t.done ? 'Tarea pendiente de nuevo' : 'Tarea hecha'); }}
      >{t.done ? '✓' : ''}</button>
      <button type="button" className="task-main" onClick={() => onEdit(t)}>
        <span className="task-text">{t.text}</span>
        {t.note && <span className="task-note">{t.note}</span>}
      </button>
      <span className="task-meta">
        {onOpenPerson && (emp
          ? <button type="button" className="tag person" onClick={() => onOpenPerson(emp.legajo)} title="Abrir la ficha">{emp.name || `Leg. ${emp.legajo}`}</button>
          : t.legajo
            ? <span className="tag other">Leg. {t.legajo}</span>
            : <span className="tag other">Propia</span>)}
        {t.due && <span className={`pill ${tone}`}>{dueText(t.due, today)}</span>}
      </span>
    </div>
  );
}
