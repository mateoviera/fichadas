import { useState, useEffect } from 'react';
import { useStore, saveSchedule, newSchedule, deleteSchedule } from '../lib/store.js';
import { blockDuration, endOffset } from '../lib/engine.js';
import { fmtDuration, WEEKDAYS_LETTER, hmToMin } from '../lib/time.js';
import { ConfirmButton, EstSelect, TimeInput } from '../components/ui.jsx';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function Horarios() {
  const state = useStore();
  const usage = {};
  Object.values(state.employees).forEach((e) => e.scheduleId && (usage[e.scheduleId] = (usage[e.scheduleId] || 0) + 1));
  // Los horarios creados en esta visita se muestran primero, para editarlos sin bajar hasta el final.
  const [fresh, setFresh] = useState([]);
  const create = (type) => setFresh((f) => [newSchedule(type), ...f]);
  useEffect(() => {
    if (!fresh.length) return;
    const input = document.getElementById(`sn-${fresh[0]}`);
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
    input.select();
  }, [fresh]);
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('');
  const [unused, setUnused] = useState(false);
  const rank = (id) => { const i = fresh.indexOf(id); return i < 0 ? Infinity : i; };
  // Personas por horario, para buscar «el horario de Brenta».
  const people = {};
  Object.values(state.employees).forEach((e) => e.scheduleId && (people[e.scheduleId] ||= []).push(e.name || `Leg. ${e.legajo}`));
  const norm = (x) => String(x || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = norm(q).split(/\s+/).filter(Boolean);
  const matchPeople = (s) => (people[s.id] || []).filter((n) => words.every((w) => norm(n).includes(w)));
  const matches = (s) => {
    if (fresh.includes(s.id)) return true;
    if (typeF && s.type !== typeF) return false;
    if (unused && usage[s.id]) return false;
    if (!words.length) return true;
    const hay = norm(`${s.name} ${s.blocks.map((b) => `${b.start} ${b.end}`).join(' ')}`);
    return words.every((w) => hay.includes(w)) || matchPeople(s).length > 0;
  };
  const list = state.schedules
    .filter(matches)
    .sort((a, b) => rank(a.id) - rank(b.id) || (a.name || '').localeCompare(b.name || '', 'es'));
  const filtering = words.length || typeF || unused;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Horarios pactados</h2>
          <p>Creá un horario una vez y asignalo a varias personas. «Fijo» controla días y horas, y detecta ausencias. «Rotativo» es para enfermería: cada fichada se asocia al turno más cercano, incluido el nocturno que termina al día siguiente, y las horas esperadas del mes son del día 1 al anteúltimo menos 6 francos (1, 2, 1 y 2 por semana). Para guardias de 48 h elegí «egreso a los 2 días».</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => create('rotativo')}>Nuevo rotativo</button>
          <button className="btn primary" onClick={() => create('fijo')}>Nuevo horario fijo</button>
        </div>
      </div>
      <div className="panel panel-pad toolbar sticky-tools">
        <input
          id="h-q"
          className="input grow"
          type="search"
          placeholder="Buscar por nombre del horario, persona u hora (ej.: cocina, Brenta, 08:30)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        />
        <div className="seg" role="group" aria-label="Tipo">
          {[['', 'Todos'], ['fijo', 'Fijos'], ['rotativo', 'Rotativos']].map(([k, l]) => <button key={k} aria-pressed={typeF === k} onClick={() => setTypeF(k)}>{l}</button>)}
        </div>
        <label className="row small"><input id="h-unused" type="checkbox" checked={unused} onChange={(e) => setUnused(e.target.checked)} /> Sin personas asignadas</label>
        <span className="muted small">{filtering ? `${list.length} de ${state.schedules.length}` : `${state.schedules.length} horarios`}</span>
      </div>
      <div className="stack">
        {list.map((s) => {
          const who = words.length ? matchPeople(s) : [];
          return (
            <div key={s.id} className="stack" style={{ gap: 4 }}>
              {who.length > 0 && <span className="small muted">Asignado a {who.join(', ')}</span>}
              <ScheduleCard s={s} used={usage[s.id] || 0} establishments={state.establishments} isNew={fresh.includes(s.id)} />
            </div>
          );
        })}
        {!state.schedules.length && <div className="panel empty">No hay horarios. Creá el primero.</div>}
        {state.schedules.length > 0 && !list.length && (
          <div className="panel empty">
            Ningún horario coincide con la búsqueda.
            <button className="btn sm" onClick={() => { setQ(''); setTypeF(''); setUnused(false); }}>Limpiar filtros</button>
          </div>
        )}
      </div>
    </>
  );
}

export function ScheduleCard({ s, used, establishments, isNew }) {
  const set = (patch) => saveSchedule({ ...s, ...patch });
  const setBlock = (i, patch) => set({ blocks: s.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const addBlock = () => {
    const last = s.blocks[s.blocks.length - 1];
    set({ blocks: s.blocks.concat(s.type === 'rotativo' ? { start: last?.end || '06:00', end: '14:00', est: '' } : { days: last?.days || [1, 2, 3, 4, 5], start: '08:00', end: '12:00', est: '' }) });
  };
  const weekly = s.type === 'fijo' ? s.blocks.reduce((a, b) => a + blockDuration(b) * (b.days || []).length, 0) : 0;

  return (
    <div className={`panel ${isNew ? 'panel-new' : ''}`}>
      <div className="panel-head">
        {isNew && <span className="pill info">Nuevo</span>}
        <input id={`sn-${s.id}`} className="input" style={{ fontWeight: 600, flex: '1 1 220px' }} value={s.name} onChange={(e) => set({ name: e.target.value })} />
        <div className="seg" role="group" aria-label="Tipo de horario">
          <button aria-pressed={s.type === 'fijo'} onClick={() => set({ type: 'fijo', blocks: s.blocks.map((b) => ({ days: [1, 2, 3, 4, 5], ...b })) })}>Fijo</button>
          <button aria-pressed={s.type === 'rotativo'} onClick={() => set({ type: 'rotativo' })}>Rotativo</button>
        </div>
        <span className="muted small">{used} {used === 1 ? 'persona' : 'personas'}{weekly ? ` · ${fmtDuration(weekly)} h semanales` : ''}</span>
        <ConfirmButton confirmLabel="Eliminar horario" onConfirm={() => deleteSchedule(s.id)}>Eliminar</ConfirmButton>
      </div>
      <div className="panel-pad" style={{ paddingTop: 4, paddingBottom: 8 }}>
        {s.type === 'rotativo' && (
          <div style={{ padding: '8px 0' }}>
            <label className="row small" style={{ gap: 6, marginBottom: 6 }}>
              <input type="checkbox" checked={!!s.split} onChange={(e) => set({ split: e.target.checked })} />
              <span><b>Turno cortado</b>: cada día de trabajo hace todos los tramos (ej. 08:30–12:30 y 16:30–20:30 = un turno de 8 h). Los francos siguen siendo 1, 2, 1 y 2 por semana.</span>
            </label>
            <p className="muted small">{s.split ? `Tramos del turno (total ${fmtDuration(s.blocks.reduce((a, b) => a + blockDuration(b), 0))} h por día):` : 'Turnos posibles (la persona puede hacer cualquiera de ellos cualquier día):'}</p>
          </div>
        )}
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
              <select id={`bd-${s.id}-${i}`} className="input" style={{ width: 'auto' }} value={endOffset(b)} onChange={(e) => setBlock(i, { endDays: Number(e.target.value) })} aria-label="Día del egreso">
                {!overnight && <option value={0}>egreso el mismo día</option>}
                <option value={1}>egreso al día siguiente</option>
                <option value={2}>egreso a los 2 días (48 h)</option>
              </select>
              <span className="spacer" />
              <EstSelect id={`bx-${s.id}-${i}`} establishments={establishments} value={b.est || ''} onChange={(v) => setBlock(i, { est: v })} allLabel="Cualquier establecimiento" />
              <button className="btn sm ghost danger" onClick={() => set({ blocks: s.blocks.filter((_, j) => j !== i) })} disabled={s.blocks.length === 1} aria-label="Quitar bloque">Quitar</button>
            </div>
          );
        })}
        <div style={{ padding: '8px 0' }}>
          <button className="btn sm" onClick={addBlock}>{s.type === 'rotativo' ? (s.split ? 'Agregar tramo' : 'Agregar turno') : 'Agregar bloque'}</button>
          {s.type === 'fijo' && <span className="muted small" style={{ marginLeft: 8 }}>Usá varios bloques para horario cortado (ej. 08–12 y 16–20) o para días con horario distinto.</span>}
        </div>
      </div>
    </div>
  );
}
