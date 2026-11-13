import { statusText, rowObs, fmtSigned } from '../lib/report.js';
import { fmtDate, fmtDateShort, fmtTime, fmtDuration } from '../lib/time.js';

/** Planillas de asistencia para imprimir: una hoja por persona, con totales y firmas. Solo se ven al imprimir. */
export default function Planilla({ items, state, from, to, estId }) {
  const generated = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  const estName = estId ? state.establishments[estId]?.name : '';
  return (
    <div className="sheets">
      {items.map(({ emp, sch, allRows, ests = [], summary: s }) => (
        <article className="sheet" key={emp.legajo}>
          <header className="sheet-head">
            <div>
              <h2>Planilla de asistencia</h2>
              <p>Período {fmtDate(from)} al {fmtDate(to)}{estName ? ` · ${estName}` : ''}</p>
            </div>
            <p className="sheet-gen">Generado el {generated}</p>
          </header>

          <dl className="sheet-emp">
            <div><dt>Nombre</dt><dd>{emp.name || 'Sin nombre'}</dd></div>
            <div><dt>Legajo</dt><dd className="mono">{emp.legajo}</dd></div>
            <div><dt>Sector</dt><dd>{emp.sector || '—'}</dd></div>
            <div><dt>Horario</dt><dd>{sch ? sch.name : 'Sin horario'}</dd></div>
            <div><dt>Ficha en</dt><dd>{ests.map((e) => state.establishments[e]?.name).filter(Boolean).join(', ') || '—'}</dd></div>
          </dl>

          <table className="sheet-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Turno</th><th>Ingreso</th><th>Egreso</th><th className="right">Horas</th><th className="right">Sin fichada</th><th>Establecimiento</th><th>Estado</th><th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((r) => (
                <tr key={r.key}>
                  <td className="nowrap">{fmtDateShort(r.date)}</td>
                  <td className="mono nowrap">{r.inst ? r.inst.label : '—'}</td>
                  <td className="mono nowrap">{r.entry ? fmtTime(r.entry.t) + (r.entry.m ? ' (M)' : '') : '--:--'}</td>
                  <td className="mono nowrap">
                    {r.exit ? fmtTime(r.exit.t) + (r.nextDayExit ? ' (+1)' : '') + (r.exit.m ? ' (M)' : '') : '--:--'}
                  </td>
                  <td className="num right">{r.workedMin ? fmtDuration(r.workedMin) : ''}</td>
                  <td className="num right bad-text">{r.missingMin ? fmtDuration(r.missingMin) : ''}</td>
                  <td>{placeOf(r, state)}</td>
                  <td className={r.issues.length ? 'bad-text' : ''}>{statusText(r) || (r.info.includes('feriado') ? 'Feriado' : r.info.includes('licencia') ? r.leaveType : '')}</td>
                  <td className="small">{rowObs(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sheet-totals">
            <Total label="Horas trabajadas" value={fmtDuration(s.worked)} />
            <Total label="Horas sin fichada" value={fmtDuration(s.sinFichada)} bad={s.sinFichada > 0} />
            {s.expected > 0 && <Total label="Horas esperadas" value={fmtDuration(s.expected)} />}
            {s.expected > 0 && <Total label="Saldo" value={fmtSigned(s.saldo)} bad={s.saldo < 0} />}
            <Total label="Horas extra" value={fmtDuration(s.extra)} />
            <Total label="Llegadas tarde" value={`${s.tarde}${s.tardeMin ? ` (${s.tardeMin} min)` : ''}`} bad={s.tarde > 0} />
            <Total label="Salidas anticipadas" value={`${s.anticipada}${s.anticipadaMin ? ` (${s.anticipadaMin} min)` : ''}`} bad={s.anticipada > 0} />
            <Total label="Incompletos" value={s.incompleto} bad={s.incompleto > 0} />
            <Total label="Ausencias" value={s.ausente} bad={s.ausente > 0} />
          </div>
          <p className="sheet-note">(M) fichada cargada a mano · (+1) egreso al día siguiente · Las horas sin fichada no se suman a las trabajadas.</p>

          <div className="sheet-signs">
            <div><span />Firma del empleado</div>
            <div><span />Firma y aclaración del responsable</div>
          </div>
        </article>
      ))}
    </div>
  );
}

/** Dónde se fichó: si ingreso y egreso son en lugares distintos, muestra ambos. */
function placeOf(r, state) {
  const name = (id) => state.establishments[id]?.name || '';
  const a = r.entry ? name(r.entry.e) : '';
  const b = r.exit ? name(r.exit.e) : '';
  if (a && b && a !== b) return `${a} → ${b}`;
  return a || b || name(r.est);
}

function Total({ label, value, bad }) {
  return (
    <div className="sheet-total">
      <span>{label}</span>
      <b className={bad ? 'bad-text' : ''}>{value}</b>
    </div>
  );
}
