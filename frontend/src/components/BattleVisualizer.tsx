
import React, { useEffect, useState, useRef } from 'react';
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
  x: [0, -10, 10, -10, 10, 0],
  transition: { duration: 0.4 },
};

const ATTACK_RIGHT = {
  x: [0, 100, 0],
  transition: { duration: 0.3, times: [0, 0.5, 1] },
};

const ATTACK_LEFT = {
  x: [0, -100, 0],
  transition: { duration: 0.3, times: [0, 0.5, 1] },
};

export const BattleVisualizer: React.FC<BattleVisualizerProps> = ({ heroA, heroB, events, onClose }) => {
  const [currentStep, setCurrentStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentEvent = currentStep >= 0 && currentStep < events.length ? events[currentStep] : null;
  
  // Initial HP
  const maxHpA = Math.max(1, parseInt(heroA.character.state.HP));
  const maxHpB = Math.max(1, parseInt(heroB.character.state.HP));
  const baseMaxMpA = Math.max(0, parseInt(heroA.character.state.MP));
  const baseMaxMpB = Math.max(0, parseInt(heroB.character.state.MP));
  const maxMpA = Math.max(1, currentEvent?.maxMpA ?? baseMaxMpA);
  const maxMpB = Math.max(1, currentEvent?.maxMpB ?? baseMaxMpB);
  
  // Current HP
  const hpA = currentEvent ? currentEvent.hpA : maxHpA;
  const hpB = currentEvent ? currentEvent.hpB : maxHpB;
  const mpA = currentEvent ? currentEvent.mpA : baseMaxMpA;
  const mpB = currentEvent ? currentEvent.mpB : baseMaxMpB;

  // Determine animations based on current event
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

  const getHealthColor = (current: number, max: number) => {
    const ratio = current / max;
    if (ratio > 0.6) return 'bg-green-500';
    if (ratio > 0.3) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  const getManaColor = (current: number, max: number) => {
    const ratio = current / max;
    if (ratio > 0.6) return 'bg-blue-500';
    if (ratio > 0.3) return 'bg-cyan-500';
    return 'bg-sky-700';
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-xl">
      {/* Header / Controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-slate-900/50 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Swords className="text-amber-500" />
            Battle Arena
          </h2>
          <div className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-sm font-mono">
            Round {currentEvent?.round || 1}
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
          <X size={24} />
        </button>
      </div>

      {/* Main Arena */}
      <div className="flex-1 w-full max-w-6xl flex items-center justify-between px-12 relative">
        
        {/* Player A */}
        <div className="flex flex-col items-center gap-4 relative z-10">
          <motion.div
            animate={isAttackA ? ATTACK_RIGHT : isHitA ? SHAKE_ANIMATION : {}}
            key={`hero-a-${currentStep}`} // Force re-render animation
          >
             <div className="relative group">
                {/* Status Effects Overlay */}
                {currentEvent?.isStunned && currentEvent.defender === 'A' && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/60 rounded-xl">
                    <Zap className="text-yellow-400 animate-pulse" size={48} />
                  </div>
                )}
                <HeroCard character={heroA.character} image={heroA.image} compact className="h-[305px] w-[240px]" />
             </div>
          </motion.div>
          
          {/* HP Bar A */}
          <div className="w-64 h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700 relative">
             <motion.div 
               className={`h-full ${getHealthColor(hpA, maxHpA)}`}
               initial={{ width: '100%' }}
               animate={{ width: `${(hpA / maxHpA) * 100}%` }}
               transition={{ type: 'spring', stiffness: 100 }}
             />
             <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-md">
               {hpA} / {maxHpA}
             </div>
          </div>
          <div className="w-64 h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700 relative">
             <motion.div 
               className={`h-full ${getManaColor(mpA, maxMpA)}`}
               initial={{ width: '100%' }}
               animate={{ width: `${(mpA / maxMpA) * 100}%` }}
               transition={{ type: 'spring', stiffness: 100 }}
             />
             <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-blue-100 drop-shadow-md">
               MP {mpA} / {maxMpA}
             </div>
          </div>
          
          {/* Floating Text A */}
          <AnimatePresence>
            {isHitA && (
              <motion.div
                initial={{ opacity: 1, y: 0, scale: 0.5 }}
                animate={{ opacity: 0, y: -100, scale: 1.5 }}
                exit={{ opacity: 0 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl font-black text-red-500 z-50 pointer-events-none drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
              >
                -{currentEvent.damage}
              </motion.div>
            )}
            {currentEvent?.defender === 'A' && currentEvent.isMiss && (
               <motion.div
               initial={{ opacity: 1, y: 0 }}
               animate={{ opacity: 0, y: -50 }}
               className="absolute top-0 text-2xl font-bold text-slate-400 z-50"
             >
               MISS
             </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* VS / Info Center */}
        <div className="flex flex-col items-center justify-center gap-4 z-0">
          <div className="text-6xl font-black text-slate-800/50 italic select-none">VS</div>
          
          {/* Action Log Display (Center) */}
          <AnimatePresence mode="wait">
            {currentEvent && (
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-slate-900/80 backdrop-blur border border-slate-700 px-6 py-3 rounded-xl text-center min-w-[300px]"
              >
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">
                  {currentEvent.attacker === 'A' ? heroA.character.name : heroB.character.name} acts
                </div>
                <div className="text-lg font-bold text-slate-200">
                  {currentEvent.skillName || 'Basic Attack'}
                </div>
                {currentEvent.mpCostApplied > 0 && <div className="text-cyan-300 font-bold text-sm">MP -{currentEvent.mpCostApplied}</div>}
                {currentEvent.isCrit && <div className="text-amber-400 font-bold text-sm">CRITICAL HIT!</div>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Player B */}
        <div className="flex flex-col items-center gap-4 relative z-10">
          <motion.div
            animate={isAttackB ? ATTACK_LEFT : isHitB ? SHAKE_ANIMATION : {}}
            key={`hero-b-${currentStep}`}
          >
             <div className="relative group">
                {currentEvent?.isStunned && currentEvent.defender === 'B' && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/60 rounded-xl">
                    <Zap className="text-yellow-400 animate-pulse" size={48} />
                  </div>
                )}
                <HeroCard character={heroB.character} image={heroB.image} compact className="h-[305px] w-[240px]" />
             </div>
          </motion.div>
          
          {/* HP Bar B */}
          <div className="w-64 h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700 relative">
             <motion.div 
               className={`h-full ${getHealthColor(hpB, maxHpB)}`}
               initial={{ width: '100%' }}
               animate={{ width: `${(hpB / maxHpB) * 100}%` }}
               transition={{ type: 'spring', stiffness: 100 }}
             />
             <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-md">
               {hpB} / {maxHpB}
             </div>
          </div>
          <div className="w-64 h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700 relative">
             <motion.div 
               className={`h-full ${getManaColor(mpB, maxMpB)}`}
               initial={{ width: '100%' }}
               animate={{ width: `${(mpB / maxMpB) * 100}%` }}
               transition={{ type: 'spring', stiffness: 100 }}
             />
             <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-blue-100 drop-shadow-md">
               MP {mpB} / {maxMpB}
             </div>
          </div>

           {/* Floating Text B */}
           <AnimatePresence>
            {isHitB && (
              <motion.div
                initial={{ opacity: 1, y: 0, scale: 0.5 }}
                animate={{ opacity: 0, y: -100, scale: 1.5 }}
                exit={{ opacity: 0 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl font-black text-red-500 z-50 pointer-events-none drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
              >
                -{currentEvent.damage}
              </motion.div>
            )}
             {currentEvent?.defender === 'B' && currentEvent.isMiss && (
               <motion.div
               initial={{ opacity: 1, y: 0 }}
               animate={{ opacity: 0, y: -50 }}
               className="absolute top-0 text-2xl font-bold text-slate-400 z-50"
             >
               MISS
             </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* Footer Controls */}
      <div className="w-full bg-slate-900 border-t border-slate-800 p-6 flex flex-col gap-4">
        {/* Timeline Slider */}
        <input 
          type="range" 
          min="-1" 
          max={events.length - 1} 
          value={currentStep}
          onChange={(e) => {
            setCurrentStep(parseInt(e.target.value));
            setIsPlaying(false);
          }}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
        />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
             <button 
               onClick={() => setIsPlaying(!isPlaying)}
               className="p-3 rounded-full bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors"
             >
               {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
             </button>
             
             <button 
               onClick={() => {
                 setCurrentStep(-1);
                 setIsPlaying(true);
               }}
               className="p-3 rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors"
             >
               <RotateCcw size={20} />
             </button>
          </div>

          <div className="flex items-center gap-4 bg-slate-800 rounded-full px-4 py-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Speed</span>
            {[1, 2, 5].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`text-sm font-bold px-2 py-1 rounded ${speed === s ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
             <button 
               onClick={() => {
                 setCurrentStep(events.length - 1);
                 setIsPlaying(false);
               }}
               className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
             >
               <SkipForward size={16} />
               Skip
             </button>
          </div>
        </div>

        {/* Scrollable Log */}
        <div 
          ref={scrollRef}
          className="h-32 overflow-y-auto bg-slate-950/50 rounded-lg p-4 font-mono text-xs text-slate-400 space-y-1 border border-slate-800"
        >
           {events.slice(0, currentStep + 1).map((event, i) => (
             <div key={i} className={`flex items-center gap-2 ${event.round === currentEvent?.round ? 'opacity-100' : 'opacity-50'}`}>
               <span className="text-slate-600 w-8">[R{event.round}]</span>
               <span className={event.attacker === 'A' ? 'text-amber-400' : 'text-violet-400'}>
                 {event.attacker === 'A' ? heroA.character.name : heroB.character.name}
               </span>
               <span className="text-slate-500">used</span>
               <span className="text-slate-300 font-bold">{event.skillName || 'Attack'}</span>
               {event.mpCostApplied > 0 && <span className="text-cyan-300 font-bold">MP-{event.mpCostApplied}</span>}
               {event.damage > 0 && (
                 <>
                   <span className="text-slate-500">for</span>
                   <span className="text-red-400 font-bold">{event.damage}</span>
                 </>
               )}
               {event.isCrit && <span className="text-yellow-500 font-bold">CRIT!</span>}
               {event.isMiss && <span className="text-slate-500 italic">Missed</span>}
               {event.isStunned && <span className="text-blue-400 font-bold">Stunned!</span>}
             </div>
           ))}
           <div className="h-4" />
        </div>
      </div>
    </div>
  );
};
