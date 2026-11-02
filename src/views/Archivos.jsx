import { useRef, useState } from 'react';
import { useStore, importParsed, removeFile, renameEstablishment } from '../lib/store.js';
import { parseClockFile, decodeBuffer } from '../lib/parser.js';
import { fmtDate } from '../lib/time.js';
import { ConfirmButton, useToast } from '../components/ui.jsx';

export default function Archivos({ samples }) {
  const state = useStore();
  const toast = useToast();
  const [pending, setPending] = useState([]);
  const [over, setOver] = useState(false);
  const inputRef = useRef();

  const guessEst = (fileName) => {
    const f = state.files.find((x) => x.name === fileName);
    return f ? f.estId : '';
  };

  const addFiles = async (fileList) => {
    const items = [];
    for (const file of fileList) {
      const text = decodeBuffer(await file.arrayBuffer());
      const parsed = parseClockFile(text, file.name);
      items.push({ id: `${file.name}-${Date.now()}-${Math.random()}`, parsed, estId: guessEst(file.name), newName: file.name.replace(/\.[^.]+$/, '') });
    }
    setPending((p) => p.concat(items));
  };

  const doImport = (item) => {
    if (!item.parsed.records.length) return;
    const n = importParsed(item.parsed, { estId: item.estId, newEstName: item.newName });
    setPending((p) => p.filter((x) => x.id !== item.id));
    toast(n ? `${n} fichadas nuevas de ${item.parsed.meta.fileName}` : `${item.parsed.meta.fileName}: todas las fichadas ya estaban cargadas`);
  };

  const ests = Object.values(state.establishments);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Archivos de relojes</h2>
          <p>Cada TXT corresponde a un establecimiento. Podés volver a cargar el mismo reloj cada mes: las fichadas repetidas se ignoran.</p>
        </div>
      </div>

      <label
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles([...e.dataTransfer.files]); }}
      >
        <strong>Arrastrá los TXT del reloj o hacé clic para elegirlos</strong>
        <span className="muted small">Formatos ProSoft / ZKTeco: AllGLog, GLog, UDISKLOG. Podés cargar varios a la vez.</span>
        <input ref={inputRef} type="file" accept=".txt,.dat,.log,text/plain" multiple hidden onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
      </label>

      {pending.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3>Revisar antes de importar</h3>
            <span className="spacer" />
            {pending.length > 1 && <button className="btn primary sm" onClick={() => pending.forEach(doImport)}>Importar todos</button>}
          </div>
          <div className="list">
            {pending.map((it) => {
              const { meta, summary, errors } = it.parsed;
              return (
                <div key={it.id} className="stack" style={{ gap: 10 }}>
                  <div className="row">
                    <b>{meta.fileName}</b>
                    <span className="pill neutral">{meta.format}</span>
                    {meta.firmware && <span className="muted small mono">{meta.firmware}</span>}
                  </div>
                  {summary.count ? (
                    <div className="kv">
                      <span><b>{summary.count}</b> fichadas</span>
                      <span><b>{summary.legajos}</b> legajos</span>
                      <span>del <b>{fmtDate(summary.from)}</b> al <b>{fmtDate(summary.to)}</b></span>
                      {errors.length > 0 && <span style={{ color: 'var(--warn)' }}>{errors.length} líneas no reconocidas</span>}
                    </div>
                  ) : (
                    <p className="notice warn">No se encontraron fichadas en este archivo. Revisá que sea la exportación del reloj.</p>
                  )}
                  <div className="row">
                    <span className="small muted">Establecimiento</span>
                    <select id={`pe-${it.id}`} className="input" value={it.estId} onChange={(e) => setPending((p) => p.map((x) => (x.id === it.id ? { ...x, estId: e.target.value } : x)))}>
                      <option value="">Nuevo establecimiento…</option>
                      {ests.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    {!it.estId && (
                      <input id={`pn-${it.id}`} className="input" placeholder="Nombre del establecimiento" value={it.newName} onChange={(e) => setPending((p) => p.map((x) => (x.id === it.id ? { ...x, newName: e.target.value } : x)))} />
                    )}
                    <span className="spacer" />
                    <button className="btn ghost" onClick={() => setPending((p) => p.filter((x) => x.id !== it.id))}>Descartar</button>
                    <button className="btn primary" disabled={!summary.count} onClick={() => doImport(it)}>Importar</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="stack">
        {ests.map((e) => {
          const files = state.files.filter((f) => f.estId === e.id).sort((a, b) => (b.to || '').localeCompare(a.to || ''));
          const legajos = new Set(state.punches.filter((p) => p.e === e.id).map((p) => p.l)).size;
          return (
            <div key={e.id} className="panel">
              <div className="panel-head">
                <input id={`en-${e.id}`} className="input" style={{ fontWeight: 600, flex: '1 1 220px' }} value={e.name} onChange={(ev) => renameEstablishment(e.id, ev.target.value)} aria-label="Nombre del establecimiento" />
                <span className="muted small">{legajos} legajos · {e.format}{e.device ? ` · equipo ${e.device}` : ''}</span>
              </div>
              <div className="list">
                {files.map((f) => (
                  <div key={f.id} className="row">
                    <span className="mono">{f.name}</span>
                    <span className="muted small">{f.from ? `${fmtDate(f.from)} → ${fmtDate(f.to)}` : ''} · {f.count} nuevas{f.total && f.total !== f.count ? ` de ${f.total}` : ''}</span>
                    <span className="spacer" />
                    <span className="muted small">cargado {new Date(f.loadedAt).toLocaleDateString('es-AR')}</span>
                    <ConfirmButton confirmLabel="Eliminar fichadas de este archivo" onConfirm={() => removeFile(f.id)}>Eliminar</ConfirmButton>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
