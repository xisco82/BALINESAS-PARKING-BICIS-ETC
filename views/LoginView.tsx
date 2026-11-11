
import React, { useState } from 'react';
import { ConciergeBell } from 'lucide-react';

type UserRole = 'editor' | 'balinese_editor';

interface LoginViewProps {
  onLoginSuccess: (role: UserRole) => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Editor Completo
    if (username === 'HM' && password === 'HMGF25') {
      onLoginSuccess('editor');
    // Editor de Balinesas
    } else if (username === 'HM' && password === 'GF25') {
      onLoginSuccess('balinese_editor');
    } else {
      setError('Usuario o contraseña incorrectos.');
      setPassword('');
    }
  };

  const inputClass = "w-full rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 px-3 py-2.5 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30 outline-none transition-colors";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-[#0284c7] text-white flex items-center justify-center shadow-sm" aria-hidden="true">
            <ConciergeBell className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-tight text-slate-900 dark:text-white">Eventos, Parking, Bicis y Balinesas</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Recepción</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6 sm:p-8 animate-fade-in">
          <h2 className="font-display text-center text-2xl font-bold text-slate-900 dark:text-white mb-6">Acceso Recepción</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Usuario"
                aria-label="Usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
                required
                autoFocus
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Contraseña"
                aria-label="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            {error && <p className="rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 text-sm text-center px-3 py-2">{error}</p>}
            <div>
              <button
                type="submit"
                className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl px-4 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                Entrar
              </button>
            </div>
          </form>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">Eventos, Parking, Bicis y Balinesas · Xisco Solutions</p>
      </div>
    </div>
  );
};

export default LoginView;