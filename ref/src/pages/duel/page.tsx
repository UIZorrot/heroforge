
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../../components/layout/Navigation';
import HeroCard from '../../components/cards/HeroCard';
import { cardStorage, duelStorage } from '../../utils/cardStorage';
import { mockCards } from '../../mocks/cards';
import type { HeroCard as HeroCardType, BattleLog, DuelResult } from '../../types/card';

export default function DuelPage() {
  const navigate = useNavigate();
  const storedCards = cardStorage.getCards();
  const displayCards = storedCards.length > 0 ? storedCards : mockCards;

  const [cards] = useState<HeroCardType[]>(displayCards);
  const [heroA, setHeroA] = useState<HeroCardType | null>(null);
  const [heroB, setHeroB] = useState<HeroCardType | null>(null);
  const [showCardSelector, setShowCardSelector] = useState<'A' | 'B' | null>(null);
  const [isBattling, setIsBattling] = useState(false);
  const [battleLogs, setBattleLogs] = useState<BattleLog[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);
  const [heroAHP, setHeroAHP] = useState(0);
  const [heroBHP, setHeroBHP] = useState(0);
  const [activeAttacker, setActiveAttacker] = useState<'A' | 'B' | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (heroA) setHeroAHP(heroA.hp);
  }, [heroA]);
  useEffect(() => {
    if (heroB) setHeroBHP(heroB.hp);
  }, [heroB]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [battleLogs]);

  const selectCard = (card: HeroCardType) => {
    if (showCardSelector === 'A') { setHeroA(card); setHeroAHP(card.hp); }
    else if (showCardSelector === 'B') { setHeroB(card); setHeroBHP(card.hp); }
    setShowCardSelector(null);
  };

  const swapHeroes = () => {
    const [tA, tB, tHA, tHB] = [heroA, heroB, heroAHP, heroBHP];
    setHeroA(tB); setHeroB(tA); setHeroAHP(tHB); setHeroBHP(tHA);
  };

  const startBattle = async () => {
    if (!heroA || !heroB) return;
    setIsBattling(true);
    setBattleLogs([]);
    setCurrentRound(0);
    setWinner(null);
    setHeroAHP(heroA.hp);
    setHeroBHP(heroB.hp);

    const logs: BattleLog[] = [];
    let hpA = heroA.hp;
    let hpB = heroB.hp;
    let round = 1;

    while (hpA > 0 && hpB > 0 && round <= 20) {
      const aFirst = heroA.speed >= heroB.speed;

      if (aFirst) {
        setActiveAttacker('A');
        const dmg = Math.max(5, heroA.atk - heroB.def / 2 + Math.random() * 20);
        hpB -= dmg;
        const log: BattleLog = { round, attacker: heroA.name, defender: heroB.name, action: 'attacks', damage: Math.floor(dmg), timestamp: Date.now() };
        logs.push(log);
        setBattleLogs([...logs]);
        setHeroBHP(Math.max(0, hpB));
        await delay(700);
        if (hpB <= 0) break;

        setActiveAttacker('B');
        const dmgB = Math.max(5, heroB.atk - heroA.def / 2 + Math.random() * 20);
        hpA -= dmgB;
        const logB: BattleLog = { round, attacker: heroB.name, defender: heroA.name, action: 'counter-attacks', damage: Math.floor(dmgB), timestamp: Date.now() };
        logs.push(logB);
        setBattleLogs([...logs]);
        setHeroAHP(Math.max(0, hpA));
        await delay(700);
      } else {
        setActiveAttacker('B');
        const dmg = Math.max(5, heroB.atk - heroA.def / 2 + Math.random() * 20);
        hpA -= dmg;
        const log: BattleLog = { round, attacker: heroB.name, defender: heroA.name, action: 'attacks', damage: Math.floor(dmg), timestamp: Date.now() };
        logs.push(log);
        setBattleLogs([...logs]);
        setHeroAHP(Math.max(0, hpA));
        await delay(700);
        if (hpA <= 0) break;

        setActiveAttacker('A');
        const dmgA = Math.max(5, heroA.atk - heroB.def / 2 + Math.random() * 20);
        hpB -= dmgA;
        const logA: BattleLog = { round, attacker: heroA.name, defender: heroB.name, action: 'counter-attacks', damage: Math.floor(dmgA), timestamp: Date.now() };
        logs.push(logA);
        setBattleLogs([...logs]);
        setHeroBHP(Math.max(0, hpB));
        await delay(700);
      }

      setCurrentRound(round);
      round++;
    }

    setActiveAttacker(null);
    const winnerName = hpA > hpB ? heroA.name : heroB.name;
    setWinner(winnerName);

    const duelResult: DuelResult = {
      id: `duel_${Date.now()}`,
      heroA, heroB,
      winner: winnerName,
      logs,
      duration: round * 1400,
      timestamp: Date.now(),
    };
    duelStorage.saveDuel(duelResult);
    setIsBattling(false);
  };

  const resetBattle = () => {
    setBattleLogs([]);
    setCurrentRound(0);
    setWinner(null);
    setActiveAttacker(null);
    if (heroA) setHeroAHP(heroA.hp);
    if (heroB) setHeroBHP(heroB.hp);
  };

  const fullReset = () => {
    setHeroA(null); setHeroB(null);
    resetBattle();
  };

  const isBattleMode = isBattling || winner || battleLogs.length > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0c]">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-0 w-80 h-80 bg-rose-600/4 rounded-full blur-[120px]"></div>
        <div className="absolute top-1/4 right-0 w-80 h-80 bg-amber-400/4 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-64 bg-violet-600/4 rounded-full blur-[100px]"></div>
      </div>

      <Navigation />

      <main className="relative pt-20 pb-16 px-6">
        <div className="max-w-7xl mx-auto">

          {/* ── Header ── */}
          <div className="text-center pt-8 pb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-400/10 border border-rose-400/20 mb-4">
              <i className="ri-sword-fill text-rose-400 text-xs"></i>
              <span className="text-rose-400/80 text-xs font-mono tracking-widest uppercase">Battle Arena</span>
            </div>
            <h1 className="text-5xl font-display font-black text-white tracking-wide mb-2"
              style={{ textShadow: '0 0 40px rgba(239,68,68,0.2)' }}>
              THE <span className="text-rose-400">ARENA</span>
            </h1>
            <p className="text-gray-600 text-sm font-mono tracking-widest">
              {isBattleMode ? `ROUND ${currentRound} · ARENA PROTOCOL ENGAGED` : 'SELECT CHAMPIONS · ENGAGE BATTLE'}
            </p>
          </div>

          {/* ── Setup Mode ── */}
          {!isBattleMode && (
            <>
              <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-6 items-start mb-8">
                {/* Hero A */}
                <HeroSlot
                  label="A"
                  hero={heroA}
                  onSelect={() => setShowCardSelector('A')}
                  onClear={() => setHeroA(null)}
                  color="amber"
                />

                {/* VS divider */}
                <div className="hidden lg:flex flex-col items-center justify-center gap-4 py-8">
                  <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
                  <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
                    <span className="text-gray-500 font-display font-black text-lg">VS</span>
                  </div>
                  <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
                </div>

                {/* Hero B */}
                <HeroSlot
                  label="B"
                  hero={heroB}
                  onSelect={() => setShowCardSelector('B')}
                  onClear={() => setHeroB(null)}
                  color="rose"
                />
              </div>

              {/* Action row */}
              <div className="flex items-center justify-center gap-4">
                {heroA && heroB && (
                  <button
                    onClick={swapHeroes}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-gray-400 text-sm font-semibold hover:border-white/20 hover:text-gray-200 transition-all whitespace-nowrap cursor-pointer"
                  >
                    <i className="ri-arrow-left-right-line"></i>
                    Swap
                  </button>
                )}
                <button
                  onClick={startBattle}
                  disabled={!heroA || !heroB}
                  className={`flex items-center gap-3 px-10 py-4 rounded-xl font-black text-base transition-all whitespace-nowrap ${
                    heroA && heroB
                      ? 'bg-rose-500 text-white hover:bg-rose-400 shadow-[0_0_30px_rgba(239,68,68,0.4)] cursor-pointer'
                      : 'bg-white/[0.04] border border-white/10 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <i className="ri-sword-fill text-lg"></i>
                  ENGAGE BATTLE
                  <i className="ri-sword-fill text-lg scale-x-[-1]"></i>
                </button>
              </div>
            </>
          )}

          {/* ── Battle Mode ── */}
          {isBattleMode && heroA && heroB && (
            <div className="space-y-5">
              {/* HP Bars */}
              <div className="grid lg:grid-cols-2 gap-4">
                <HPBar
                  hero={heroA}
                  currentHP={heroAHP}
                  isAttacking={activeAttacker === 'A'}
                  isWinner={winner === heroA.name}
                  isLoser={winner !== null && winner !== heroA.name}
                  side="left"
                />
                <HPBar
                  hero={heroB}
                  currentHP={heroBHP}
                  isAttacking={activeAttacker === 'B'}
                  isWinner={winner === heroB.name}
                  isLoser={winner !== null && winner !== heroB.name}
                  side="right"
                />
              </div>

              {/* Battle Log */}
              <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <i className="ri-scroll-fill text-amber-400/60 text-sm"></i>
                    <span className="text-sm font-display font-bold text-gray-300 tracking-wider">BATTLE CHRONICLE</span>
                  </div>
                  <span className="text-xs font-mono text-gray-600">Round {currentRound}</span>
                </div>
                <div ref={logRef} className="p-4 space-y-2 max-h-72 overflow-y-auto">
                  {battleLogs.length === 0 && (
                    <div className="text-center py-6 text-gray-700 text-sm font-mono">Awaiting first strike...</div>
                  )}
                  {battleLogs.map((log, i) => (
                    <LogEntry key={i} log={log} heroAName={heroA.name} />
                  ))}
                  {isBattling && (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <span className="text-xs text-gray-600 font-mono">Battle in progress...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Winner Banner */}
              {winner && (
                <div className="rounded-2xl overflow-hidden border border-amber-400/30 bg-gradient-to-br from-amber-900/20 via-[#0a0a0c] to-violet-900/20">
                  <div className="p-8 text-center">
                    <div className="flex items-center justify-center gap-3 mb-4">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-400/30"></div>
                      <div className="w-16 h-16 rounded-full bg-amber-400/10 border-2 border-amber-400/40 flex items-center justify-center">
                        <i className="ri-trophy-fill text-3xl text-amber-400"></i>
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-400/30"></div>
                    </div>
                    <p className="text-xs font-mono text-amber-400/60 tracking-widest mb-2 uppercase">Victor Ascends</p>
                    <h2 className="text-4xl font-display font-black text-white mb-1"
                      style={{ textShadow: '0 0 30px rgba(234,179,8,0.4)' }}>
                      {winner}
                    </h2>
                    <p className="text-gray-600 text-sm font-mono mb-6">
                      {currentRound} rounds · {battleLogs.length} exchanges
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={resetBattle}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-gray-300 text-sm font-semibold hover:bg-white/[0.08] transition-all whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-refresh-line"></i>
                        Rematch
                      </button>
                      <button
                        onClick={fullReset}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-400 text-[#0a0a0c] text-sm font-bold hover:bg-amber-300 transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)] whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-sword-fill"></i>
                        New Duel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Card Selector Modal ── */}
      {showCardSelector && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-[#0f1117] border border-white/10 rounded-2xl p-6 max-w-5xl w-full max-h-[88vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-2xl font-display font-bold text-white">
                  Select Champion <span className={showCardSelector === 'A' ? 'text-amber-400' : 'text-rose-400'}>{showCardSelector}</span>
                </h2>
                <p className="text-gray-600 text-xs font-mono mt-0.5">{cards.length} relics available</p>
              </div>
              <button
                onClick={() => setShowCardSelector(null)}
                className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center hover:bg-white/[0.1] transition-all cursor-pointer"
              >
                <i className="ri-close-line text-gray-400"></i>
              </button>
            </div>

            {cards.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {cards.map(card => (
                  <div
                    key={card.id}
                    onClick={() => selectCard(card)}
                    className="cursor-pointer"
                  >
                    <HeroCard card={card} onClick={() => selectCard(card)} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-500 mb-4 text-sm">No heroes in your vault</p>
                <button
                  onClick={() => navigate('/forge')}
                  className="px-6 py-3 bg-amber-400 text-[#0a0a0c] rounded-xl font-bold text-sm hover:bg-amber-300 transition-all whitespace-nowrap cursor-pointer"
                >
                  Go to Forge
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function HeroSlot({ label, hero, onSelect, onClear, color }: {
  label: string;
  hero: HeroCardType | null;
  onSelect: () => void;
  onClear: () => void;
  color: 'amber' | 'rose';
}) {
  const accent = color === 'amber'
    ? { border: 'border-amber-400/30', text: 'text-amber-400', bg: 'bg-amber-400/10', hover: 'hover:border-amber-400/40' }
    : { border: 'border-rose-400/30', text: 'text-rose-400', bg: 'bg-rose-400/10', hover: 'hover:border-rose-400/40' };

  return (
    <div className={`rounded-2xl border ${accent.border} bg-white/[0.02] p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg ${accent.bg} border ${accent.border} flex items-center justify-center`}>
            <span className={`text-xs font-black font-mono ${accent.text}`}>{label}</span>
          </div>
          <span className="text-sm font-display font-bold text-gray-400 tracking-wider">CHAMPION {label}</span>
        </div>
        {hero && (
          <button
            onClick={onClear}
            className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center hover:border-rose-400/30 hover:text-rose-400 text-gray-500 transition-all cursor-pointer"
          >
            <i className="ri-close-line text-xs"></i>
          </button>
        )}
      </div>

      {hero ? (
        <div className="max-w-[260px] mx-auto">
          <HeroCard card={hero} />
        </div>
      ) : (
        <button
          onClick={onSelect}
          className={`w-full aspect-[3/4] rounded-xl border-2 border-dashed border-white/[0.08] ${accent.hover} flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group`}
        >
          <div className={`w-14 h-14 rounded-xl ${accent.bg} border ${accent.border} flex items-center justify-center group-hover:scale-110 transition-transform`}>
            <i className={`ri-user-add-line text-2xl ${accent.text}`}></i>
          </div>
          <div className="text-center">
            <p className={`text-sm font-semibold ${accent.text}`}>Select Champion</p>
            <p className="text-xs text-gray-700 mt-0.5">Choose from your vault</p>
          </div>
        </button>
      )}
    </div>
  );
}

function HPBar({ hero, currentHP, isAttacking, isWinner, isLoser, side }: {
  hero: HeroCardType;
  currentHP: number;
  isAttacking: boolean;
  isWinner: boolean;
  isLoser: boolean;
  side: 'left' | 'right';
}) {
  const pct = Math.max(0, (currentHP / hero.hp) * 100);
  const hpColor = pct > 60 ? 'from-emerald-500 to-emerald-400' : pct > 30 ? 'from-amber-500 to-amber-400' : 'from-rose-600 to-rose-400';

  return (
    <div className={`rounded-2xl border p-5 transition-all duration-300 ${
      isWinner ? 'border-amber-400/50 bg-amber-900/10' :
      isLoser  ? 'border-white/[0.04] bg-white/[0.01] opacity-60' :
      isAttacking ? 'border-rose-400/30 bg-rose-900/10' :
      'border-white/[0.06] bg-white/[0.02]'
    }`}>
      <div className={`flex items-center gap-4 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
          isAttacking ? 'border-rose-400 shadow-[0_0_15px_rgba(239,68,68,0.4)]' :
          isWinner ? 'border-amber-400 shadow-[0_0_15px_rgba(234,179,8,0.4)]' :
          'border-white/10'
        }`}>
          <img src={hero.imageUrl} alt={hero.name} className="w-full h-full object-cover object-top" />
          {isAttacking && (
            <div className="absolute inset-0 bg-rose-400/20 animate-pulse"></div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className={`flex items-center gap-2 mb-2 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
            <span className="text-sm font-display font-bold text-white truncate">{hero.name}</span>
            {isWinner && <i className="ri-trophy-fill text-amber-400 text-sm flex-shrink-0"></i>}
            {isAttacking && <i className="ri-sword-fill text-rose-400 text-xs flex-shrink-0 animate-pulse"></i>}
          </div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-gray-600 font-mono">HP</span>
            <span className={`font-mono font-bold ${pct > 60 ? 'text-emerald-400' : pct > 30 ? 'text-amber-400' : 'text-rose-400'}`}>
              {Math.max(0, Math.floor(currentHP))} / {hero.hp}
            </span>
          </div>
          <div className="h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${hpColor} rounded-full transition-all duration-500`}
              style={{ width: `${pct}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogEntry({ log, heroAName }: { log: BattleLog; heroAName: string }) {
  const isA = log.attacker === heroAName;
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${isA ? 'bg-amber-400/20' : 'bg-rose-400/20'}`}>
        <i className={`ri-sword-fill text-[10px] ${isA ? 'text-amber-400' : 'text-rose-400'}`}></i>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed flex-1">
        <span className={`font-bold ${isA ? 'text-amber-400' : 'text-rose-400'}`}>{log.attacker}</span>
        <span className="text-gray-600"> {log.action} </span>
        <span className="font-semibold text-gray-300">{log.defender}</span>
        {log.damage && (
          <span className="ml-2 font-mono font-bold text-rose-400">-{log.damage} HP</span>
        )}
      </p>
      <span className="text-[10px] text-gray-700 font-mono flex-shrink-0">R{log.round}</span>
    </div>
  );
}
