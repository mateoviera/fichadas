import { useStore, saveSchedule, newSchedule, deleteSchedule } from '../lib/store.js';
import { blockDuration } from '../lib/engine.js';
import { fmtDuration, WEEKDAYS_LETTER, hmToMin } from '../lib/time.js';
import { ConfirmButton, EstSelect, TimeInput } from '../components/ui.jsx';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function Horarios() {
  const state = useStore();
  const usage = {};
  Object.values(state.employees).forEach((e) => e.scheduleId && (usage[e.scheduleId] = (usage[e.scheduleId] || 0) + 1));

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Horarios pactados</h2>
          <p>Creá un horario una vez y asignalo a varias personas. «Fijo» controla días y horas, y detecta ausencias. «Rotativo» es para enfermería y guardias: cada fichada se asocia al turno más cercano, incluido el nocturno que termina al día siguiente.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => newSchedule('rotativo')}>Nuevo rotativo</button>
          <button className="btn primary" onClick={() => newSchedule('fijo')}>Nuevo horario fijo</button>
        </div>
      </div>
      <div className="stack">
        {state.schedules.map((s) => <ScheduleCard key={s.id} s={s} used={usage[s.id] || 0} establishments={state.establishments} />)}
        {!state.schedules.length && <div className="panel empty">No hay horarios. Creá el primero.</div>}
      </div>
    </>
  );
}

function ScheduleCard({ s, used, establishments }) {
  const set = (patch) => saveSchedule({ ...s, ...patch });
  const setBlock = (i, patch) => set({ blocks: s.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const addBlock = () => {
    const last = s.blocks[s.blocks.length - 1];
    set({ blocks: s.blocks.concat(s.type === 'rotativo' ? { start: last?.end || '06:00', end: '14:00', est: '' } : { days: last?.days || [1, 2, 3, 4, 5], start: '08:00', end: '12:00', est: '' }) });
  };
  const weekly = s.type === 'fijo' ? s.blocks.reduce((a, b) => a + blockDuration(b) * (b.days || []).length, 0) : 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <input id={`sn-${s.id}`} className="input" style={{ fontWeight: 600, flex: '1 1 220px' }} value={s.name} onChange={(e) => set({ name: e.target.value })} />
        <div className="seg" role="group" aria-label="Tipo de horario">
          <button aria-pressed={s.type === 'fijo'} onClick={() => set({ type: 'fijo', blocks: s.blocks.map((b) => ({ days: [1, 2, 3, 4, 5], ...b })) })}>Fijo</button>
          <button aria-pressed={s.type === 'rotativo'} onClick={() => set({ type: 'rotativo' })}>Rotativo</button>
        </div>
        <span className="muted small">{used} {used === 1 ? 'persona' : 'personas'}{weekly ? ` · ${fmtDuration(weekly)} h semanales` : ''}</span>
        <ConfirmButton confirmLabel="Eliminar horario" onConfirm={() => deleteSchedule(s.id)}>Eliminar</ConfirmButton>
      </div>
      <div className="panel-pad" style={{ paddingTop: 4, paddingBottom: 8 }}>
        {s.type === 'rotativo' && <p className="muted small" style={{ padding: '8px 0' }}>Turnos posibles (la persona puede hacer cualquiera de ellos cualquier día):</p>}
        {s.blocks.map((b, i) => {
          const overnight = hmToMin(b.end) <= hmToMin(b.start);
          return (
            <div key={i} className="block-row">
              {s.type === 'fijo' && (
                <div className="chips" role="group" aria-label="Días">
                  {DAY_ORDER.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="chip"
                      title={DAY_NAMES[d]}
                      aria-pressed={(b.days || []).includes(d)}
                      onClick={() => setBlock(i, { days: (b.days || []).includes(d) ? b.days.filter((x) => x !== d) : [...(b.days || []), d] })}
                    >{WEEKDAYS_LETTER[d]}</button>
                  ))}
                </div>
              )}
              <TimeInput id={`bs-${s.id}-${i}`} value={b.start} onChange={(v) => setBlock(i, { start: v })} aria-label="Ingreso" />
              <span className="arrow">→</span>
              <TimeInput id={`be-${s.id}-${i}`} value={b.end} onChange={(v) => setBlock(i, { end: v })} aria-label="Egreso" />
              <span className="num muted">{fmtDuration(blockDuration(b))} h</span>
              {overnight && <span className="pill info">egreso día siguiente</span>}
              <span className="spacer" />
              <EstSelect id={`bx-${s.id}-${i}`} establishments={establishments} value={b.est || ''} onChange={(v) => setBlock(i, { est: v })} allLabel="Cualquier establecimiento" />
              <button className="btn sm ghost danger" onClick={() => set({ blocks: s.blocks.filter((_, j) => j !== i) })} disabled={s.blocks.length === 1} aria-label="Quitar bloque">Quitar</button>
            </div>
          );
        })}
        <div style={{ padding: '8px 0' }}>
          <button className="btn sm" onClick={addBlock}>{s.type === 'rotativo' ? 'Agregar turno' : 'Agregar bloque'}</button>
          {s.type === 'fijo' && <span className="muted small" style={{ marginLeft: 8 }}>Usá varios bloques para horario cortado (ej. 08–12 y 16–20) o para días con horario distinto.</span>}
        </div>
      </div>
    </div>
  );
}
