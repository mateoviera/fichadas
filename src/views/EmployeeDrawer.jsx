import { useState } from 'react';
import { useStore, upsertEmployee, addLeave, removeLeave, addManualPunch, removeManualPunch } from '../lib/store.js';
import { Drawer, ConfirmButton, useToast, TimeInput } from '../components/ui.jsx';
import { fmtDate, fmtTime, dateKey, keyToTs, hmToMin, todayKey } from '../lib/time.js';

export const LEAVE_TYPES = ['Vacaciones', 'Licencia médica', 'Franco compensatorio', 'Capacitación', 'Licencia por examen', 'Otra'];

export default function EmployeeDrawer({ legajo, onClose }) {
  const state = useStore();
  const toast = useToast();
  const emp = state.employees[legajo] || { legajo, name: '', sector: '', scheduleId: '' };
  const leaves = state.leaves.filter((l) => l.legajo === legajo).sort((a, b) => b.from.localeCompare(a.from));
  const manual = state.punches.filter((p) => p.l === legajo && p.f === 'manual').sort((a, b) => b.t - a.t);
  const ests = Object.values(state.establishments);
  const empEsts = [...new Set(state.punches.filter((p) => p.l === legajo).map((p) => p.e))];
  const sectors = [...new Set(Object.values(state.employees).map((e) => e.sector).filter(Boolean))];

  const [lv, setLv] = useState({ from: todayKey(), to: todayKey(), type: LEAVE_TYPES[0] });
  const [mp, setMp] = useState({ date: todayKey(), time: '08:00', estId: empEsts[0] || ests[0]?.id || '', note: '' });

  return (
    <Drawer title={<>{emp.name || 'Sin nombre'} <span className="mono muted">#{legajo}</span></>} onClose={onClose}>
      <div className="stack">
        <div className="section-title">Datos</div>
        <label className="field"><span>Nombre</span><input id="d-name" className="input" value={emp.name} onChange={(e) => upsertEmployee(legajo, { name: e.target.value })} /></label>
        <label className="field">
          <span>Sector</span>
          <input id="d-sector" className="input" list="d-sectors" value={emp.sector} placeholder="Ej.: Enfermería" onChange={(e) => upsertEmployee(legajo, { sector: e.target.value })} />
          <datalist id="d-sectors">{sectors.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="field">
          <span>Horario pactado</span>
          <select id="d-sch" className="input" value={emp.scheduleId} onChange={(e) => upsertEmployee(legajo, { scheduleId: e.target.value })}>
            <option value="">Sin horario</option>
            {state.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {empEsts.length > 0 && <p className="muted small">Ficha en: {empEsts.map((e) => state.establishments[e]?.name).join(', ')}</p>}
      </div>

      <div className="stack">
        <div className="section-title">Licencias y novedades</div>
        <p className="muted small">Los días cubiertos no cuentan como ausencia.</p>
        <div className="row">
          <input id="lv-from" type="date" className="input" value={lv.from} onChange={(e) => setLv({ ...lv, from: e.target.value, to: lv.to < e.target.value ? e.target.value : lv.to })} />
          <span className="arrow">→</span>
          <input id="lv-to" type="date" className="input" value={lv.to} onChange={(e) => setLv({ ...lv, to: e.target.value })} />
        </div>
        <div className="row">
          <select id="lv-type" className="input" style={{ flex: 1 }} value={lv.type} onChange={(e) => setLv({ ...lv, type: e.target.value })}>
            {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button className="btn" onClick={() => { addLeave({ legajo, ...lv }); toast('Novedad agregada'); }}>Agregar</button>
        </div>
        {leaves.length > 0 && (
          <div className="panel list">
            {leaves.map((l) => (
              <div key={l.id} className="row">
                <span><b>{l.type}</b> <span className="muted small">{fmtDate(l.from)}{l.to !== l.from ? ` al ${fmtDate(l.to)}` : ''}</span></span>
                <span className="spacer" />
                <ConfirmButton confirmLabel="Quitar" onConfirm={() => removeLeave(l.id)}>Quitar</ConfirmButton>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="stack">
        <div className="section-title">Fichadas manuales</div>
        <p className="muted small">Para olvidos o fallas del reloj. Se marcan con «M» en el reporte.</p>
        <div className="row">
          <input id="mp-date" type="date" className="input" value={mp.date} onChange={(e) => setMp({ ...mp, date: e.target.value })} />
          <TimeInput id="mp-time" value={mp.time} onChange={(v) => setMp({ ...mp, time: v })} />
          <select id="mp-est" className="input" style={{ flex: 1 }} value={mp.estId} onChange={(e) => setMp({ ...mp, estId: e.target.value })}>
            {ests.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="row">
          <input id="mp-note" className="input" style={{ flex: 1 }} placeholder="Motivo (opcional)" value={mp.note} onChange={(e) => setMp({ ...mp, note: e.target.value })} />
          <button
            className="btn"
            disabled={!mp.estId || !mp.date || !mp.time}
            onClick={() => {
              addManualPunch({ legajo, estId: mp.estId, ts: keyToTs(mp.date) + hmToMin(mp.time) * 60, note: mp.note || 'Fichada manual' });
              toast('Fichada manual agregada');
            }}
          >Agregar</button>
        </div>
        {!ests.length && <p className="notice warn">Primero cargá al menos un archivo para tener establecimientos.</p>}
        {manual.length > 0 && (
          <div className="panel list">
            {manual.map((p) => (
              <div key={p.id} className="row">
                <span className="mono">{fmtDate(dateKey(p.t))} {fmtTime(p.t)}</span>
                <span className="muted small">{state.establishments[p.e]?.name} · {p.m}</span>
                <span className="spacer" />
                <ConfirmButton confirmLabel="Quitar" onConfirm={() => removeManualPunch(p.id)}>Quitar</ConfirmButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
