import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { ISSUE_LABELS, INFO_LABELS } from '../lib/engine.js';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => setMsg({ m, k: Date.now() }), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status" key={msg.k}>{msg.m}</div>}
    </ToastCtx.Provider>
  );
}

/** Botón con confirmación en línea (sin diálogos del navegador). */
export function ConfirmButton({ children, confirmLabel = 'Confirmar', onConfirm, className = 'btn sm ghost danger' }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" className={className} onClick={() => setAsk(true)}>{children}</button>;
  return (
    <span className="row" style={{ gap: 4 }}>
      <button type="button" className="btn sm danger" onClick={() => { setAsk(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn sm ghost" onClick={() => setAsk(false)}>Cancelar</button>
    </span>
  );
}

const ISSUE_TONE = { tarde: 'warn', anticipada: 'warn', sin_ingreso: 'bad', sin_egreso: 'bad', ausente: 'bad', fuera: 'neutral' };

export function RowPills({ r }) {
  const pills = r.issues.map((i) => (
    <span key={i} className={`pill ${ISSUE_TONE[i]}`}>
      {ISSUE_LABELS[i]}
      {i === 'tarde' && ` +${r.lateMin}′`}
      {i === 'anticipada' && ` −${r.earlyMin}′`}
    </span>
  ));
  for (const i of r.info) {
    if (i === 'sin_horario' && r.issues.length) continue;
    const text = i === 'feriado' ? `Feriado${r.holidayName ? ` · ${r.holidayName}` : ''}` : i === 'licencia' ? r.leaveType || 'Licencia' : i === 'extra' ? `Extra +${r.extraMin}′` : INFO_LABELS[i];
    pills.push(<span key={i} className={`pill ${i === 'sin_horario' ? 'neutral' : 'info'}`} title={text}>{text.length > 34 ? text.slice(0, 32) + '…' : text}</span>);
  }
  if (!r.issues.length && (r.entry || r.exit) && !r.info.includes('sin_horario')) pills.unshift(<span key="ok" className="pill ok">Cumplido</span>);
  return <span className="row" style={{ gap: 4 }}>{pills}</span>;
}

export function Drawer({ title, onClose, children, actions }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={typeof title === 'string' ? title : 'Detalle'}>
        <div className="drawer-head">
          <h3 style={{ flex: 1, minWidth: 0 }}>{title}</h3>
          {actions}
          <button className="btn sm ghost" onClick={onClose} aria-label="Cerrar">Cerrar</button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

export function EstSelect({ establishments, value, onChange, allLabel = 'Todos', id, className = 'input' }) {
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {Object.values(establishments).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );
}

/** Hora en formato 24 h (HH:MM), independiente del idioma del navegador. */
export function TimeInput({ value, onChange, id, ...rest }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const digits = String(draft).replace(/\D/g, '');
    let h, m;
    if (/^\d{1,2}:\d{1,2}$/.test(draft)) [h, m] = draft.split(':').map(Number);
    else if (digits.length <= 2) [h, m] = [Number(digits), 0];
    else [h, m] = [Number(digits.slice(0, -2)), Number(digits.slice(-2))];
    if (!digits || h > 23 || m > 59 || Number.isNaN(h)) return setDraft(value);
    const v = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setDraft(v);
    if (v !== value) onChange(v);
  };
  return (
    <input
      id={id}
      className="input time"
      inputMode="numeric"
      maxLength={5}
      placeholder="HH:MM"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      {...rest}
    />
  );
}
