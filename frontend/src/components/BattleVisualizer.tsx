
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, SkipForward, RotateCcw, Swords, Zap } from 'lucide-react';
import type { SavedHero } from '../types';
import type { BattleEvent } from '../lib/battleTypes';
import { HeroCard } from './HeroCard';

interface BattleVisualizerProps {
  heroA: SavedHero;
  heroB: SavedHero;
  events: BattleEvent[];
  onClose: () => void;
}

const SHAKE_ANIMATION = {
  x: [0, -8, 8, -8, 8, 0],
  transition: { duration: 0.35 },
};

const ATTACK_RIGHT = {
  x: [0, 72, 0],
  transition: { duration: 0.28, times: [0, 0.5, 1] },
};

const ATTACK_LEFT = {
  x: [0, -72, 0],
  transition: { duration: 0.28, times: [0, 0.5, 1] },
};

export const BattleVisualizer: React.FC<BattleVisualizerProps> = ({ heroA, heroB, events, onClose }) => {
  const [currentStep, setCurrentStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentEvent = currentStep >= 0 && currentStep < events.length ? events[currentStep] : null;
  const maxHpA = Math.max(1, parseInt(heroA.character.state.HP));
  const maxHpB = Math.max(1, parseInt(heroB.character.state.HP));
  const baseMaxMpA = Math.max(0, parseInt(heroA.character.state.MP));
  const baseMaxMpB = Math.max(0, parseInt(heroB.character.state.MP));
  const maxMpA = Math.max(1, currentEvent?.maxMpA ?? baseMaxMpA);
  const maxMpB = Math.max(1, currentEvent?.maxMpB ?? baseMaxMpB);
  const hpA = currentEvent ? currentEvent.hpA : maxHpA;
  const hpB = currentEvent ? currentEvent.hpB : maxHpB;
  const mpA = currentEvent ? currentEvent.mpA : baseMaxMpA;
  const mpB = currentEvent ? currentEvent.mpB : baseMaxMpB;
  const hpRatioA = Math.max(0, Math.min(1, hpA / maxHpA));
  const hpRatioB = Math.max(0, Math.min(1, hpB / maxHpB));
  const mpRatioA = Math.max(0, Math.min(1, mpA / maxMpA));
  const mpRatioB = Math.max(0, Math.min(1, mpB / maxMpB));
  const hpBarClassA = hpRatioA <= 0.3 ? 'from-red-700 to-red-500' : hpRatioA <= 0.6 ? 'from-amber-600 to-amber-400' : 'from-emerald-700 to-emerald-400';
  const hpBarClassB = hpRatioB <= 0.3 ? 'from-red-700 to-red-500' : hpRatioB <= 0.6 ? 'from-amber-600 to-amber-400' : 'from-emerald-700 to-emerald-400';
  const isAttackA = currentEvent?.attacker === 'A' && (currentEvent.actionType === 'attack' || currentEvent.actionType === 'skill');
  const isAttackB = currentEvent?.attacker === 'B' && (currentEvent.actionType === 'attack' || currentEvent.actionType === 'skill');
  const isHitA = currentEvent?.defender === 'A' && currentEvent.damage > 0;
  const isHitB = currentEvent?.defender === 'B' && currentEvent.damage > 0;

  useEffect(() => {
    if (!isPlaying || currentStep >= events.length - 1) {
      return;
    }
    const delay = 1500 / speed;
    const timer = setTimeout(() => {
      setCurrentStep((prev) => prev + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [currentStep, isPlaying, speed, events.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentStep]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#080808]/95 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-stone-800/70 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-stone-200">
            <Swords size={16} className="text-gold-matte/80" />
            <h2 className="text-sm font-light tracking-[0.2em]">BATTLE ARENA</h2>
          </div>
          <div className="border border-stone-800 px-2 py-0.5 text-[10px] font-light tracking-[0.18em] text-stone-400">
            ROUND {currentEvent?.round || 1}
          </div>
        </div>
        <button onClick={onClose} className="border border-stone-800 p-2 text-stone-500 transition-colors hover:border-stone-600 hover:text-stone-200">
          <X size={16} />
        </button>
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-1 items-center justify-between gap-8 px-8 py-8">
        <div className="flex flex-col items-center gap-4">
          <motion.div animate={isAttackA ? ATTACK_RIGHT : isHitA ? SHAKE_ANIMATION : {}} key={`hero-a-${currentStep}`}>
            <div className="relative">
              {currentEvent?.isStunned && currentEvent.defender === 'A' && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
                  <Zap className="text-gold-matte/80" size={30} />
                </div>
              )}
              <HeroCard character={heroA.character} image={heroA.image} compact className="h-[320px] w-[240px]" />
            </div>
          </motion.div>
          <div className="w-64 space-y-3">
            <div className="relative h-3 overflow-hidden border border-stone-600 bg-black/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
              <motion.div
                className={`h-full bg-gradient-to-r ${hpBarClassA}`}
                initial={{ width: '100%' }}
                animate={{ width: `${hpRatioA * 100}%` }}
                transition={{ type: 'spring', stiffness: 100 }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-medium tracking-[0.14em] text-white/90">
                <span>HP</span>
                <span>{hpA} / {maxHpA}</span>
              </div>
            </div>
            <div className="relative h-3 overflow-hidden border border-stone-600 bg-black/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-800 to-cyan-400"
                initial={{ width: '100%' }}
                animate={{ width: `${mpRatioA * 100}%` }}
                transition={{ type: 'spring', stiffness: 100 }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-medium tracking-[0.14em] text-white/90">
                <span>MP</span>
                <span>{mpA} / {maxMpA}</span>
              </div>
            </div>
          </div>
          <AnimatePresence>
            {isHitA && (
              <motion.div
                initial={{ opacity: 1, y: 0 }}
                animate={{ opacity: 0, y: -55 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute top-1/2 text-2xl font-light tracking-[0.12em] text-stone-200"
              >
                -{currentEvent.damage}
              </motion.div>
            )}
            {currentEvent?.defender === 'A' && currentEvent.isMiss && (
              <motion.div initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: -40 }} className="absolute top-24 text-xs tracking-[0.2em] text-stone-500">
                MISS
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center gap-5">
          <div className="text-5xl font-light tracking-[0.4em] text-stone-800">VS</div>
          <AnimatePresence mode="wait">
            {currentEvent && (
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="min-w-[300px] border border-stone-800 bg-black/50 px-6 py-4 text-center backdrop-blur-sm"
              >
                <div className="mb-1 text-[10px] uppercase tracking-[0.25em] text-stone-500">
                  {currentEvent.attacker === 'A' ? heroA.character.name : heroB.character.name}
                </div>
                <div className="text-sm tracking-wide text-stone-200">{currentEvent.skillName || 'Basic Attack'}</div>
                {currentEvent.mpCostApplied > 0 && <div className="mt-1 text-[10px] tracking-wider text-stone-400">MP -{currentEvent.mpCostApplied}</div>}
                {currentEvent.isCrit && <div className="mt-1 text-[10px] tracking-wider text-gold-matte">CRITICAL</div>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center gap-4">
          <motion.div animate={isAttackB ? ATTACK_LEFT : isHitB ? SHAKE_ANIMATION : {}} key={`hero-b-${currentStep}`}>
            <div className="relative">
              {currentEvent?.isStunned && currentEvent.defender === 'B' && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
                  <Zap className="text-gold-matte/80" size={30} />
                </div>
              )}
              <HeroCard character={heroB.character} image={heroB.image} compact className="h-[320px] w-[240px]" />
            </div>
          </motion.div>
          <div className="w-64 space-y-3">
            <div className="relative h-3 overflow-hidden border border-stone-600 bg-black/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
              <motion.div
                className={`h-full bg-gradient-to-l ${hpBarClassB}`}
                initial={{ width: '100%' }}
                animate={{ width: `${hpRatioB * 100}%` }}
                transition={{ type: 'spring', stiffness: 100 }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-medium tracking-[0.14em] text-white/90">
                <span>HP</span>
                <span>{hpB} / {maxHpB}</span>
              </div>
            </div>
            <div className="relative h-3 overflow-hidden border border-stone-600 bg-black/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
              <motion.div
                className="h-full bg-gradient-to-l from-blue-800 to-cyan-400"
                initial={{ width: '100%' }}
                animate={{ width: `${mpRatioB * 100}%` }}
                transition={{ type: 'spring', stiffness: 100 }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-medium tracking-[0.14em] text-white/90">
                <span>MP</span>
                <span>{mpB} / {maxMpB}</span>
              </div>
            </div>
          </div>
          <AnimatePresence>
            {isHitB && (
              <motion.div
                initial={{ opacity: 1, y: 0 }}
                animate={{ opacity: 0, y: -55 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute top-1/2 text-2xl font-light tracking-[0.12em] text-stone-200"
              >
                -{currentEvent.damage}
              </motion.div>
            )}
            {currentEvent?.defender === 'B' && currentEvent.isMiss && (
              <motion.div initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: -40 }} className="absolute top-24 text-xs tracking-[0.2em] text-stone-500">
                MISS
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="border-t border-stone-800/70 bg-black/70 px-6 py-5">
        <input
          type="range"
          min="-1"
          max={events.length - 1}
          value={currentStep}
          onChange={(e) => {
            setCurrentStep(parseInt(e.target.value));
            setIsPlaying(false);
          }}
          className="mb-4 h-[2px] w-full cursor-pointer appearance-none bg-stone-700 accent-gold-matte"
        />
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="border border-gold-matte/40 px-3 py-2 text-stone-200 transition-colors hover:border-gold-matte hover:text-stone-100"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={() => {
                setCurrentStep(-1);
                setIsPlaying(true);
              }}
              className="border border-stone-700 px-3 py-2 text-stone-400 transition-colors hover:border-stone-500 hover:text-stone-200"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2 border border-stone-800 px-3 py-2">
            <span className="text-[10px] font-light tracking-[0.2em] text-stone-500">SPEED</span>
            {[1, 2, 5].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={speed === s ? 'text-xs font-light tracking-[0.14em] text-gold-matte' : 'text-xs font-light tracking-[0.14em] text-stone-500 hover:text-stone-300'}
              >
                {s}x
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setCurrentStep(events.length - 1);
              setIsPlaying(false);
            }}
            className="flex items-center gap-2 border border-stone-700 px-3 py-2 text-xs tracking-wider text-stone-400 transition-colors hover:border-stone-500 hover:text-stone-200"
          >
            <SkipForward size={14} />
            SKIP
          </button>
        </div>
        <div ref={scrollRef} className="h-28 overflow-y-auto border border-stone-800 bg-black/60 p-3 text-[11px] font-light tracking-[0.08em]">
          {events.slice(0, currentStep + 1).map((event, i) => (
            <div key={i} className={`flex items-center gap-2 ${event.round === currentEvent?.round ? 'text-stone-300' : 'text-stone-600'}`}>
              <span className="w-8 shrink-0">[{event.round}]</span>
              <span className={event.attacker === 'A' ? 'text-gold-matte/90' : 'text-stone-300'}>
                {event.attacker === 'A' ? heroA.character.name : heroB.character.name}
              </span>
              <span>{event.skillName || 'Attack'}</span>
              {event.damage > 0 && <span className="text-stone-400">-{event.damage}</span>}
              {event.isCrit && <span className="text-gold-matte">CRIT</span>}
              {event.isMiss && <span className="text-stone-500">MISS</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
