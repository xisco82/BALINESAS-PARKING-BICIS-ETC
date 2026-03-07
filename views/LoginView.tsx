
import React, { useState } from 'react';

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

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center p-4">
      <div className="w-full max-w-sm mx-auto bg-black/20 backdrop-blur-lg rounded-2xl shadow-2xl p-8 transition-all duration-300 animate-fade-in">
        <h2 className="text-center text-2xl font-bold text-white mb-6">Acceso Recepción</h2>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <input
              type="text"
              placeholder="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 bg-white/10 text-white placeholder-gray-300 rounded-lg border-2 border-transparent focus:border-blue-400 focus:outline-none transition-colors"
              required
              autoFocus
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 bg-white/10 text-white placeholder-gray-300 rounded-lg border-2 border-transparent focus:border-blue-400 focus:outline-none transition-colors"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <div>
            <button
              type="submit"
              className="w-full bg-blue-600/80 text-white p-3 rounded-lg font-semibold hover:bg-blue-700/90 transition-colors"
            >
              Entrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginView;