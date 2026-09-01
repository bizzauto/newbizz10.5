import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast';
import { aiKeysAPI } from '../lib/api';
import { Loader2, Plus, Trash2, Power, FlaskConical, KeyRound, ShieldCheck, AlertTriangle } from 'lucide-react';

/**
 * BYOK panel: customers add their OWN AI provider keys (Groq / OpenRouter /
 * Nvidia / OpenAI / custom OpenAI-compatible). Keys with lower priority number
 * are tried first. Full keys are never shown — masked (••••last4) only.
 */

interface AiKey {
  id: string;
  provider: string;
  label: string;
  keyMasked: string;
  keyLast4: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
  priority: number;
  isActive: boolean;
  lastUsedAt?: string | null;
  lastError?: string | null;
  failCount: number;
  totalRequests: number;
}

interface ProviderMeta {
  name: string;
  defaultModel: string;
  keyHint: string;
  requiresBaseUrl: boolean;
}

const PROVIDER_EMOJI: Record<string, string> = {
  groq: '⚡',
  openrouter: '🛣️',
  nvidia: '🎮',
  openai: '🤖',
  custom: '🛠️',
};

export default function AiKeysPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<AiKey[]>([]);
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState({
    provider: 'groq',
    key: '',
    label: '',
    baseUrl: '',
    defaultModel: '',
  });

  const load = useCallback(async () => {
    try {
      const [keysRes, provRes] = await Promise.all([aiKeysAPI.list(), aiKeysAPI.listProviders()]);
      if (keysRes.data?.success) setKeys(keysRes.data.data.keys || []);
      if (provRes.data?.success) setProviders(provRes.data.data || []);
    } catch {
      toast.error('Failed to load AI keys');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProvider = providers.find((p) => p.name === form.provider);

  const handleAdd = async () => {
    if (!form.key.trim()) {
      toast.error('API key is required');
      return;
    }
    setAdding(true);
    try {
      const res = await aiKeysAPI.add({
        provider: form.provider,
        key: form.key.trim(),
        label: form.label.trim() || undefined,
        baseUrl: form.baseUrl.trim() || undefined,
        defaultModel: form.defaultModel.trim() || undefined,
      });
      if (res.data?.success) {
        toast.success(`${form.provider} key added successfully`);
        setForm({ provider: 'groq', key: '', label: '', baseUrl: '', defaultModel: '' });
        setShowForm(false);
        load();
      } else {
        toast.error(res.data?.error || 'Failed to add key');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to add key');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (key: AiKey) => {
    try {
      const res = await aiKeysAPI.update(key.id, { isActive: !key.isActive });
      if (res.data?.success) {
        setKeys((prev) => prev.map((k) => (k.id === key.id ? { ...k, isActive: !k.isActive } : k)));
        toast.success(key.isActive ? 'Key deactivated' : 'Key activated');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to update key');
    }
  };

  const handleDelete = async (key: AiKey) => {
    if (!window.confirm(`Remove "${key.label}" (${key.provider})? This cannot be undone.`)) return;
    try {
      const res = await aiKeysAPI.remove(key.id);
      if (res.data?.success) {
        setKeys((prev) => prev.filter((k) => k.id !== key.id));
        toast.success('Key removed');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to remove key');
    }
  };

  const handleTest = async (key: AiKey) => {
    setTestingId(key.id);
    try {
      const res = await aiKeysAPI.test(key.id);
      if (res.data?.success && res.data?.data?.tested) {
        toast.success(`${key.provider} key works! (${res.data.data.latencyMs}ms via ${res.data.data.model})`);
      } else if (res.data?.data?.note) {
        toast.info(res.data.data.note);
      } else {
        toast.error(res.data?.error || 'Key test failed');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Key test failed');
    } finally {
      setTestingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={24} />
      </div>
    );
  }

  return (
    <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-5 md:p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        <KeyRound className="text-blue-600" size={20} />
        AI Keys (Bring Your Own)
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
        Add your own free/paid AI provider keys. Your keys are used first, and AI usage with your
        keys doesn't consume platform credits.
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 flex items-start gap-1.5">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-green-600" />
        Keys are encrypted (AES-256-GCM) and never displayed again — only the last 4 characters are shown.
      </p>

      {/* Key list */}
      {keys.length === 0 ? (
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No AI keys added yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Add Your First Key
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <div
              key={key.id}
              className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border transition-all ${
                key.isActive
                  ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                  : 'bg-gray-100/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl">{PROVIDER_EMOJI[key.provider] || '🔑'}</span>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {key.label}
                    <span className="ml-2 text-xs font-mono text-gray-400">{key.keyMasked}</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {key.provider} · {key.defaultModel || 'default model'} · priority {key.priority} · {key.totalRequests} calls
                  </p>
                  {key.lastError && (
                    <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1 mt-0.5">
                      <AlertTriangle size={11} /> {key.lastError.slice(0, 80)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleTest(key)}
                  disabled={testingId === key.id}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                  title="Send a tiny test request"
                >
                  {testingId === key.id ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                  Test
                </button>
                <button
                  onClick={() => handleToggle(key)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    key.isActive
                      ? 'text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title={key.isActive ? 'Deactivate (kept, just skipped)' : 'Activate'}
                >
                  <Power size={12} />
                  {key.isActive ? 'Active' : 'Off'}
                </button>
                <button
                  onClick={() => handleDelete(key)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Delete key"
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            <Plus size={16} /> {showForm ? 'Cancel' : 'Add Another Key'}
          </button>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Provider</label>
              <select
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value, key: '' })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {providers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name.toUpperCase()} {PROVIDER_EMOJI[p.name] || ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Label <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. My Groq free key"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                autoComplete="off"
                className="w-full px-4 py-2.5 pr-16 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder={selectedProvider?.keyHint || 'Paste your API key'}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            {selectedProvider?.keyHint && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                Get it from: {selectedProvider.keyHint}
              </p>
            )}
          </div>

          {selectedProvider?.requiresBaseUrl && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Base URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="http://localhost:11434/v1"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Model <span className="text-gray-400 font-normal">(optional — default: {selectedProvider?.defaultModel || 'auto'})</span>
            </label>
            <input
              type="text"
              value={form.defaultModel}
              onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              placeholder={selectedProvider?.defaultModel || 'e.g. openai/gpt-oss-120b'}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleAdd}
              disabled={adding || !form.key.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 font-semibold text-sm"
            >
              {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {adding ? 'Adding...' : 'Add Key'}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setForm({ provider: 'groq', key: '', label: '', baseUrl: '', defaultModel: '' });
              }}
              className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium"
            >
              Cancel
            </button>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-start gap-2">
            <span className="text-lg leading-none mt-0.5">💡</span>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <strong>Tip:</strong> Free keys work, but have rate limits and queues. A
              <strong> paid key</strong> (or higher free tier) gives noticeably better performance —
              faster responses, higher limits, and better model quality. You can also add multiple
              keys (e.g., Groq + OpenRouter + NVIDIA); we automatically fall back to the next key if one hits its limit.
            </p>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            By adding a key you confirm it belongs to you or your organization, and you agree to use it in
            compliance with the provider's Terms of Service and our{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Terms of Service</a> and{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Privacy Policy</a>.
            The key is encrypted at rest (AES-256-GCM), used only for your own AI requests, and can be removed anytime.
          </p>
        </div>
      )}
    </div>
  );
}
