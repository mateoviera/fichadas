import { useEffect, useState, useSyncExternalStore } from 'react';
import { ToastProvider } from './components/ui.jsx';
import { CLOUD, loadFromCloud, setActor, useStore } from './lib/store.js';
import { dueCount } from './lib/tasks.js';
import { todayKey } from './lib/time.js';
import { supabase, getSyncStatus, subscribeSync } from './lib/remote.js';
import Reporte from './views/Reporte.jsx';
import Personal from './views/Personal.jsx';
import Solicitudes from './views/Solicitudes.jsx';
import Tareas from './views/Tareas.jsx';
import Inicio from './views/Inicio.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import { Icon } from './components/Icon.jsx';
import Horarios from './views/Horarios.jsx';
import Archivos from './views/Archivos.jsx';
import Ajustes from './views/Ajustes.jsx';
import Login from './views/Login.jsx';

// Menú lateral: secciones principales y, abajo, la configuración.
const NAV = [
  ['inicio', 'Inicio', 'home'],
  ['personal', 'Personal', 'users'],
  ['fichadas', 'Fichadas', 'clock'],
  ['solicitudes', 'Vacaciones', 'calendar'],
  ['tareas', 'Tareas', 'check'],
];
const CONFIG = [
  ['horarios', 'Horarios', 'sliders'],
  ['archivos', 'Archivos del reloj', 'file'],
  ['ajustes', 'Ajustes', 'gear'],
];
const ALL = [...NAV, ...CONFIG];

function useHash() {
  const read = () => {
    const h = location.hash.replace('#', '');
    return ALL.some(([k]) => k === h) ? h : 'inicio';
  };
  const [tab, setTab] = useState(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  });
  return tab;
}

export default function App() {
  return <ToastProvider>{CLOUD ? <CloudGate /> : <Main />}</ToastProvider>;
}

/** Modo nube: pide login, carga los datos de Supabase y recién ahí muestra la app. */
function CloudGate() {
  const [session, setSession] = useState(undefined); // undefined = averiguando
  const [phase, setPhase] = useState('idle'); // idle | loading | ready | error
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) { setPhase('idle'); return; }
    let alive = true;
    setPhase('loading');
    loadFromCloud()
      .then(() => alive && setPhase('ready'))
      .catch((e) => { if (alive) { setErr(e.message); setPhase('error'); } });
    return () => { alive = false; };
  }, [userId]);

  if (session === undefined) return <Splash text="Cargando…" />;
  if (!session) return <Login />;
  if (phase === 'error') {
    return (
      <Splash text="No se pudieron cargar los datos.">
        <p className="notice warn">{err}</p>
        <div className="row">
          <button className="btn primary" onClick={() => location.reload()}>Reintentar</button>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </Splash>
    );
  }
  if (phase !== 'ready') return <Splash text="Cargando..." />;
  return <Main user={session.user} />;
}

function Splash({ text, children }) {
  return (
    <div className="login-wrap">
      <div className="panel panel-pad login stack">
        <div className="brand"><span className="brand-mark">GP</span>Gestión de Personal</div>
        <p className="muted">{text}</p>
        {children}
      </div>
    </div>
  );
}

function Main({ user }) {
  const tab = useHash();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  if (user) setActor(user.email);
  useEffect(() => {
    // Ctrl+K (o Cmd+K en Mac) abre el buscador desde cualquier pantalla.
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(false); setPalette((v) => !v); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const today = todayKey();
  const due = useStore((s) => dueCount(s.tasks, today));
  const pendingReq = useStore((s) => s.leaves.filter((l) => l.status === 'pendiente').length);
  useEffect(() => {
    window.scrollTo(0, 0);
    setOpen(false);
  }, [tab]);
  const badge = { tareas: due ? [due, 'alert', 'Tareas vencidas o para hoy'] : null, solicitudes: pendingReq ? [pendingReq, '', 'Solicitudes pendientes'] : null };
  const current = ALL.find(([k]) => k === tab);
  const link = ([k, label, icon]) => (
    <a key={k} href={`#${k}`} className="side-link" aria-current={tab === k ? 'page' : undefined}>
      <Icon name={icon} />
      <span className="side-label">{label}</span>
      {badge[k] && <span className={`count ${badge[k][1]}`} title={badge[k][2]}>{badge[k][0]}</span>}
    </a>
  );

  return (
    <div className="shell">
      <header className="mobilebar no-print">
        <button className="btn ghost icon-btn" onClick={() => setOpen(true)} aria-label="Abrir menú"><Icon name="menu" size={20} /></button>
        <b>{current?.[1]}</b>
        <button className="btn ghost icon-btn" onClick={() => setPalette(true)} aria-label="Buscar"><Icon name="search" size={19} /></button>
        {due > 0 && <a href="#tareas" className="count alert" title="Tareas vencidas o para hoy">{due}</a>}
      </header>
      {open && <div className="scrim side-scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar no-print ${open ? 'open' : ''}`} aria-label="Menú">
        <div className="brand"><span className="brand-mark">GP</span>Gestión de Personal</div>
        <button type="button" className="side-search" onClick={() => { setOpen(false); setPalette(true); }}>
          <Icon name="search" size={16} />
          <span>Buscar…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <nav className="side-nav" aria-label="Secciones">
          {NAV.map(link)}
          <div className="side-group">Configuración</div>
          {CONFIG.map(link)}
        </nav>
        {user && <UserBox user={user} />}
      </aside>
      <div className="content">
        <SyncError />
        <main key={tab}>
          {tab === 'inicio' && <Inicio />}
          {tab === 'personal' && <Personal />}
          {tab === 'fichadas' && <Reporte />}
          {tab === 'solicitudes' && <Solicitudes />}
          {tab === 'tareas' && <Tareas />}
          {tab === 'horarios' && <Horarios />}
          {tab === 'archivos' && <Archivos />}
          {tab === 'ajustes' && <Ajustes />}
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} sections={ALL} />
    </div>
  );
}

function useSync() {
  return useSyncExternalStore(subscribeSync, getSyncStatus);
}

function UserBox({ user }) {
  const { pending } = useSync();
  return (
    <div className="userbox no-print">
      <span className="userbox-mail muted small" title={user.email}>{user.email}</span>
      <span className={`sync ${pending ? 'busy' : ''}`} title={pending ? 'Guardando cambios en la base…' : 'Todo guardado'}>
        {pending ? `Guardando… (${pending})` : 'Guardado'}
      </span>
      <button
        className="btn sm ghost"
        onClick={() => {
          if (pending && !confirm('Todavía hay cambios guardándose. ¿Salir igual?')) return;
          supabase.auth.signOut();
        }}
      >Salir</button>
    </div>
  );
}

function SyncError() {
  const { error } = useSync();
  if (!CLOUD || !error) return null;
  return <div className="notice warn sync-error no-print">{error}</div>;
}
