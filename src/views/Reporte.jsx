import { useMemo, useState, useEffect } from 'react';
import { useStore, monthsInData } from '../lib/store.js';
import { computeReport, STATUS_FILTERS, buildExportSheets } from '../lib/report.js';
import { fmtTime, fmtDateShort, fmtDuration, dateKey } from '../lib/time.js';
import { buildXlsx } from '../lib/xlsx.js';
import { download, toCSV } from '../lib/io.js';
import { RowPills, EstSelect, useToast } from '../components/ui.jsx';
import EmployeeDrawer from './EmployeeDrawer.jsx';

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

  if (!state.punches.length) {
    return (
      <div className="panel empty">
        <h3>Todavía no hay fichadas</h3>
        <p>Cargá los TXT de los relojes en <a href="#archivos">Archivos</a> para ver el control de horarios.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Control de fichadas</h2>
          <p>{from && to ? `${fmtDateShort(from)} al ${fmtDateShort(to)}` : 'Elegí un período'} · {estId ? state.establishments[estId]?.name : 'todos los establecimientos'}</p>
        </div>
        <div className="row no-print">
          <button className="btn" onClick={exportXlsx} disabled={!report.list.length}>Excel</button>
          <button className="btn" onClick={exportCsv} disabled={!report.list.length}>CSV</button>
          <button className="btn" onClick={printPdf} disabled={!report.list.length}>Imprimir / PDF</button>
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
        <div className="stats">
          <Stat label="Cumplimiento" value={t.cumplimiento == null ? '—' : `${t.cumplimiento}%`} tone="ok" />
          <Stat label="Turnos" value={t.turnos} />
          <Stat label="Llegadas tarde" value={t.tarde} tone={t.tarde ? 'warn' : ''} onClick={() => setStatus(status === 'tarde' ? 'todos' : 'tarde')} pressed={status === 'tarde'} />
          <Stat label="Salidas anticipadas" value={t.anticipada} tone={t.anticipada ? 'warn' : ''} onClick={() => setStatus(status === 'anticipada' ? 'todos' : 'anticipada')} pressed={status === 'anticipada'} />
          <Stat label="Incompletos" value={t.incompleto} tone={t.incompleto ? 'bad' : ''} onClick={() => setStatus(status === 'incompleto' ? 'todos' : 'incompleto')} pressed={status === 'incompleto'} />
          <Stat label="Ausencias" value={t.ausente} tone={t.ausente ? 'bad' : ''} onClick={() => setStatus(status === 'ausente' ? 'todos' : 'ausente')} pressed={status === 'ausente'} />
          <Stat label="Horas trabajadas" value={fmtDuration(t.worked)} />
        </div>
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
          <EmployeeBlock key={x.emp.legajo} x={x} open={open.has(x.emp.legajo)} onToggle={() => toggle(x.emp.legajo)} onDetail={() => setDetail(x.emp.legajo)} state={state} />
        ))}
      </div>

      {detail && <EmployeeDrawer legajo={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function Stat({ label, value, tone = '', onClick, pressed }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat ${tone}`} onClick={onClick} aria-pressed={onClick ? !!pressed : undefined} type={onClick ? 'button' : undefined}>
      <b>{value}</b>
      <span>{label}</span>
    </Tag>
  );
}

function EmployeeBlock({ x, open, onToggle, onDetail, state }) {
  const { emp, sch, rows, summary: s } = x;
  const issues = s.tarde + s.anticipada + s.incompleto + s.ausente;
  return (
    <section className="emp">
      <button className="emp-head" onClick={onToggle} aria-expanded={open}>
        <span className="emp-name">
          <span className={`caret ${open ? 'open' : ''}`}>›</span>
          <strong>{emp.name || 'Sin nombre'}</strong>
          <span className="mono muted">#{emp.legajo}</span>
          {emp.sector && <span className="muted small">{emp.sector}</span>}
          <span className="muted small">· {sch ? sch.name : 'Sin horario'}</span>
        </span>
        <span className="emp-meta">
          {s.cumplimiento != null && (
            <span className="row small" style={{ gap: 6 }} title="Turnos cumplidos sobre turnos evaluables">
              <span className="bar"><i style={{ width: `${s.cumplimiento}%` }} /></span>
              <span className="num">{s.cumplimiento}%</span>
            </span>
          )}
          {s.tarde > 0 && <span className="pill warn">{s.tarde} tarde</span>}
          {s.anticipada > 0 && <span className="pill warn">{s.anticipada} anticip.</span>}
          {s.incompleto > 0 && <span className="pill bad">{s.incompleto} incomp.</span>}
          {s.ausente > 0 && <span className="pill bad">{s.ausente} ausente</span>}
          {!issues && sch && <span className="pill ok">Sin incidencias</span>}
          <span className="num muted" title="Horas trabajadas">{fmtDuration(s.worked)} h</span>
        </span>
      </button>
      {open && (
        <div className="emp-body">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Turno</th><th>Ingreso</th><th>Egreso</th><th className="right">Horas</th><th>Estado</th><th>Establecimiento</th>
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
                      {r.nextDayExit && <span className="plus1" title={`Egreso el ${dateKey(r.exit.t)}`}>+1</span>}
                      {r.exit && r.inst && <Delta min={Math.round((r.exit.t - r.inst.end) / 60)} tol={state.settings.tolOut} exit />}
                      {r.exit?.m && <span className="plus1" title={r.exit.m}>M</span>}
                      {r.mids.length > 0 && <span className="muted small" title={`Fichadas intermedias: ${r.mids.map((m) => fmtTime(m.t)).join(', ')}`}> · {r.mids.length} intermedia{r.mids.length > 1 ? 's' : ''}</span>}
                    </td>
                    <td className="num right">{r.workedMin ? fmtDuration(r.workedMin) : ''}</td>
                    <td><RowPills r={r} /></td>
                    <td className="muted small nowrap">{state.establishments[r.est]?.name || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row no-print" style={{ padding: '8px 16px 0 34px' }}>
            <button className="btn sm" onClick={onDetail}>Horario, licencias y fichadas manuales</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Delta({ min, tol, exit }) {
  if (!min) return null;
  const bad = exit ? min < -tol : min > tol;
  const txt = `${min > 0 ? '+' : '−'}${Math.abs(min)}′`;
  return <span className={`delta ${bad ? 'warn' : 'ok'}`}>{txt}</span>;
}

