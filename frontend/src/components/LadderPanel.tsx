import React, { useEffect, useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';
import { fetchLadder } from '../lib/api';
import type { LadderSnapshot } from '../types';

interface LadderPanelProps {
  token?: string | null;
}

const resultTone: Record<string, string> = {
  win: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/5',
  loss: 'text-red-300 border-red-400/30 bg-red-400/5',
  tie: 'text-stone-300 border-stone-500/30 bg-stone-500/5',
};

export const LadderPanel: React.FC<LadderPanelProps> = ({ token }) => {
  const [ladder, setLadder] = useState<LadderSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchLadder(token)
      .then(setLadder)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load ladder'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading && !ladder) {
    return (
      <div className="flex min-h-[680px] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gold-matte" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[680px] items-center justify-center">
        <div className="border border-red-400/30 bg-red-950/20 p-6 text-sm text-red-200">{error}</div>
      </div>
    );
  }

  const record = ladder?.record ?? { played: 0, wins: 0, losses: 0, ties: 0 };

  return (
    <div className="min-h-[740px] space-y-6">
      <div className="relative overflow-hidden border border-stone-800 bg-black/40 p-8">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full border border-gold-matte/20 bg-gold-matte/5 blur-2xl" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-5 flex h-14 w-14 items-center justify-center border border-gold-matte/30 bg-gold-matte/5">
              <Trophy size={22} className="text-gold-matte" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-stone-500">Arena Ladder</p>
            <h2 className="mt-3 text-5xl font-light tracking-[0.18em] text-stone-100">{ladder?.tier ?? 'Bronze'}</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-stone-400">
              Ranked shell derived from resolved Arena matches. It gives Arena a visible progression layer before full seasonal leaderboards are introduced.
            </p>
          </div>
          <div className="grid min-w-[360px] grid-cols-2 gap-3">
            <div className="border border-stone-800 bg-black/45 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Rating</p>
              <p className="mt-2 text-4xl font-light text-gold-matte">{ladder?.rating ?? 1000}</p>
            </div>
            <div className="border border-stone-800 bg-black/45 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Win Rate</p>
              <p className="mt-2 text-4xl font-light text-stone-100">{ladder?.win_rate ?? 0}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Played', record.played],
          ['Wins', record.wins],
          ['Losses', record.losses],
          ['Ties', record.ties],
        ].map(([label, value]) => (
          <div key={label} className="border border-stone-800 bg-black/35 p-5">
            <p className="text-[10px] uppercase tracking-[0.24em] text-stone-500">{label}</p>
            <p className="mt-2 text-3xl font-light text-stone-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="border border-stone-800 bg-black/35 p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm uppercase tracking-[0.28em] text-stone-300">Recent Arena Matches</h3>
            <span className="text-[10px] uppercase tracking-[0.2em] text-stone-600">Last 10</span>
          </div>
          <div className="space-y-2">
            {(ladder?.recent_matches ?? []).length === 0 ? (
              <div className="border border-dashed border-stone-800 py-14 text-center text-xs uppercase tracking-[0.24em] text-stone-600">
                No ranked matches yet
              </div>
            ) : (
              ladder?.recent_matches.map((match) => (
                <div key={match.id} className="grid gap-3 border border-stone-800 bg-black/45 p-4 text-sm md:grid-cols-[90px_1fr_120px] md:items-center">
                  <span className={`w-fit border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${resultTone[match.result] ?? resultTone.tie}`}>
                    {match.result}
                  </span>
                  <div>
                    <p className="text-stone-300">BP {match.bp} vs {match.opponent_bp}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-stone-600">{match.queue_key}</p>
                  </div>
                  <p className={`text-right text-sm ${match.rating_delta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {match.rating_delta >= 0 ? '+' : ''}{match.rating_delta}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border border-stone-800 bg-black/35 p-6">
          <h3 className="text-sm uppercase tracking-[0.28em] text-stone-300">MVP Rules</h3>
          <div className="mt-5 space-y-3 text-sm text-stone-400">
            <p>Base rating: {ladder?.rules.base_rating ?? 1000}</p>
            <p>Win: +{ladder?.rules.win_delta ?? 25}</p>
            <p>Tie: +{ladder?.rules.tie_delta ?? 5}</p>
            <p>Loss: {ladder?.rules.loss_delta ?? -15}</p>
            <p className="border-t border-stone-800 pt-4 text-xs leading-6 text-stone-500">
              This is intentionally lightweight. Full global ranking, seasons, demotion protection, and rewards should wait until Arena settlement telemetry is stable.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
