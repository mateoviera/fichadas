import { useEffect, useState, useSyncExternalStore } from 'react';
import { ToastProvider } from './components/ui.jsx';
import { useStore, CLOUD, loadFromCloud } from './lib/store.js';
import { supabase, getSyncStatus, subscribeSync } from './lib/remote.js';
import Reporte from './views/Reporte.jsx';
import Personal from './views/Personal.jsx';
import Horarios from './views/Horarios.jsx';
import Archivos from './views/Archivos.jsx';
import Ajustes from './views/Ajustes.jsx';
import Login from './views/Login.jsx';

const TABS = [
  ['fichadas', 'Fichadas'],
  ['personal', 'Personal'],
  ['horarios', 'Horarios'],
  ['archivos', 'Archivos'],
  ['ajustes', 'Ajustes'],
];

function useHash(hasData) {
  const read = () => {
    const h = location.hash.replace('#', '');
    return TABS.some(([k]) => k === h) ? h : hasData ? 'fichadas' : 'archivos';
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
  if (phase !== 'ready') return <Splash text="Cargando fichadas…" />;
  return <Main user={session.user} />;
}

function Splash({ text, children }) {
  return (
    <div className="login-wrap">
      <div className="panel panel-pad login stack">
        <div className="brand"><span className="brand-mark">F</span>Control de Fichadas</div>
        <p className="muted">{text}</p>
        {children}
      </div>
    </div>
  );
}

function Main({ user }) {
  const hasData = useStore((s) => s.punches.length > 0);
  const tab = useHash(hasData);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-mark">F</span>Control de Fichadas</div>
          <nav className="nav" aria-label="Secciones">
            {TABS.map(([k, label]) => (
              <a key={k} href={`#${k}`} aria-current={tab === k ? 'page' : undefined}>{label}</a>
            ))}
          </nav>
          {user && <UserBox user={user} />}
        </div>
      </header>
      <SyncError />
      <main>
        {tab === 'fichadas' && <Reporte />}
        {tab === 'personal' && <Personal />}
        {tab === 'horarios' && <Horarios />}
        {tab === 'archivos' && <Archivos/>}
        {tab === 'ajustes' && <Ajustes />}
      </main>
    </>
  );
}

function useSync() {
  return useSyncExternalStore(subscribeSync, getSyncStatus);
}

function UserBox({ user }) {
  const { pending } = useSync();
  return (
    <div className="userbox no-print">
      <span className={`sync ${pending ? 'busy' : ''}`} title={pending ? 'Guardando cambios en la base…' : 'Todo guardado'}>
        {pending ? `Guardando… (${pending})` : 'Guardado'}
      </span>
      <span className="muted small">{user.email}</span>
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
