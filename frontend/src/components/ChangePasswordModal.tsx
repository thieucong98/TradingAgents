import React, { useState } from 'react';
import { X, Lock, KeyRound, ShieldAlert, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ChangePasswordModalProps {
  mustChange?: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  mustChange = false,
  onClose,
}) => {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute password strength
  const getStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 2) return { score: 1, label: 'Weak', color: 'bg-brand-rose' };
    if (score <= 4) return { score: 2, label: 'Medium', color: 'bg-amber-500' };
    return { score: 3, label: 'Strong', color: 'bg-brand-emerald' };
  };

  const strength = getStrength(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Please provide your current password.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const ok = await changePassword(currentPassword, newPassword);
      if (ok) {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md animate-fadeIn font-sans">
      <div
        className="relative w-full max-w-md bg-dark-900 border border-dark-700/80 rounded-2xl shadow-2xl p-6 overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-dark-800">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl border ${mustChange ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan'}`}>
              {mustChange ? <ShieldAlert className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 font-mono">
                {mustChange ? 'Set Initial Password' : 'Change Password'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {mustChange
                  ? 'Security requirement: update your default password'
                  : 'Update credentials for VPS access'}
              </p>
            </div>
          </div>

          {!mustChange && (
            <button
              onClick={onClose}
              disabled={loading}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Must-change banner */}
        {mustChange && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono leading-relaxed">
            <strong>Action Required:</strong> You are currently using the default administrator password. Please set a new private password before proceeding to use the platform.
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-brand-rose/15 border border-brand-rose/30 text-brand-rose text-xs font-mono flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">
              Current Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={loading}
                required
                placeholder="Enter current password"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-800 border border-dark-700 text-slate-100 text-xs placeholder-slate-500 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/40 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">
              New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <KeyRound className="w-3.5 h-3.5" />
              </div>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                required
                placeholder="Minimum 6 characters"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-800 border border-dark-700 text-slate-100 text-xs placeholder-slate-500 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/40 font-mono"
              />
            </div>

            {/* Strength Meter */}
            {newPassword.length > 0 && (
              <div className="mt-1.5 flex items-center space-x-2">
                <div className="flex-1 h-1.5 bg-dark-750 rounded-full overflow-hidden flex space-x-1">
                  <div className={`h-full flex-1 ${strength.score >= 1 ? strength.color : 'bg-transparent'}`} />
                  <div className={`h-full flex-1 ${strength.score >= 2 ? strength.color : 'bg-transparent'}`} />
                  <div className={`h-full flex-1 ${strength.score >= 3 ? strength.color : 'bg-transparent'}`} />
                </div>
                <span className="text-[10px] font-mono text-slate-400">{strength.label}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <KeyRound className="w-3.5 h-3.5" />
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
                placeholder="Re-enter new password"
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-dark-800 border border-dark-700 text-slate-100 text-xs placeholder-slate-500 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/40 font-mono"
              />
              {confirmPassword.length > 0 && (
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                  {passwordsMatch ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-brand-rose" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end space-x-2">
            {!mustChange && (
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-3 py-1.5 rounded-xl text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-dark-800 border border-transparent transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading || (confirmPassword.length > 0 && !passwordsMatch)}
              className="px-4 py-2 rounded-xl text-xs font-mono font-semibold bg-brand-cyan hover:bg-cyan-400 text-slate-950 transition-all flex items-center space-x-1.5 shadow-md shadow-brand-cyan/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save New Password</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
