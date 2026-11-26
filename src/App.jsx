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

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.6a3.5 3.5 0 0 1 0 6.8',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1M4 10h16M8 3v4M16 3v4',
  check: 'M9 11.5l2.5 2.5L16 9.5M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7zM14 3v4h4M9 13h6M9 17h6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
  menu: 'M4 7h16M4 12h16M4 17h16',
};
export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
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
  if (user) setActor(user.email);
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
        {due > 0 && <a href="#tareas" className="count alert" title="Tareas vencidas o para hoy">{due}</a>}
      </header>
      {open && <div className="scrim side-scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar no-print ${open ? 'open' : ''}`} aria-label="Menú">
        <div className="brand"><span className="brand-mark">GP</span>Gestión de Personal</div>
        <nav className="side-nav" aria-label="Secciones">
          {NAV.map(link)}
          <div className="side-group">Configuración</div>
          {CONFIG.map(link)}
        </nav>
        {user && <UserBox user={user} />}
      </aside>
      <div className="content">
        <SyncError />
        <main>
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
