import { useMemo, useState, useEffect } from 'react';
import { useStore, monthsInData, addManualPunch } from '../lib/store.js';
import { computeReport, STATUS_FILTERS, buildExportSheets, fmtSigned } from '../lib/report.js';
import { fmtTime, fmtDateShort, fmtDuration, dateKey, keyToTs, hmToMin, DAY } from '../lib/time.js';
import { buildXlsx } from '../lib/xlsx.js';
import { download, toCSV } from '../lib/io.js';
import { RowPills, EstSelect, useToast, TimeInput, Help } from '../components/ui.jsx';
import EmployeeDrawer from './EmployeeDrawer.jsx';
import Planilla from './Planilla.jsx';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const monthLabel = (m) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return [`${m}-01`, `${m}-${String(last).padStart(2, '0')}`];
};

const PREF = 'fichadas:filtros';
const loadPref = () => { try { return JSON.parse(sessionStorage.getItem(PREF)) || {}; } catch { return {}; } };

export default function Reporte() {
  const state = useStore();
  const toast = useToast();
  const months = useMemo(() => monthsInData(state.punches), [state.punches]);
  const pref = loadPref();
  const initialMonth = pref.month && (pref.month === 'custom' || months.includes(pref.month)) ? pref.month : months[0] || '';
  const [month, setMonth] = useState(initialMonth);
  const [[from, to], setRange] = useState(pref.month === 'custom' && pref.from ? [pref.from, pref.to] : initialMonth && initialMonth !== 'custom' ? monthRange(initialMonth) : ['', '']);
  const [estId, setEst] = useState(pref.estId || '');
  const [sector, setSector] = useState(pref.sector || '');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(pref.status || 'todos');
  const [open, setOpen] = useState(() => new Set());
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    try { sessionStorage.setItem(PREF, JSON.stringify({ month, from, to, estId, sector, status })); } catch { /* */ }
  }, [month, from, to, estId, sector, status]);

  useEffect(() => {
    if (!month && months[0]) { setMonth(months[0]); setRange(monthRange(months[0])); }
  }, [months, month]);

  const sectors = useMemo(() => [...new Set(Object.values(state.employees).map((e) => e.sector).filter(Boolean))].sort(), [state.employees]);
  const report = useMemo(() => (from && to ? computeReport(state, { from, to, estId, sector, q, status }) : { list: [], total: null }), [state, from, to, estId, sector, q, status]);
  const t = report.total;

  const pickMonth = (m) => {
    setMonth(m);
    if (m !== 'custom') setRange(monthRange(m));
  };
  const toggle = (l) => setOpen((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n; });
  const allOpen = report.list.length > 0 && report.list.every((x) => open.has(x.emp.legajo));
  const unassigned = report.list.filter((x) => !x.sch).length;

  const fileBase = `fichadas_${from}_${to}${estId ? '_' + (state.establishments[estId]?.name || '') : ''}`.replace(/\s+/g, '-');
  const exportXlsx = () => { download(`${fileBase}.xlsx`, buildXlsx(buildExportSheets(report, state))); toast('Excel generado'); };
  const exportCsv = () => { download(`${fileBase}.csv`, toCSV(buildExportSheets(report, state)[1].rows), 'text/csv'); toast('CSV generado'); };
  const printPdf = () => { setOpen(new Set(report.list.map((x) => x.emp.legajo))); setTimeout(() => window.print(), 120); };

  // Planillas por persona: se montan solo para imprimir y se desmontan al cerrar el diálogo.
  const [sheets, setSheets] = useState(null);
  useEffect(() => {
    if (!sheets) return;
    document.body.classList.add('printing-sheets');
    const done = () => setSheets(null);
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('printing-sheets'); };
  }, [sheets]);

  const STATUS_LABEL = Object.fromEntries(STATUS_FILTERS.map((s) => [s.id, s.label]));
  const printInfo = [
    `Generado el ${new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`,
    sector && `Sector: ${sector}`,
    status !== 'todos' && `Estado: ${STATUS_LABEL[status]}`,
    q.trim() && `Búsqueda: «${q.trim()}»`,
  ].filter(Boolean).join(' · ');

  if (!state.punches.length) {
    return (
      <div className="panel empty">
        <h3>Todavía no hay fichadas</h3>
        <p>Cargá los TXT de los relojes en <a href="#archivos">Configuración → Archivos del reloj</a> para ver el control de horarios.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Fichadas</h2>
          <p>Entradas y salidas del reloj comparadas con el horario de cada persona · {from && to ? `${fmtDateShort(from)} al ${fmtDateShort(to)}` : 'elegí un período'} · {estId ? state.establishments[estId]?.name : 'todos los establecimientos'}</p>
          <p className="print-only small">{printInfo}</p>
        </div>
        <div className="row no-print">
          <a className="btn" href="#archivos">Cargar archivos del reloj</a>
          <button className="btn" onClick={exportXlsx} disabled={!report.list.length}>Excel</button>
          <button className="btn" onClick={exportCsv} disabled={!report.list.length}>CSV</button>
          <button className="btn" onClick={printPdf} disabled={!report.list.length} title="Listado de todas las personas filtradas">Imprimir listado</button>
          <button className="btn" onClick={() => setSheets(report.list)} disabled={!report.list.length} title="Una hoja por persona, con totales y firmas">Planillas por persona</button>
        </div>
      </div>

      <div className="panel panel-pad filters no-print">
        <label className="field">
          <span>Período</span>
          <select id="f-month" className="input" value={month} onChange={(e) => pickMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            <option value="custom">Personalizado…</option>
          </select>
        </label>
        {month === 'custom' && (
          <>
            <label className="field"><span>Desde</span><input id="f-from" type="date" className="input" value={from} onChange={(e) => setRange([e.target.value, to < e.target.value ? e.target.value : to])} /></label>
            <label className="field"><span>Hasta</span><input id="f-to" type="date" className="input" value={to} onChange={(e) => setRange([from, e.target.value])} /></label>
          </>
        )}
        <label className="field"><span>Establecimiento</span><EstSelect id="f-est" establishments={state.establishments} value={estId} onChange={setEst} /></label>
        <label className="field">
          <span>Sector</span>
          <select id="f-sector" className="input" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">Todos</option>
            {sectors.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Estado</span>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field"><span>Buscar</span><input id="f-q" className="input" placeholder="Nombre o legajo" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>

      {t && (
        <>
          <div className="stats">
            <Stat label="Cumplimiento" value={t.cumplimiento == null ? '—' : `${t.cumplimiento}%`} tone="ok" hint="Turnos sin ninguna incidencia" />
            <Stat label="Llegadas tarde" value={t.tarde} tone={t.tarde ? 'warn' : ''} onClick={() => setStatus(status === 'tarde' ? 'todos' : 'tarde')} pressed={status === 'tarde'} />
            <Stat label="Salidas antes de hora" value={t.anticipada} tone={t.anticipada ? 'warn' : ''} onClick={() => setStatus(status === 'anticipada' ? 'todos' : 'anticipada')} pressed={status === 'anticipada'} />
            <Stat label="Falta entrada o salida" value={t.incompleto} tone={t.incompleto ? 'bad' : ''} onClick={() => setStatus(status === 'incompleto' ? 'todos' : 'incompleto')} pressed={status === 'incompleto'} />
            <Stat label="Ausencias" value={t.ausente} tone={t.ausente ? 'bad' : ''} onClick={() => setStatus(status === 'ausente' ? 'todos' : 'ausente')} pressed={status === 'ausente'} />
          </div>
          <Help>
            <ul className="plain">
              <li><b>Cumplimiento</b>: de los turnos que tenía que hacer, cuántos se hicieron sin ninguna incidencia.</li>
              <li><b>Llegada tarde / salida antes de hora</b>: más de {state.settings.tolIn ?? 10} minutos de diferencia con el horario (se cambia en Configuración → Ajustes).</li>
              <li><b>Falta entrada o salida</b>: fichó solo una de las dos. Esas horas no se pueden contar hasta que se complete (botón «+ Salida» / «+ Ingreso»).</li>
              <li><b>Ausencia</b>: no fichó en un día que le tocaba, sin feriado ni solicitud aprobada. En horarios rotativos no hay ausencias: se comparan las horas del mes.</li>
              <li>Tocá un número para ver solo esos casos. Abrí una persona para ver sus horas y el detalle día por día.</li>
            </ul>
          </Help>
        </>
      )}

      {unassigned > 0 && (
        <div className="notice no-print">
          {unassigned} {unassigned === 1 ? 'persona no tiene' : 'personas no tienen'} horario asignado: se muestran ingresos y egresos, pero no se controla el cumplimiento. Asignalo en <a href="#personal">Personal</a>.
        </div>
      )}

      <div className="panel">
        <div className="panel-head no-print">
          <span className="muted small">{report.list.length} personas</span>
          <span className="spacer" />
          <button className="btn sm ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(report.list.map((x) => x.emp.legajo)))}>{allOpen ? 'Contraer todo' : 'Expandir todo'}</button>
        </div>
        {!report.list.length && <div className="empty">No hay turnos que coincidan con los filtros.</div>}
        {report.list.map((x) => (
          <EmployeeBlock key={x.emp.legajo} x={x} open={open.has(x.emp.legajo)} onToggle={() => toggle(x.emp.legajo)} onDetail={() => setDetail(x.emp.legajo)} onPrint={() => setSheets([x])} state={state} />
        ))}
      </div>

      {detail && <EmployeeDrawer legajo={detail} onClose={() => setDetail(null)} />}
      {sheets && <Planilla items={sheets} state={state} from={from} to={to} estId={estId} />}
    </>
  );
}

function Stat({ label, value, tone = '', onClick, pressed, hint }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat ${tone}`} onClick={onClick} aria-pressed={onClick ? !!pressed : undefined} type={onClick ? 'button' : undefined} title={hint || (onClick ? 'Tocá para ver solo estos casos' : undefined)}>
      <b>{value}</b>
      <span>{label}</span>
    </Tag>
  );
}

function EmployeeBlock({ x, open, onToggle, onDetail, onPrint, state }) {
  const { emp, sch, rows, summary: s } = x;
  const issues = s.tarde + s.anticipada + s.incompleto + s.ausente;
  const multiEst = (x.ests || []).length > 1;
  return (
    <section className="emp">
      <button className="emp-head" onClick={onToggle} aria-expanded={open}>
        <span className="emp-name">
          <span className={`caret ${open ? 'open' : ''}`}>›</span>
          <strong>{emp.name || 'Sin nombre'}</strong>
          <span className="mono muted">#{emp.legajo}</span>
          <span className="muted small">{sch ? sch.name : 'Sin horario asignado'}</span>
        </span>
        <span className="emp-meta">
          {s.tarde > 0 && <span className="pill warn">{s.tarde} tarde</span>}
          {s.anticipada > 0 && <span className="pill warn">{s.anticipada} antes de hora</span>}
          {s.incompleto > 0 && <span className="pill bad">{s.incompleto} sin entrada/salida</span>}
          {s.ausente > 0 && <span className="pill bad">{s.ausente} {s.ausente === 1 ? 'ausencia' : 'ausencias'}</span>}
          {!issues && sch && <span className="pill ok">Sin incidencias</span>}
          {s.cumplimiento != null && (
            <span className="row small" style={{ gap: 6 }} title="Turnos sin incidencias sobre turnos que tenía que hacer">
              <span className="bar"><i style={{ width: `${s.cumplimiento}%` }} /></span>
              <span className="num">{s.cumplimiento}%</span>
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="emp-body">
          <div className="hours">
            <div>
              <span>Horas trabajadas</span>
              <b>{fmtDuration(s.worked)} h</b>
              <small>dentro de su horario, con entrada y salida fichadas</small>
            </div>
            {s.expected > 0 && (
              <div>
                <span>Horas que debía trabajar</span>
                <b>{fmtDuration(s.expected)} h</b>
                <small>{s.quota ? `${s.quota.days} días × turno de ${fmtDuration(s.quota.shiftMin)} h (mes del 1 al anteúltimo, menos 6 francos)` : 'según su horario, sin feriados ni licencias'}</small>
              </div>
            )}
            {s.expected > 0 && (
              <div>
                <span>Diferencia</span>
                <b className={s.saldo < 0 ? 'bad-text' : 'ok-text'}>{fmtSigned(s.saldo)} h</b>
                <small>{s.saldo < 0 ? 'le faltan horas' : s.saldo > 0 ? 'trabajó de más' : 'justo'}</small>
              </div>
            )}
            {s.temprano > 0 && (
              <div>
                <span>Llegadas tempranas</span>
                <b>{fmtDuration(s.temprano)} h</b>
                <small>antes del horario de ingreso</small>
              </div>
            )}
            {s.extra > 0 && (
              <div>
                <span>Horas extra</span>
                <b>{fmtDuration(s.extra)} h</b>
                <small>después del horario de egreso</small>
              </div>
            )}
            {s.quota && (
              <div>
                <span>Turnos completos</span>
                <b>{s.daysWorked} de {Math.round(s.quota.days)}</b>
                <small>días esperados en el período</small>
              </div>
            )}
          </div>
          {(s.sinFichada > 0 || s.tardeMin > 0 || s.anticipadaMin > 0) && (
            <p className="emp-note">
              {[
                s.sinFichada > 0 && `${fmtDuration(s.sinFichada)} h no se cuentan porque falta la entrada o la salida`,
                s.tardeMin > 0 && `${s.tardeMin} min de tardanza en total`,
                s.anticipadaMin > 0 && `${s.anticipadaMin} min de salidas antes de hora`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Horario</th><th>Entrada</th><th>Salida</th><th className="right">Horas</th><th>Estado</th>{multiEst && <th>Lugar</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={!r.entry && !r.exit && !r.issues.length ? 'dim' : ''}>
                    <td className="nowrap">{fmtDateShort(r.date)}</td>
                    <td className="mono nowrap">{r.inst ? r.inst.label : '—'}</td>
                    <td className="mono nowrap">
                      {r.entry ? fmtTime(r.entry.t) : '--:--'}
                      {r.entry && r.inst && <Delta min={Math.round((r.entry.t - r.inst.start) / 60)} tol={state.settings.tolIn} />}
                      {r.entry?.m && <span className="plus1" title={r.entry.m}>M</span>}
                    </td>
                    <td className="mono nowrap">
                      {r.exit ? fmtTime(r.exit.t) : '--:--'}
                      {r.nextDayExit && <span className="plus1" title={`Salida el ${dateKey(r.exit.t)}`}>+1</span>}
                      {r.exit && r.inst && <Delta min={Math.round((r.exit.t - r.inst.end) / 60)} tol={state.settings.tolOut} exit />}
                      {r.exit?.m && <span className="plus1" title={r.exit.m}>M</span>}
                      {r.mids.length > 0 && <span className="muted small" title={`Fichadas en el medio: ${r.mids.map((m) => fmtTime(m.t)).join(', ')}`}> · {r.mids.length} en el medio</span>}
                    </td>
                    <td className="num right nowrap">{r.workedMin ? fmtDuration(r.workedMin) : ''}</td>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <RowPills r={r} />
                        <CompleteMissing r={r} legajo={emp.legajo} />
                      </span>
                    </td>
                    {multiEst && <td className="muted small nowrap">{state.establishments[r.est]?.name || ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row no-print" style={{ padding: '8px 16px 0 34px' }}>
            <button className="btn sm" onClick={onDetail}>Ficha de la persona</button>
            <button className="btn sm" onClick={onPrint}>Imprimir planilla</button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Botón para completar la fichada que falta (ingreso o egreso) con la hora del turno.
 * Agrega una fichada manual: el día queda marcado con «M» y se puede quitar desde el detalle.
 */
function CompleteMissing({ r, legajo }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const kind = !r.inst ? null : r.entry && !r.exit ? 'exit' : !r.entry && r.exit ? 'entry' : null;
  const defTs = kind === 'exit' ? r.inst.end : kind === 'entry' ? r.inst.start : 0;
  const [hm, setHm] = useState(defTs ? fmtTime(defTs) : '');
  if (!kind) return null;
  const label = kind === 'exit' ? 'salida' : 'ingreso';
  const other = kind === 'exit' ? r.entry : r.exit;

  const save = () => {
    const min = hmToMin(hm);
    if (min == null) return;
    let ts = keyToTs(dateKey(defTs)) + min * 60;
    // turnos nocturnos: la salida no puede ser antes que el ingreso (ni el ingreso después de la salida)
    if (kind === 'exit' && ts <= other.t) ts += DAY;
    if (kind === 'entry' && ts >= other.t) ts -= DAY;
    addManualPunch({ legajo, estId: other.e, ts, note: kind === 'exit' ? 'Salida completada desde el reporte' : 'Ingreso completado desde el reporte' });
    toast(`${kind === 'exit' ? 'Salida' : 'Ingreso'} agregado a las ${hm} (fichada manual)`);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button type="button" className="btn sm ghost no-print add-punch" onClick={() => setEditing(true)} title={`Cargar la ${label} que falta como fichada manual`}>
        + {label === 'salida' ? 'Salida' : 'Ingreso'}
      </button>
    );
  }
  return (
    <span className="row no-print" style={{ gap: 4 }}>
      <TimeInput value={hm} onChange={setHm} aria-label={`Hora de ${label}`} autoFocus />
      <button type="button" className="btn sm" onClick={save}>Agregar</button>
      <button type="button" className="btn sm ghost" onClick={() => { setEditing(false); setHm(fmtTime(defTs)); }}>Cancelar</button>
    </span>
  );
}

function Delta({ min, tol, exit }) {
  if (!min) return null;
  const bad = exit ? min < -tol : min > tol;
  const txt = `${min > 0 ? '+' : '−'}${Math.abs(min)}′`;
  return <span className={`delta ${bad ? 'warn' : 'ok'}`}>{txt}</span>;
}

