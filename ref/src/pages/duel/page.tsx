import { useState, useEffect } from 'react';
import { HeroCard as Card } from '../../types/card';
import { getCards } from '../../utils/cardStorage';
import HeroCard from '../../components/cards/HeroCard';

interface BattleLog {
  round: number;
  attacker: string;
  defender: string;
  damage: number;
  attackerHp: number;
  defenderHp: number;
  isCritical?: boolean;
  isDodged?: boolean;
  skill?: string;
}

export default function DuelPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [heroA, setHeroA] = useState<Card | null>(null);
  const [heroB, setHeroB] = useState<Card | null>(null);
  const [battleState, setBattleState] = useState<'setup' | 'fighting' | 'finished'>('setup');
  const [battleLog, setBattleLog] = useState<BattleLog[]>([]);
  const [currentHpA, setCurrentHpA] = useState(0);
  const [currentHpB, setCurrentHpB] = useState(0);
  const [winner, setWinner] = useState<Card | null>(null);
  const [currentRound, setCurrentRound] = useState(0);

  useEffect(() => {
    const loadedCards = getCards();
    setCards(loadedCards);
  }, []);

  const startBattle = () => {
    if (!heroA || !heroB) return;

    setBattleState('fighting');
    setCurrentHpA(heroA.attributes.hp);
    setCurrentHpB(heroB.attributes.hp);
    setBattleLog([]);
    setCurrentRound(0);

    const logs: BattleLog[] = [];
    let hpA = heroA.attributes.hp;
    let hpB = heroB.attributes.hp;
    let round = 1;

    const simulateRound = () => {
      if (hpA <= 0 || hpB <= 0) {
        setBattleState('finished');
        setWinner(hpA > 0 ? heroA : heroB);
        return;
      }

      const attacker = heroA.attributes.speed >= heroB.attributes.speed ? heroA : heroB;
      const defender = attacker === heroA ? heroB : heroA;
      const isAAttacking = attacker === heroA;

      const baseDamage = Math.max(1, attacker.attributes.attack - defender.attributes.defense);
      const isCritical = Math.random() < 0.15;
      const isDodged = Math.random() < 0.1;
      const damage = isDodged ? 0 : (isCritical ? baseDamage * 2 : baseDamage);

      if (isAAttacking) {
        hpB = Math.max(0, hpB - damage);
        setCurrentHpB(hpB);
      } else {
        hpA = Math.max(0, hpA - damage);
        setCurrentHpA(hpA);
      }

      logs.push({
        round,
        attacker: attacker.name,
        defender: defender.name,
        damage,
        attackerHp: isAAttacking ? hpA : hpB,
        defenderHp: isAAttacking ? hpB : hpA,
        isCritical,
        isDodged,
        skill: attacker.skills[Math.floor(Math.random() * attacker.skills.length)]
      });

      setBattleLog([...logs]);
      setCurrentRound(round);
      round++;

      if (hpA > 0 && hpB > 0) {
        setTimeout(simulateRound, 1200);
      } else {
        setBattleState('finished');
        setWinner(hpA > 0 ? heroA : heroB);
      }
    };

    setTimeout(simulateRound, 800);
  };

  const resetBattle = () => {
    setBattleState('setup');
    setBattleLog([]);
    setWinner(null);
    setCurrentRound(0);
    setCurrentHpA(0);
    setCurrentHpB(0);
  };

  return (
    <div className="min-h-screen bg-[#080808] relative overflow-hidden">
      {/* 暗色纹理渐变背景 */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-radial from-amber-950/20 via-transparent to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-radial from-purple-950/20 via-transparent to-transparent blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-8 py-16">
        {/* 页面标题 */}
        <div className="text-center mb-20">
          <div className="flex items-center justify-center gap-6 mb-4">
            <div className="w-12 h-[0.5px] bg-stone-700" />
            <div className="w-2 h-2 rotate-45 border border-stone-700" />
            <div className="w-12 h-[0.5px] bg-stone-700" />
          </div>
          <h1 className="text-5xl font-display text-stone-200 mb-3" style={{ letterSpacing: '0.25em' }}>
            A R E N A
          </h1>
          <p className="text-stone-500 italic text-sm">"Illuminate the enemy"</p>
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="w-12 h-[0.5px] bg-stone-700" />
            <div className="w-2 h-2 rotate-45 border border-stone-700" />
            <div className="w-12 h-[0.5px] bg-stone-700" />
          </div>
        </div>

        {battleState === 'setup' && (
          <div className="max-w-7xl mx-auto">
            {/* 英雄选择区 */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-16 items-start mb-16">
              {/* Hero A */}
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-xs text-stone-600 mb-2" style={{ letterSpacing: '0.2em' }}>CHALLENGER</div>
                  <div className="h-[0.5px] bg-stone-800 mb-6" />
                </div>
                
                <div 
                  className={`border transition-all duration-300 ${
                    heroA 
                      ? 'border-[#D4AF37]/50 shadow-[0_0_20px_rgba(212,175,55,0.1)]' 
                      : 'border-stone-800 hover:border-stone-700'
                  }`}
                  style={{ minHeight: '500px' }}
                >
                  {heroA ? (
                    <HeroCard card={heroA} />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center space-y-4">
                        <div className="w-2 h-2 rotate-45 border border-stone-700 mx-auto" />
                        <p className="text-stone-600 text-sm" style={{ letterSpacing: '0.1em' }}>SELECT HERO</p>
                      </div>
                    </div>
                  )}
                </div>

                <select
                  value={heroA?.id || ''}
                  onChange={(e) => {
                    const card = cards.find(c => c.id === e.target.value);
                    setHeroA(card || null);
                  }}
                  className="w-full bg-transparent border-b border-stone-800 text-stone-300 py-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                  style={{ letterSpacing: '0.05em' }}
                >
                  <option value="" className="bg-[#0a0a0a]">Choose your champion</option>
                  {cards.filter(c => c.id !== heroB?.id).map(card => (
                    <option key={card.id} value={card.id} className="bg-[#0a0a0a]">
                      {card.name} — BP {card.attributes.battlePower}
                    </option>
                  ))}
                </select>
              </div>

              {/* VS 分隔 */}
              <div className="flex flex-col items-center justify-center pt-32">
                <div className="w-[0.5px] h-24 bg-stone-800 mb-6" />
                <div className="text-4xl font-display text-stone-700" style={{ letterSpacing: '0.3em' }}>
                  VS
                </div>
                <div className="w-[0.5px] h-24 bg-stone-800 mt-6" />
              </div>

              {/* Hero B */}
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-xs text-stone-600 mb-2" style={{ letterSpacing: '0.2em' }}>OPPONENT</div>
                  <div className="h-[0.5px] bg-stone-800 mb-6" />
                </div>
                
                <div 
                  className={`border transition-all duration-300 ${
                    heroB 
                      ? 'border-[#D4AF37]/50 shadow-[0_0_20px_rgba(212,175,55,0.1)]' 
                      : 'border-stone-800 hover:border-stone-700'
                  }`}
                  style={{ minHeight: '500px' }}
                >
                  {heroB ? (
                    <HeroCard card={heroB} />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center space-y-4">
                        <div className="w-2 h-2 rotate-45 border border-stone-700 mx-auto" />
                        <p className="text-stone-600 text-sm" style={{ letterSpacing: '0.1em' }}>SELECT HERO</p>
                      </div>
                    </div>
                  )}
                </div>

                <select
                  value={heroB?.id || ''}
                  onChange={(e) => {
                    const card = cards.find(c => c.id === e.target.value);
                    setHeroB(card || null);
                  }}
                  className="w-full bg-transparent border-b border-stone-800 text-stone-300 py-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                  style={{ letterSpacing: '0.05em' }}
                >
                  <option value="" className="bg-[#0a0a0a]">Choose your champion</option>
                  {cards.filter(c => c.id !== heroA?.id).map(card => (
                    <option key={card.id} value={card.id} className="bg-[#0a0a0a]">
                      {card.name} — BP {card.attributes.battlePower}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 开始按钮 */}
            <div className="text-center">
              <button
                onClick={startBattle}
                disabled={!heroA || !heroB}
                className="group relative px-16 py-4 border border-stone-800 text-stone-400 disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#D4AF37]/50 hover:text-[#D4AF37] transition-all duration-300"
              >
                <span className="text-sm" style={{ letterSpacing: '0.2em' }}>ENGAGE</span>
                <div className="absolute inset-0 border border-[#D4AF37]/0 group-hover:border-[#D4AF37]/20 transition-all duration-300" style={{ margin: '4px' }} />
              </button>
            </div>
          </div>
        )}

        {battleState === 'fighting' && heroA && heroB && (
          <div className="max-w-7xl mx-auto space-y-12">
            {/* 回合指示 */}
            <div className="text-center">
              <div className="inline-flex items-center gap-4 px-8 py-3 border border-stone-800">
                <div className="w-2 h-2 rotate-45 border border-stone-700" />
                <span className="text-stone-500 text-xs font-mono" style={{ letterSpacing: '0.15em' }}>
                  ROUND {currentRound}
                </span>
                <div className="w-2 h-2 rotate-45 border border-stone-700" />
              </div>
            </div>

            {/* 战斗状态 */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-12 items-center">
              {/* Hero A 状态 */}
              <div className="space-y-4">
                <div className="text-right">
                  <div className="text-stone-400 text-sm mb-2" style={{ letterSpacing: '0.1em' }}>{heroA.name}</div>
                  <div className="flex items-center justify-end gap-3">
                    <div className="text-2xl font-mono text-stone-300">{currentHpA}</div>
                    <div className="text-stone-600 text-xs">/</div>
                    <div className="text-stone-600 text-sm font-mono">{heroA.attributes.hp}</div>
                  </div>
                </div>
                <div className="h-[0.5px] bg-stone-800 relative overflow-hidden">
                  <div 
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-transparent via-[#D4AF37] to-[#D4AF37] transition-all duration-500"
                    style={{ 
                      width: `${(currentHpA / heroA.attributes.hp) * 100}%`,
                      opacity: currentHpA / heroA.attributes.hp > 0.3 ? 0.8 : 0.5
                    }}
                  />
                </div>
              </div>

              {/* 中央分隔 */}
              <div className="w-[0.5px] h-32 bg-stone-800" />

              {/* Hero B 状态 */}
              <div className="space-y-4">
                <div className="text-left">
                  <div className="text-stone-400 text-sm mb-2" style={{ letterSpacing: '0.1em' }}>{heroB.name}</div>
                  <div className="flex items-center gap-3">
                    <div className="text-2xl font-mono text-stone-300">{currentHpB}</div>
                    <div className="text-stone-600 text-xs">/</div>
                    <div className="text-stone-600 text-sm font-mono">{heroB.attributes.hp}</div>
                  </div>
                </div>
                <div className="h-[0.5px] bg-stone-800 relative overflow-hidden">
                  <div 
                    className="absolute right-0 top-0 h-full bg-gradient-to-l from-transparent via-[#D4AF37] to-[#D4AF37] transition-all duration-500"
                    style={{ 
                      width: `${(currentHpB / heroB.attributes.hp) * 100}%`,
                      opacity: currentHpB / heroB.attributes.hp > 0.3 ? 0.8 : 0.5
                    }}
                  />
                </div>
              </div>
            </div>

            {/* 战斗日志 */}
            <div className="max-w-2xl mx-auto">
              <div className="border border-stone-800 p-8">
                <div className="text-center mb-6">
                  <div className="text-xs text-stone-600" style={{ letterSpacing: '0.2em' }}>BATTLE LOG</div>
                  <div className="h-[0.5px] bg-stone-800 mt-3" />
                </div>
                
                <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {battleLog.map((log, index) => (
                    <div 
                      key={index}
                      className="flex items-center gap-4 text-xs font-mono text-stone-500 py-2 border-b border-stone-900/50 last:border-0"
                    >
                      <span className="text-stone-700 w-12">R{log.round}</span>
                      <span className="flex-1">
                        {log.attacker}
                        {log.isDodged && <span className="text-stone-600 ml-2">MISS</span>}
                        {log.isCritical && <span className="text-[#D4AF37] ml-2">CRIT</span>}
                      </span>
                      <span className="text-stone-600">→</span>
                      <span className="w-16 text-right">{log.damage} DMG</span>
                      <span className="text-stone-600">→</span>
                      <span className="flex-1 text-right">{log.defender}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {battleState === 'finished' && winner && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50">
            <div className="text-center space-y-12 max-w-2xl px-8">
              {/* 装饰线 */}
              <div className="flex items-center justify-center gap-6">
                <div className="w-24 h-[0.5px] bg-stone-700" />
                <div className="w-3 h-3 rotate-45 border border-stone-700" />
                <div className="w-24 h-[0.5px] bg-stone-700" />
              </div>

              {/* 胜利标题 */}
              <div>
                <div className="text-6xl font-display text-stone-200 mb-6" style={{ letterSpacing: '0.3em' }}>
                  V I C T O R Y
                </div>
                <p className="text-stone-500 italic text-sm">"The legend ascends"</p>
              </div>

              {/* 胜者信息 */}
              <div className="space-y-6">
                <div className="text-3xl text-[#D4AF37] font-display" style={{ letterSpacing: '0.15em' }}>
                  {winner.name}
                </div>
                <div className="flex items-center justify-center gap-8 text-stone-400">
                  <div className="text-center">
                    <div className="text-xs text-stone-600 mb-2" style={{ letterSpacing: '0.1em' }}>FINAL HP</div>
                    <div className="text-2xl font-mono text-stone-300">
                      {winner === heroA ? currentHpA : currentHpB}
                    </div>
                  </div>
                  <div className="w-[0.5px] h-12 bg-stone-800" />
                  <div className="text-center">
                    <div className="text-xs text-stone-600 mb-2" style={{ letterSpacing: '0.1em' }}>ROUNDS</div>
                    <div className="text-2xl font-mono text-stone-300">{currentRound}</div>
                  </div>
                </div>
              </div>

              {/* 装饰线 */}
              <div className="flex items-center justify-center gap-6">
                <div className="w-24 h-[0.5px] bg-stone-700" />
                <div className="w-3 h-3 rotate-45 border border-stone-700" />
                <div className="w-24 h-[0.5px] bg-stone-700" />
              </div>

              {/* 按钮 */}
              <div className="flex items-center justify-center gap-6 pt-8">
                <button
                  onClick={resetBattle}
                  className="px-12 py-3 border border-stone-800 text-stone-400 hover:border-[#D4AF37]/50 hover:text-[#D4AF37] transition-all duration-300"
                >
                  <span className="text-sm" style={{ letterSpacing: '0.15em' }}>NEW DUEL</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #404040;
        }
      `}</style>
    </div>
  );
}