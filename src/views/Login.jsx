import { useState } from 'react';
import { supabase } from '../lib/remote.js';

/** Inicio de sesión (solo en modo nube). Los usuarios se crean desde el panel de Supabase. */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ error: { message: 'timeout' } }), 15000));
    const { error } = await Promise.race([supabase.auth.signInWithPassword({ email: email.trim(), password }), timeout]);
    setBusy(false);
    if (!error) return;
    if (error.message === 'Invalid login credentials') setErr('Email o contraseña incorrectos.');
    else if (error.message === 'timeout' || /fetch/i.test(error.message)) setErr('No se pudo conectar con el servidor. Revisá la conexión (o que la PC del sistema esté encendida) y probá de nuevo.');
    else setErr(error.message);
  };

  return (
    <div className="login-wrap">
      <form className="panel panel-pad login stack" onSubmit={submit}>
        <div className="brand"><span className="brand-mark">GP</span>Gestión de Personal</div>
        <p className="muted small">Ingresá con tu usuario. Si no tenés uno, pedíselo a quien administra el sistema.</p>
        <label className="field"><span>Email</span><input id="login-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Contraseña</span><input id="login-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <p className="notice warn">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}
