import React, { useEffect, useState } from 'react';
import { Check, Gift, Loader2 } from 'lucide-react';
import { claimDailySignIn, claimDailyTask, fetchDaily } from '../lib/api';
import type { DailySnapshot, EconomySnapshot } from '../types';

interface DailyActivityProps {
  token?: string | null;
  onEconomyChange?: (economy: EconomySnapshot) => void;
}

export const DailyActivity: React.FC<DailyActivityProps> = ({ token, onEconomyChange }) => {
  const [daily, setDaily] = useState<DailySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDaily = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchDaily(token);
      setDaily(next);
      onEconomyChange?.(next.economy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load daily activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDaily();
  }, [token]);

  const claimSignIn = async () => {
    if (!token || !daily || daily.checkin.claimed) return;
    setClaimingKey('sign-in');
    setError(null);
    try {
      const next = await claimDailySignIn(token);
      setDaily(next);
      onEconomyChange?.(next.economy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim sign-in');
    } finally {
      setClaimingKey(null);
    }
  };

  const claimTask = async (taskKey: string) => {
    if (!token) return;
    setClaimingKey(taskKey);
    setError(null);
    try {
      const next = await claimDailyTask(taskKey, token);
      setDaily(next);
      onEconomyChange?.(next.economy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim task');
    } finally {
      setClaimingKey(null);
    }
  };

  const renderActionLabel = (taskKey: string, claimed: boolean) => {
    if (claimingKey === taskKey) return <Loader2 size={12} className="animate-spin" />;
    if (claimed) return <Check size={12} />;
    return 'CLAIM';
  };

  return (
    <div className="mt-6 border-t border-stone-800 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] font-light uppercase tracking-[0.3em] text-stone-500">Daily Ritual</p>
        <span className="text-[10px] uppercase tracking-[0.2em] text-gold-matte/70">{daily?.date ?? 'SYNC'}</span>
      </div>

      <button
        onClick={claimSignIn}
        disabled={!daily || daily.checkin.claimed || loading || claimingKey !== null}
        className={`mb-3 flex w-full items-center justify-between border px-3 py-3 text-left transition-colors ${
          daily?.checkin.claimed
            ? 'border-stone-800 bg-black/30 text-stone-500'
            : 'border-gold-matte/30 bg-gold-matte/5 text-stone-200 hover:border-gold-matte/60'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className="flex items-center gap-2">
          <Gift size={14} className="text-gold-matte/80" />
          <span>
            <span className="block text-xs uppercase tracking-[0.14em]">Sign In</span>
            <span className="block text-[10px] uppercase tracking-[0.16em] text-stone-500">
              +{daily?.checkin.reward_dust ?? 30} Dust
            </span>
          </span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.16em]">
          {claimingKey === 'sign-in' ? <Loader2 size={12} className="animate-spin" /> : daily?.checkin.claimed ? 'CLAIMED' : 'CLAIM'}
        </span>
      </button>

      <div className="space-y-2">
        {(daily?.tasks ?? []).map((task) => {
          const pct = Math.min(100, Math.round((task.progress / Math.max(task.target, 1)) * 100));
          return (
            <div key={task.key} className="border border-stone-800 bg-black/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs uppercase tracking-[0.12em] text-stone-300">{task.title}</p>
                  <p className="mt-1 text-[10px] leading-4 text-stone-500">{task.description}</p>
                </div>
                <button
                  onClick={() => claimTask(task.key)}
                  disabled={!task.claimable || claimingKey !== null}
                  className="min-w-14 border border-stone-700 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-stone-400 transition-colors enabled:hover:border-gold-matte/50 enabled:hover:text-gold-matte disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {renderActionLabel(task.key, task.claimed)}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1 flex-1 bg-stone-900">
                  <div className="h-full bg-gold-matte/70" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] text-stone-500">
                  {task.progress}/{task.target}
                </span>
                <span className="text-[10px] text-gold-matte/70">+{task.reward_dust}</span>
              </div>
            </div>
          );
        })}
      </div>

      {loading && <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-stone-600">Loading daily activity...</p>}
      {error && <p className="mt-3 text-[10px] leading-4 text-red-300">{error}</p>}
    </div>
  );
};
