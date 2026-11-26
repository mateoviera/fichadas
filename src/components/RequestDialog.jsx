import { useMemo, useState } from 'react';
import { useStore, addLeave, updateLeave, removeLeave } from '../lib/store.js';
import { Modal, WarnDialog, ConfirmButton, Stamp, TimeInput, useToast } from './ui.jsx';
import { REQUEST_TYPES, VACATION, HOURS, UNPAID, checkRequest, leaveLength, vacationBalance, vacationRoom, requestMinutes, fmtStamp, fmtSeniority, seniority } from '../lib/personal.js';
import { todayKey, fmtDuration, addDays } from '../lib/time.js';

export const STATUS_LABEL = { aprobada: 'Aprobada', pendiente: 'Pendiente', rechazada: 'Rechazada' };

/**
 * Alta o edición de una solicitud (vacaciones, día particular, licencia, permiso por horas…).
 * `request`: solicitud existente (con id) o borrador { legajo?, from?, to?, type? }.
 * Antes de guardar se revisan las reglas (grupo, antigüedad, días disponibles) y, si algo no
 * corresponde, se muestra un aviso que pregunta si se quiere cargar igual.
 */
export default function RequestDialog({ request = {}, onClose, lockPerson = false }) {
  const state = useStore();
  const toast = useToast();
  const today = todayKey();
  const editing = !!request.id;
  const [f, setF] = useState(() => ({
    legajo: request.legajo || '',
    type: request.type || VACATION,
    from: request.from || today,
    to: request.to || request.from || today,
    startTime: request.startTime || '08:00',
    endTime: request.endTime || '10:00',
    status: request.status || 'aprobada',
    note: request.note || '',
  }));
  const [warn, setWarn] = useState(null);
  const set = (patch) => setF((x) => {
    const n = { ...x, ...patch };
    if (n.to < n.from || n.type === HOURS) n.to = n.from;
    return n;
  });

  const people = useMemo(
    () => Object.values(state.employees).filter((e) => !e.exitDate || e.exitDate >= today || e.legajo === f.legajo).sort((a, b) => (a.name || '~').localeCompare(b.name || '~', 'es')),
    [state.employees, today, f.legajo],
  );
  const emp = state.employees[f.legajo];
  const hours = f.type === HOURS;
  const valid = f.legajo && f.from && f.to >= f.from && (!hours || requestMinutes(f) > 0);
  const bal = emp && f.type === VACATION ? vacationBalance(emp, state.leaves.filter((l) => l.id !== request.id), Number(f.from.slice(0, 4))) : null;
  const group = emp && (state.vacGroups || []).find((g) => g.id === emp.vacGroup);

  // Vacaciones que superan los días que le quedan: se puede dividir en vacaciones + licencia sin goce de sueldo.
  const room = emp && f.type === VACATION && valid ? vacationRoom(state, { ...f, id: request.id }) : null;
  const fmtK = (k) => k.split('-').reverse().join('/');
  const split = () => {
    const vacTo = room.left > 0 ? addDays(f.from, room.left - 1) : null;
    const unpaidFrom = vacTo ? addDays(vacTo, 1) : f.from;
    const base = { legajo: f.legajo, status: f.status, startTime: '', endTime: '', exception: false };
    const note = (t) => [t, f.note].filter(Boolean).join(' · ');
    if (vacTo) {
      const vac = { ...base, type: VACATION, from: f.from, to: vacTo, note: note(`Sigue con licencia sin goce de sueldo hasta el ${fmtK(f.to)}`) };
      if (editing) updateLeave(request.id, vac); else addLeave(vac);
      addLeave({ ...base, type: UNPAID, from: unpaidFrom, to: f.to, note: note(`Excede las vacaciones ${room.year} (le quedaban ${room.left} días)`) });
    } else if (editing) updateLeave(request.id, { ...base, type: UNPAID, from: f.from, to: f.to, note: note(`Sin días de vacaciones disponibles en ${room.year}`) });
    else addLeave({ ...base, type: UNPAID, from: f.from, to: f.to, note: note(`Sin días de vacaciones disponibles en ${room.year}`) });
    toast(vacTo ? `Cargadas: ${room.left} días de vacaciones + ${room.extra} sin goce de sueldo` : 'Cargada como licencia sin goce de sueldo');
    onClose();
  };

  const save = (exception) => {
    const data = { ...f, to: hours ? f.from : f.to, exception: !!exception };
    if (!hours) { data.startTime = ''; data.endTime = ''; }
    if (editing) updateLeave(request.id, data);
    else addLeave(data);
    toast(exception ? 'Guardada como excepción' : editing ? 'Solicitud actualizada' : 'Solicitud cargada');
    onClose();
  };
  const trySave = () => {
    if (!valid) return;
    const problems = checkRequest(state, { ...f, id: request.id, to: hours ? f.from : f.to });
    if (problems.length) setWarn(problems);
    else save(false);
  };

  if (warn) {
    return (
      <WarnDialog
        title="Esta solicitud no debería permitirse"
        intro={`${emp?.name || 'La persona'} · ${f.type} · ${f.from.split('-').reverse().join('/')}${f.to !== f.from ? ` al ${f.to.split('-').reverse().join('/')}` : ''}`}
        problems={warn}
        confirmLabel={f.status === 'pendiente' ? 'Cargar igual como pendiente' : 'Efectuar igual'}
        onConfirm={() => save(true)}
        onClose={() => setWarn(null)}
      />
    );
  }

  return (
    <Modal
      title={editing ? 'Editar solicitud' : 'Nueva solicitud'}
      onClose={onClose}
      footer={
        <>
          {editing ? <Stamp text={fmtStamp(request)} /> : <span className="muted small">Se revisa que no se pise con nadie del grupo.</span>}
          <span className="spacer" />
          {editing && <ConfirmButton confirmLabel="Borrar" onConfirm={() => { removeLeave(request.id); toast('Solicitud borrada'); onClose(); }}>Borrar</ConfirmButton>}
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!valid} onClick={trySave}>Guardar</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field span2">
          <span>Persona</span>
          <select id="rq-emp" className="input" value={f.legajo} disabled={lockPerson} onChange={(e) => set({ legajo: e.target.value })}>
            <option value="">Elegí…</option>
            {people.map((p) => <option key={p.legajo} value={p.legajo}>{p.name || 'Sin nombre'} · #{p.legajo}</option>)}
          </select>
        </label>
        <label className="field span2">
          <span>Tipo</span>
          <select id="rq-type" className="input" value={f.type} onChange={(e) => set({ type: e.target.value })}>
            {REQUEST_TYPES.map((t) => <option key={t.id}>{t.id}</option>)}
          </select>
        </label>
        {hours ? (
          <>
            <label className="field"><span>Día</span><input id="rq-day" type="date" className="input" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
            <div className="field">
              <span>Horario</span>
              <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <TimeInput id="rq-t1" value={f.startTime} onChange={(v) => set({ startTime: v })} aria-label="Desde" />
                <span className="arrow">→</span>
                <TimeInput id="rq-t2" value={f.endTime} onChange={(v) => set({ endTime: v })} aria-label="Hasta" />
              </span>
            </div>
          </>
        ) : (
          <>
            <label className="field"><span>Desde</span><input id="rq-from" type="date" className="input" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
            <label className="field"><span>Hasta</span><input id="rq-to" type="date" className="input" value={f.to} min={f.from} onChange={(e) => set({ to: e.target.value })} /></label>
          </>
        )}
        <div className="field span2">
          <span>Estado</span>
          <div className="seg" role="group" aria-label="Estado">
            {Object.entries(STATUS_LABEL).map(([k, l]) => <button key={k} type="button" aria-pressed={f.status === k} onClick={() => set({ status: k })}>{l}</button>)}
          </div>
        </div>
        <label className="field span2"><span>Nota</span><input id="rq-note" className="input" placeholder="Opcional" value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
      </div>

      {emp && (
        <div className="facts">
          <div><span>Duración</span><b>{hours ? `${fmtDuration(requestMinutes(f))} h` : `${leaveLength(f)} ${leaveLength(f) === 1 ? 'día' : 'días'} corridos`}</b></div>
          <div><span>Antigüedad</span><b>{fmtSeniority(seniority(emp.hireDate))}</b></div>
          <div><span>Grupo</span><b>{group ? `${group.name}${group.max > 0 ? ` (máx. ${group.max})` : ' (sin control)'}` : 'Sin grupo'}</b></div>
          {bal && <div><span>Vacaciones {f.from.slice(0, 4)}</span><b>{bal.corr ? `${bal.corr.days} corresponden · ${bal.approved + bal.pending} usados · ${bal.corr.days - bal.approved - bal.pending} disponibles` : 'Falta fecha de ingreso'}</b></div>}
        </div>
      )}
      {room && room.extra > 0 && (
        <div className="notice warn split-box">
          <b>Supera los días de vacaciones.</b> Le {room.left === 1 ? 'queda 1 día' : `quedan ${room.left} días`} de {room.corr} en {room.year} y pide {room.want}.
          {' '}Para que quede claro en la liquidación, podés dividirlo:
          <div className="split-parts">
            {room.left > 0 && <span><span className="tag vac">Vacaciones</span> {room.left} {room.left === 1 ? 'día' : 'días'} · {fmtK(f.from)} al {fmtK(addDays(f.from, room.left - 1))}</span>}
            <span><span className="tag unpaid">Sin goce de sueldo</span> {room.extra} {room.extra === 1 ? 'día' : 'días'} · {fmtK(room.left > 0 ? addDays(f.from, room.left) : f.from)} al {fmtK(f.to)}</span>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary sm" onClick={split}>{room.left > 0 ? `Dividir en ${room.left} + ${room.extra}` : 'Cargar como sin goce de sueldo'}</button>
            <span className="small">o «Guardar» para cargarlo todo como vacaciones (queda como excepción).</span>
          </div>
        </div>
      )}
      {editing && request.exception && <p className="notice small">Esta solicitud fue cargada como <b>excepción</b>. Si al guardar ya no hay problemas, deja de serlo.</p>}
    </Modal>
  );
}
