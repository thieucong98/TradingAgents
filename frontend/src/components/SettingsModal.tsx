import React, { useState, useEffect } from 'react';
import { 
  X, 
  Key, 
  Database, 
  Volume2, 
  VolumeX, 
  Bell, 
  BellOff, 
  Eye, 
  EyeOff, 
  Check, 
  Save, 
  ShieldCheck, 
  AlertCircle,
  Cpu,
  LogOut,
  KeyRound,
  User,
  Zap,
  SlidersHorizontal
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { APIKeyInfo } from '../types';
import { 
  fetchApiKeys, 
  updateApiKeys, 
  fetchConcurrencyConfig, 
  updateConcurrencyConfig 
} from '../services/api';
import { 
  isSoundEnabled, 
  setSoundEnabled, 
  isNotificationsEnabled, 
  setNotificationsEnabled,
  playChime 
} from '../services/notification';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModalComponent: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, logout, openChangePasswordModal } = useAuth();
  const [activeTab, setActiveTab] = useState<'llm' | 'data' | 'preferences' | 'account'>('llm');
  const [keysList, setKeysList] = useState<APIKeyInfo[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preference states
  const [soundOn, setSoundOn] = useState(true);
  const [notifyOn, setNotifyOn] = useState(true);

  // Concurrency states
  const [concurrency, setConcurrency] = useState<number>(4);
  const [initialConcurrency, setInitialConcurrency] = useState<number>(4);
  const [activeRunningJobs, setActiveRunningJobs] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setSoundOn(isSoundEnabled());
      setNotifyOn(isNotificationsEnabled());
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [keysRes, concRes] = await Promise.all([
        fetchApiKeys().catch(() => ({ keys: [] })),
        fetchConcurrencyConfig().catch(() => ({ max_concurrent_jobs: 4, active_running_jobs: 0, recommended_min: 1, recommended_max: 16 })),
      ]);
      setKeysList(keysRes.keys || []);
      if (concRes) {
        setConcurrency(concRes.max_concurrent_jobs || 4);
        setInitialConcurrency(concRes.max_concurrent_jobs || 4);
        setActiveRunningJobs(concRes.active_running_jobs || 0);
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setErrorMsg('Failed to load configuration from server.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleInputChange = (provider: string, val: string) => {
    setInputValues((prev) => ({ ...prev, [provider]: val }));
    setSaveSuccess(false);
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // Save preferences
      setSoundEnabled(soundOn);
      setNotificationsEnabled(notifyOn);

      // Save concurrency if modified
      if (concurrency !== initialConcurrency) {
        const updatedConc = await updateConcurrencyConfig(concurrency);
        setConcurrency(updatedConc.max_concurrent_jobs);
        setInitialConcurrency(updatedConc.max_concurrent_jobs);
      }

      // Save keys if modified
      const keysToUpdate: Record<string, string> = {};
      Object.entries(inputValues).forEach(([prov, val]) => {
        if (val !== undefined && val !== null) {
          keysToUpdate[prov] = val;
        }
      });

      if (Object.keys(keysToUpdate).length > 0) {
        const updated = await updateApiKeys(keysToUpdate);
        setKeysList(updated.keys || []);
        setInputValues({});
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const testAudio = () => {
    playChime('success');
  };

  const llmKeys = keysList.filter((k) => k.category === 'llm');
  const dataKeys = keysList.filter((k) => k.category === 'data');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-dark-950/85">
      <div className="w-full max-w-2xl bg-dark-900 border border-dark-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-dark-700/80 flex items-center justify-between bg-dark-850/60 shrink-0">
          <div className="flex items-center space-x-2 sm:space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-dark-750 border border-dark-600 flex items-center justify-center text-brand-cyan shrink-0">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-100 font-mono tracking-wide">
                Terminal Settings & API Management
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-400 font-sans">
                Configure cloud intelligence providers, market data feeds, and local preferences
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-dark-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation (Horizontal scrollable) */}
        <div className="flex border-b border-dark-700/60 px-3 sm:px-6 bg-dark-850/30 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('llm')}
            className={`flex items-center space-x-2 py-2.5 sm:py-3 px-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'llm'
                ? 'border-brand-cyan text-brand-cyan'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>LLM Providers ({llmKeys.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('data')}
            className={`flex items-center space-x-2 py-2.5 sm:py-3 px-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'data'
                ? 'border-brand-emerald text-brand-emerald'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Data Feeds ({dataKeys.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('preferences')}
            className={`flex items-center space-x-2 py-2.5 sm:py-3 px-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'preferences'
                ? 'border-brand-amber text-brand-amber'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Concurrency & Alerts</span>
          </button>

          <button
            onClick={() => setActiveTab('account')}
            className={`flex items-center space-x-2 py-2.5 sm:py-3 px-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'account'
                ? 'border-brand-cyan text-brand-cyan'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Account & Security</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-brand-rose/10 border border-brand-rose/30 flex items-center space-x-2 text-xs text-brand-rose">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 rounded-lg bg-brand-emerald/10 border border-brand-emerald/30 flex items-center space-x-2 text-xs text-brand-emerald">
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span>Settings and API credentials updated successfully!</span>
            </div>
          )}

          {/* Account & Security Tab */}
          {activeTab === 'account' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-xl bg-dark-850/50 border border-dark-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-lg border bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">
                      Logged in as <span className="text-brand-cyan font-mono">{user?.username || 'admin'}</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Active VPS Session • Single-tenant Administrator
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      openChangePasswordModal();
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-750 text-slate-200 border border-dark-700 text-xs font-mono font-medium transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-brand-cyan" />
                    <span>Change Password</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      logout();
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-rose/15 hover:bg-brand-rose/25 text-brand-rose border border-brand-rose/40 text-xs font-mono font-medium transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-dark-900 border border-dark-700/60 text-xs font-mono text-slate-400 leading-relaxed space-y-1.5">
                <div className="font-bold text-slate-300">Security Architecture & Best Practices:</div>
                <div>• Passwords are cryptographically hashed using PBKDF2-HMAC-SHA256 (600,000 rounds).</div>
                <div>• Session tokens are stored as SHA-256 digests and transported via HttpOnly, SameSite=Lax cookies.</div>
                <div>• Public VPS access is protected by rate limiting and brute-force account lockout.</div>
              </div>
            </div>
          )}

          {/* LLM & Data Feeds View */}
          {(activeTab === 'llm' || activeTab === 'data') && (
            <div className="space-y-3.5">
              <div className="text-[11px] text-slate-400 bg-dark-850/60 p-3 rounded-lg border border-dark-700/60 flex items-start space-x-2">
                <ShieldCheck className="w-4 h-4 text-brand-emerald flex-shrink-0 mt-0.5" />
                <span>
                  Keys are held securely in your local backend process environment and are never transmitted to external analytics. Existing keys are masked.
                </span>
              </div>

              {(activeTab === 'llm' ? llmKeys : dataKeys).map((item) => {
                const isConfigured = item.configured;
                const isShowing = showKeys[item.provider];
                const curInput = inputValues[item.provider] ?? '';

                return (
                  <div
                    key={item.provider}
                    className="p-3.5 rounded-xl bg-dark-850/40 border border-dark-700/60 flex flex-col space-y-2 hover:border-dark-600 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold font-mono uppercase text-slate-100">
                          {item.provider}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 bg-dark-800 px-1.5 py-0.5 rounded border border-dark-700">
                          {item.env_var}
                        </span>
                      </div>

                      {isConfigured ? (
                        <span className="text-[10px] font-mono font-bold text-brand-emerald bg-brand-emerald/10 border border-brand-emerald/30 px-2 py-0.5 rounded flex items-center space-x-1">
                          <Check className="w-2.5 h-2.5" />
                          <span>Active ({item.preview})</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500 bg-dark-800 border border-dark-700 px-2 py-0.5 rounded">
                          Not Configured
                        </span>
                      )}
                    </div>

                    <div className="relative flex items-center">
                      <input
                        type={isShowing ? 'text' : 'password'}
                        placeholder={isConfigured ? 'Enter new key to replace existing...' : 'Paste API key here...'}
                        value={curInput}
                        onChange={(e) => handleInputChange(item.provider, e.target.value)}
                        className="w-full bg-dark-900 border border-dark-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-brand-cyan/60 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowKey(item.provider)}
                        className="absolute right-2.5 text-slate-500 hover:text-slate-300"
                        title={isShowing ? 'Hide' : 'Show'}
                      >
                        {isShowing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Preferences & Concurrency Tab */}
          {activeTab === 'preferences' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Concurrency & Multi-Worker Engine */}
              <div className="p-4 rounded-xl bg-dark-850/50 border border-dark-700/60 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-dark-750">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-lg border bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">Concurrent Analysis Workers</h4>
                      <p className="text-[11px] text-slate-400">Number of heavy agent research jobs allowed to run simultaneously</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 self-start sm:self-auto">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-dark-800 text-brand-cyan border border-brand-cyan/30">
                      {concurrency} Workers
                    </span>
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-slate-400 bg-dark-800 border border-dark-700">
                      <span className={`w-1.5 h-1.5 rounded-full ${activeRunningJobs > 0 ? 'bg-brand-emerald animate-pulse' : 'bg-slate-500'}`} />
                      <span>{activeRunningJobs} Active</span>
                    </span>
                  </div>
                </div>

                {/* Range Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>1 (Sequential)</span>
                    <span className="text-brand-cyan font-bold text-xs">{concurrency} Parallel Jobs</span>
                    <span>16 (Max Load)</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={16}
                    step={1}
                    value={concurrency}
                    onChange={(e) => {
                      setConcurrency(parseInt(e.target.value, 10));
                      setSaveSuccess(false);
                    }}
                    className="w-full h-2 bg-dark-750 rounded-lg appearance-none cursor-pointer accent-brand-cyan"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-slate-500 px-1">
                    <span>1</span>
                    <span>4 (Default)</span>
                    <span>8 (Standard VPS)</span>
                    <span>12</span>
                    <span>16</span>
                  </div>
                </div>

                {/* Hardware Recommendation Card based on value */}
                <div className={`p-3 rounded-lg border text-xs font-mono transition-all ${
                  concurrency <= 4
                    ? 'bg-dark-900 border-dark-700/60 text-slate-400'
                    : concurrency <= 8
                    ? 'bg-brand-cyan/5 border-brand-cyan/20 text-brand-cyan/90'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}>
                  <div className="flex items-start space-x-2">
                    <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">
                        {concurrency <= 4
                          ? 'Recommended for 2 Cores / 4GB RAM VPS'
                          : concurrency <= 8
                          ? 'Recommended for 4 Cores / 8GB RAM VPS'
                          : 'High Concurrency: Recommended for 8+ Cores / 16GB+ RAM VPS'}
                      </div>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        {concurrency > 8
                          ? 'Notice: Running > 8 jobs in parallel generates ~40-60 simultaneous LLM calls. Ensure your LLM provider plan has adequate TPM/RPM limits to avoid HTTP 429 throttling.'
                          : 'Workers run in non-blocking thread pool backed by SQLite WAL mode. Jobs exceeding capacity queue automatically.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sound Option */}
              <div className="p-4 rounded-xl bg-dark-850/40 border border-dark-700/60 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-lg border ${soundOn ? 'bg-brand-amber/10 border-brand-amber/30 text-brand-amber' : 'bg-dark-800 border-dark-700 text-slate-500'}`}>
                    {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">Quant Synthesizer Chime</h4>
                    <p className="text-[11px] text-slate-400">Play an harmonic audio alert when an analysis pipeline finishes</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {soundOn && (
                    <button
                      type="button"
                      onClick={testAudio}
                      className="px-2 py-1 rounded bg-dark-800 text-[11px] font-mono text-brand-amber border border-dark-700 hover:bg-dark-750"
                    >
                      Test Sound
                    </button>
                  )}
                  <input
                    type="checkbox"
                    checked={soundOn}
                    onChange={(e) => setSoundOn(e.target.checked)}
                    className="w-4 h-4 accent-brand-amber rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Desktop Notifications Option */}
              <div className="p-4 rounded-xl bg-dark-850/40 border border-dark-700/60 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-lg border ${notifyOn ? 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan' : 'bg-dark-800 border-dark-700 text-slate-500'}`}>
                    {notifyOn ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">Desktop Push Notifications</h4>
                    <p className="text-[11px] text-slate-400">Send system desktop notifications when tab is inactive</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notifyOn}
                  onChange={(e) => setNotifyOn(e.target.checked)}
                  className="w-4 h-4 accent-brand-cyan rounded cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-dark-700/80 bg-dark-850/80 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-dark-800 transition-colors"
          >
            Close
          </button>

          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-cyan to-brand-emerald text-dark-950 font-bold text-xs shadow-lg shadow-brand-cyan/20 hover:shadow-brand-cyan/30 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{loading ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const SettingsModal = React.memo(SettingsModalComponent);
