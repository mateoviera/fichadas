import { useRef, useState } from 'react';
import { useStore, setSettings, addHolidays, removeHoliday, restoreBackup, resetAll, getState } from '../lib/store.js';
import { fetchHolidays, download } from '../lib/io.js';
import { fmtDate, fmtDateShort, todayKey } from '../lib/time.js';
import { ConfirmButton, useToast } from '../components/ui.jsx';

const COUNTRIES = [['AR', 'Argentina'], ['UY', 'Uruguay'], ['PY', 'Paraguay'], ['CL', 'Chile'], ['BR', 'Brasil'], ['BO', 'Bolivia'], ['PE', 'Perú'], ['ES', 'España'], ['MX', 'México']];

export default function Ajustes() {
  const state = useStore();
  const toast = useToast();
  const s = state.settings;
  const [cc, setCc] = useState('AR');
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [h, setH] = useState({ date: todayKey(), name: '' });
  const fileRef = useRef();

  const num = (k, label, help, min = 0, max = 600) => (
    <label className="field">
      <span>{label}</span>
      <input id={`set-${k}`} type="number" className="input" min={min} max={max} value={s[k]} onChange={(e) => setSettings({ [k]: Math.max(min, Number(e.target.value) || 0) })} />
      <small className="muted">{help}</small>
    </label>
  );

  const importHolidays = async () => {
    setLoading(true); setErr('');
    try {
      const list = await fetchHolidays(year, cc);
      addHolidays(list);
      toast(`${list.length} feriados agregados`);
    } catch (e) {
      setErr(`No se pudieron descargar los feriados (${e.message}). Podés cargarlos a mano abajo.`);
    } finally { setLoading(false); }
  };

  const backup = () => download(`fichadas-respaldo-${todayKey()}.json`, JSON.stringify(getState()), 'application/json');
  const restore = async (file) => {
    try { restoreBackup(JSON.parse(await file.text())); toast('Copia de seguridad restaurada'); }
    catch (e) { setErr(e.message || 'No se pudo leer la copia de seguridad.'); }
  };

  return (
    <>
      <div className="page-head"><div><h2>Ajustes</h2><p>Reglas de control, feriados y copias de seguridad.</p></div></div>

      <div className="grid-2">
        <div className="panel panel-pad stack">
          <h3>Tolerancias</h3>
          <div className="filters">
            {num('tolIn', 'Tolerancia de ingreso (min)', 'Minutos después del horario sin marcar tarde.')}
            {num('tolOut', 'Tolerancia de egreso (min)', 'Minutos antes del horario sin marcar salida anticipada.')}
            {num('extraMin', 'Horas extra desde (min)', 'Minutos después del egreso para marcar extra.')}
          </div>
          <h3>Lectura de fichadas</h3>
          <div className="filters">
            {num('windowMin', 'Ventana de búsqueda (min)', 'Qué tan lejos del horario se busca una fichada.', 30, 480)}
            {num('dedupeMin', 'Unir fichadas repetidas (min)', 'Dos marcas seguidas dentro de este lapso cuentan como una.', 0, 60)}
            {num('maxFreeHours', 'Turno máx. sin horario (h)', 'Para personas sin horario asignado.', 1, 24)}
          </div>
        </div>

        <div className="panel panel-pad stack">
          <h3>Feriados</h3>
          <p className="muted small">En feriados no se cuentan ausencias y los turnos trabajados quedan marcados.</p>
          <div className="row">
            <select id="h-cc" className="input" value={cc} onChange={(e) => setCc(e.target.value)}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
            <input id="h-year" type="number" className="input" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))} />
            <button className="btn" onClick={importHolidays} disabled={loading}>{loading ? 'Descargando…' : 'Importar feriados nacionales'}</button>
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (h.date) { addHolidays([{ date: h.date, name: h.name || 'Feriado' }]); setH({ ...h, name: '' }); } }}>
            <input id="h-date" type="date" className="input" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} />
            <input id="h-name" className="input" style={{ flex: 1 }} placeholder="Nombre (ej.: Día del Trabajador)" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
            <button className="btn">Agregar</button>
          </form>
          {err && <p className="notice warn">{err}</p>}
          {state.holidays.length > 0 && (
            <div className="panel list" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {state.holidays.map((x) => (
                <div key={x.date} className="row">
                  <span className="mono" title={fmtDate(x.date)}>{fmtDateShort(x.date)}/{x.date.slice(2, 4)}</span>
                  <span className="small">{x.name}</span>
                  <span className="spacer" />
                  <button className="btn sm ghost danger" onClick={() => removeHoliday(x.date)}>Quitar</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel panel-pad stack">
          <h3>Copia de seguridad</h3>
          <p className="muted small">Los datos se guardan en este navegador. Descargá una copia para pasarlos a otra computadora o para no perderlos si se borra el historial.</p>
          <div className="row">
            <button className="btn primary" onClick={backup}>Descargar copia</button>
            <button className="btn" onClick={() => fileRef.current.click()}>Restaurar copia</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { e.target.files[0] && restore(e.target.files[0]); e.target.value = ''; }} />
          </div>
          <p className="muted small">{state.punches.length} fichadas · {Object.keys(state.employees).length} personas · {Object.keys(state.establishments).length} establecimientos</p>
        </div>

        <div className="panel panel-pad stack">
          <h3>Borrar datos</h3>
          <p className="muted small">Elimina fichadas, personal, horarios y ajustes de este navegador. Descargá una copia antes.</p>
          <div><ConfirmButton className="btn danger" confirmLabel="Sí, borrar todo" onConfirm={() => { resetAll(); toast('Datos borrados'); }}>Borrar todos los datos</ConfirmButton></div>
        </div>
      </div>
    </>
  );
}
