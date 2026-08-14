import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { createAgentAccessKey, fetchAgentAccessKeys, revokeAgentAccessKey } from '../lib/api';
import type { AgentAccessKey } from '../types';

type SettingsPageProps = {
  token?: string | null;
  demoMode?: boolean;
};

function displayDate(value?: string | null) {
  if (!value) return 'Never used';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function isActiveKey(key: AgentAccessKey) {
  return !key.revoked_at && new Date(key.expires_at).getTime() > Date.now();
}

export function SettingsPage({ token, demoMode = false }: SettingsPageProps) {
  const [keys, setKeys] = useState<AgentAccessKey[]>([]);
  const [name, setName] = useState('Arena Strategist');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<'load' | 'create' | string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const canManage = Boolean(token && token !== 'mock-token' && !demoMode);

  const loadKeys = async () => {
    if (!canManage) return;
    setBusy('load');
    setError('');
    try {
      setKeys(await fetchAgentAccessKeys(token));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Agent keys.');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadKeys();
  }, [canManage, token]);

  const handleCreate = async () => {
    if (!canManage) return;
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Name this Agent key before creating it.');
      return;
    }
    setBusy('create');
    setError('');
    setMessage('');
    setCopied(false);
    try {
      const result = await createAgentAccessKey(cleanName, token);
      setKeys((current) => [result.key, ...current]);
      setRevealedKey(result.secret);
      setMessage('Copy this key now. It cannot be revealed again.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create Agent key.');
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setMessage('Agent key copied. Store it in the Agent environment, never in a prompt.');
    } catch {
      setError('Clipboard access was blocked. Select and copy the key manually.');
    }
  };

  const handleRevoke = async (key: AgentAccessKey) => {
    if (!canManage || !isActiveKey(key)) return;
    setBusy(key.id);
    setError('');
    setMessage('');
    try {
      const revoked = await revokeAgentAccessKey(key.id, token);
      setKeys((current) => current.map((item) => item.id === revoked.id ? revoked : item));
      setMessage(`${revoked.name} was revoked immediately.`);
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Failed to revoke Agent key.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8 2xl:px-8">
      <header className="border-b border-white/8 pb-7">
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#b49664]">Account</div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-light uppercase tracking-[0.13em] text-stone-100">Settings</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">Manage the credentials that let your Agents observe and operate your Arena account.</p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => void loadKeys()}
              disabled={busy !== null}
              className="inline-flex h-10 items-center gap-2 border border-white/10 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400 transition hover:border-stone-500 hover:text-stone-100 disabled:opacity-40"
            >
              <RefreshCw size={14} className={busy === 'load' ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}
        </div>
      </header>

      <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-white/8 bg-black/20 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center border border-[#b49664]/30 bg-[#b49664]/10 text-[#d6b778]"><KeyRound size={18} /></div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#d6b778]">Agent Access</div>
              <h2 className="mt-2 font-display text-2xl font-light uppercase tracking-[0.1em] text-stone-100">Create key</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">Each key is scoped to roster reading, Arena queueing, and battle control. It cannot access payments, market trades, or account security.</p>
            </div>
          </div>

          {demoMode ? (
            <div className="mt-6 border border-[#b49664]/20 bg-[#b49664]/[0.05] px-4 py-4 text-sm leading-6 text-stone-400">Agent keys are unavailable in simulation mode. Set <code className="text-[#e4c889]">VITE_APP_MODE=live</code> to manage live credentials.</div>
          ) : (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="agent-key-name">Agent key name</label>
              <input
                id="agent-key-name"
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                className="h-12 min-w-0 flex-1 border border-white/10 bg-black/50 px-4 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-[#b49664]/60"
                placeholder="Arena Strategist"
              />
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!canManage || busy !== null}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-[#9a7338] px-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-100 transition hover:bg-[#b18647] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy === 'create' ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
                Create key
              </button>
            </div>
          )}

          {revealedKey && (
            <div className="mt-5 border border-[#b49664]/35 bg-[#b49664]/[0.06] p-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e4c889]"><ShieldCheck size={14} /> Reveal once</div>
              <div className="mt-3 flex gap-3">
                <input readOnly value={revealedKey} className="h-11 min-w-0 flex-1 border border-white/10 bg-black/60 px-3 font-mono text-xs text-stone-200 outline-none" aria-label="New Agent key" />
                <button type="button" onClick={() => void handleCopy()} className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-white/10 text-stone-300 transition hover:border-[#b49664]/60 hover:text-[#e4c889]" aria-label="Copy Agent key">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          )}

          {(error || message) && <div className={`mt-5 border px-4 py-3 text-sm ${error ? 'border-red-400/25 bg-red-950/20 text-red-200' : 'border-emerald-400/20 bg-emerald-950/20 text-emerald-200'}`}>{error || message}</div>}
        </div>

        <aside className="border border-white/8 bg-black/20 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#b49664]">Agent contract</div>
          <div className="mt-5 space-y-4 text-sm leading-6 text-stone-500">
            <p>Give the Agent the key through an environment variable, not a chat message.</p>
            <code className="block border border-white/8 bg-black/50 px-3 py-3 text-xs text-stone-300">HERO_FORGE_AGENT_KEY=hf_agent_...</code>
            <p>The Agent and your browser observe the same live battle session. Revoking a key prevents its next request immediately.</p>
          </div>
        </aside>
      </section>

      <section className="mt-6 border border-white/8 bg-black/20">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 px-6 py-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#b49664]">Issued keys</div>
            <div className="mt-1 text-xs text-stone-500">Active keys expire after 90 days. Revoked keys remain visible for audit.</div>
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-stone-600">{keys.filter(isActiveKey).length} active</span>
        </div>
        {!canManage ? (
          <div className="px-6 py-12 text-center text-sm text-stone-500">Sign in with a live account to manage Agent keys.</div>
        ) : busy === 'load' && keys.length === 0 ? (
          <div className="flex items-center justify-center gap-3 px-6 py-12 text-sm text-stone-500"><LoaderCircle size={16} className="animate-spin" />Loading keys</div>
        ) : keys.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-stone-500">No Agent keys issued.</div>
        ) : (
          <div className="divide-y divide-white/8">
            {keys.map((key) => {
              const active = isActiveKey(key);
              return (
                <div key={key.id} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-display text-lg tracking-[0.08em] text-stone-100">{key.name}</span>
                      <span className={`text-[9px] font-semibold uppercase tracking-[0.18em] ${active ? 'text-emerald-300' : 'text-stone-600'}`}>{active ? 'Active' : key.revoked_at ? 'Revoked' : 'Expired'}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-stone-600">
                      <span className="font-mono text-stone-500">{key.key_prefix}...</span>
                      <span>Last use {displayDate(key.last_used_at)}</span>
                      <span>Expires {displayDate(key.expires_at)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(key)}
                    disabled={!active || busy !== null}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 border border-red-400/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-200 transition hover:border-red-300/50 hover:bg-red-950/25 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {busy === key.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
