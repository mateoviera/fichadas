import { useEffect, useState } from 'react';
import { ToastProvider } from './components/ui.jsx';
import { useStore } from './lib/store.js';
import Reporte from './views/Reporte.jsx';
import Personal from './views/Personal.jsx';
import Horarios from './views/Horarios.jsx';
import Archivos from './views/Archivos.jsx';
import Ajustes from './views/Ajustes.jsx';

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
  const hasData = useStore((s) => s.punches.length > 0);
  const tab = useHash(hasData);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <ToastProvider>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-mark">F</span>Control de Fichadas</div>
          <nav className="nav" aria-label="Secciones">
            {TABS.map(([k, label]) => (
              <a key={k} href={`#${k}`} aria-current={tab === k ? 'page' : undefined}>{label}</a>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {tab === 'fichadas' && <Reporte />}
        {tab === 'personal' && <Personal />}
        {tab === 'horarios' && <Horarios />}
        {tab === 'archivos' && <Archivos/>}
        {tab === 'ajustes' && <Ajustes />}
      </main>
    </ToastProvider>
  );
}
