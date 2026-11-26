import { useMemo, useState } from 'react';
import { useStore, addTask, updateTask, removeTask } from '../lib/store.js';
import { Modal, ConfirmButton, Stamp, useToast } from './ui.jsx';
import { todayKey, addDays } from '../lib/time.js';
import { fmtStamp } from '../lib/personal.js';

/**
 * Alta o edición de una tarea o recordatorio.
 * `task`: tarea existente (con id) o borrador { legajo? }. Con `lockPerson` no se puede cambiar la persona.
 */
export default function TaskDialog({ task = {}, onClose, lockPerson = false }) {
  const state = useStore();
  const toast = useToast();
  const today = todayKey();
  const editing = !!task.id;
  const [f, setF] = useState(() => ({ text: task.text || '', legajo: task.legajo || '', due: task.due || '', note: task.note || '', done: !!task.done }));
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const people = useMemo(
    () => Object.values(state.employees).filter((e) => !e.exitDate || e.exitDate >= today || e.legajo === f.legajo).sort((a, b) => (a.name || '~').localeCompare(b.name || '~', 'es')),
    [state.employees, today, f.legajo],
  );
  const emp = state.employees[f.legajo];
  const valid = f.text.trim().length > 0;

  const save = () => {
    if (!valid) return;
    const data = { ...f, text: f.text.trim(), note: f.note.trim() };
    if (editing) {
      if (data.done !== !!task.done) data.doneAt = data.done ? Date.now() : null;
      updateTask(task.id, data);
    } else addTask({ ...data, doneAt: data.done ? Date.now() : null });
    toast(editing ? 'Tarea actualizada' : 'Tarea agregada');
    onClose();
  };

  const quick = [['Hoy', today], ['Mañana', addDays(today, 1)], ['En una semana', addDays(today, 7)], ['Sin fecha', '']];

  return (
    <Modal
      title={editing ? 'Editar tarea' : 'Nueva tarea'}
      onClose={onClose}
      footer={
        <>
          {editing && <Stamp text={fmtStamp(task)} label="Última modificación" />}
          {editing && <ConfirmButton confirmLabel="Eliminar tarea" onConfirm={() => { removeTask(task.id); toast('Tarea eliminada'); onClose(); }}>Eliminar</ConfirmButton>}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!valid} onClick={save}>{editing ? 'Guardar' : 'Agregar'}</button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span>Qué hay que hacer</span>
          <input
            id="tk-text"
            className="input"
            autoFocus
            placeholder="Ej.: Avisarle que pase a buscar su alta"
            value={f.text}
            onChange={(e) => set({ text: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </label>
        <label className="field">
          <span>Persona</span>
          {lockPerson
            ? <input className="input" value={emp ? `${emp.name} (leg. ${emp.legajo})` : 'Tarea propia'} disabled />
            : (
              <select id="tk-person" className="input" value={f.legajo} onChange={(e) => set({ legajo: e.target.value })}>
                <option value="">Tarea propia (no es de una persona)</option>
                {people.map((e) => <option key={e.legajo} value={e.legajo}>{e.name || 'Sin nombre'} · leg. {e.legajo}</option>)}
              </select>
            )}
        </label>
        <label className="field">
          <span>Fecha (cuándo hacerlo o avisarle)</span>
          <input id="tk-due" type="date" className="input" value={f.due} onChange={(e) => set({ due: e.target.value })} />
          <span className="row" style={{ gap: 4, marginTop: 4 }}>
            {quick.map(([l, v]) => (
              <button key={l} type="button" className="chip" style={{ width: 'auto', padding: '0 10px' }} aria-pressed={f.due === v} onClick={() => set({ due: v })}>{l}</button>
            ))}
          </span>
        </label>
        <label className="field">
          <span>Nota (opcional)</span>
          <textarea id="tk-note" className="input textarea" rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </label>
        {editing && (
          <label className="row small">
            <input id="tk-done" type="checkbox" checked={f.done} onChange={(e) => set({ done: e.target.checked })} /> Hecha
          </label>
        )}
      </div>
    </Modal>
  );
}
