import React, { useState } from 'react';
import { ShieldCheck, Lock, User, Eye, EyeOff, LogIn, Loader2, AlertTriangle, Key } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDefaultHint, setShowDefaultHint] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-dark-950 p-4 relative overflow-hidden selection:bg-brand-cyan/30 selection:text-brand-cyan font-sans">
      {/* Background ambient lighting effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-cyan/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-brand-emerald/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-md bg-dark-900/90 backdrop-blur-2xl border border-dark-700/80 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] rounded-3xl p-8 transition-all">
        {/* Terminal Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-dark-800 border border-brand-cyan/30 text-brand-cyan shadow-[0_0_25px_rgba(6,182,212,0.25)] mb-4 animate-pulse">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black tracking-wider text-slate-100 flex items-center justify-center space-x-1">
            <span>TRADING</span>
            <span className="text-brand-cyan">AGENTS</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/40 ml-1.5 font-mono">
              PRO
            </span>
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-1.5">
            Multi-Agent Financial Intelligence Platform
          </p>

          <div className="mt-3 inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-dark-800/80 border border-dark-700 text-[11px] font-mono text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-emerald animate-ping" />
            <span>SECURE VPS GATEWAY</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-3.5 rounded-xl bg-brand-rose/15 border border-brand-rose/40 text-brand-rose text-xs font-mono flex items-start space-x-2.5 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-medium text-slate-300 mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
                autoFocus
                placeholder="Enter username"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-800/90 border border-dark-700 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/50 transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                placeholder="Enter password"
                className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-dark-800/90 border border-dark-700 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/50 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-xl font-mono text-sm font-semibold tracking-wide bg-gradient-to-r from-brand-cyan to-cyan-500 hover:from-cyan-400 hover:to-brand-cyan text-slate-950 shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Authenticate &amp; Access Terminal</span>
              </>
            )}
          </button>
        </form>

        {/* First time setup hint toggle */}
        <div className="mt-6 pt-5 border-t border-dark-800 text-center">
          <button
            type="button"
            onClick={() => setShowDefaultHint(!showDefaultHint)}
            className="text-[11px] font-mono text-slate-500 hover:text-brand-cyan transition-colors inline-flex items-center space-x-1"
          >
            <Key className="w-3 h-3" />
            <span>{showDefaultHint ? 'Hide initial credentials' : 'First-time setup info?'}</span>
          </button>

          {showDefaultHint && (
            <div className="mt-2.5 p-3 rounded-xl bg-dark-800/60 border border-dark-700/60 text-[11px] font-mono text-slate-400 text-left leading-relaxed animate-fadeIn">
              Default administrator: <span className="text-slate-200 font-bold">admin</span> /{' '}
              <span className="text-slate-200 font-bold">TradingAgents@2024</span>.
              <div className="text-[10px] text-slate-500 mt-1">
                * You will be immediately prompted to set a new password upon first login.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
