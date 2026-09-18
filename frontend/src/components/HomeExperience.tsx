import { useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionStyle } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SavedHero } from '../types';
import type { GameSectionKey } from './GameShell';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import { resolveRarity, toNumber } from '../lib/gameLogic';
import { mockHeroes } from '../lib/mockContent';
import arenaHall from '../assets/battle/arena-hall-perspective.png';
import './HomeExperience.css';

const examples = ['Kharos', 'Myrr', 'Aurelia'].map(name => mockHeroes.find(hero => hero.character.name === name)!).filter(Boolean);

function ShowcaseCard({ hero, example = false }: { hero: SavedHero; example?: boolean }) {
  return <div className="home-hero-card">
    <img src={hero.image || CARD_FALLBACK_SRC} alt={hero.character.name} draggable={false} onError={event => { if (event.currentTarget.getAttribute('src') !== CARD_FALLBACK_SRC) event.currentTarget.src = CARD_FALLBACK_SRC; }} />
    <span className="home-hero-card__rarity">{example ? 'Hero study' : resolveRarity(hero.character)}</span>
    <div className="home-hero-card__identity"><span>{hero.character.state.TYPE}</span><h3>{hero.character.name}</h3>
      <div className="home-hero-card__stats">{(['BP', 'HP', 'ATK'] as const).map(key => <div key={key}><span>{key}</span><strong>{toNumber(key === 'BP' ? hero.character.BP : hero.character.state[key]).toLocaleString()}</strong></div>)}</div>
    </div>
    <div className="home-hero-card__reflection" aria-hidden="true" />
  </div>;
}

function HeroChamber({ heroes, example, onInspect, onCreate }: { heroes: SavedHero[]; example: boolean; onInspect: (id: string) => void; onCreate: () => void }) {
  const [selectedId, setSelectedId] = useState(heroes[0]?.id);
  const active = Math.max(0, heroes.findIndex(hero => hero.id === selectedId));
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0), y = useMotionValue(0);
  const rotateY = useSpring(x, { stiffness: 65, damping: 22 });
  const rotateX = useSpring(y, { stiffness: 65, damping: 22 });
  const light = useTransform(rotateY, [-10, 10], ['15%', '85%']);
  const move = (direction: number) => setSelectedId(heroes[(active + direction + heroes.length) % heroes.length]?.id);
  const displayed = heroes.length > 2 ? [-1, 0, 1] : heroes.length === 2 ? [0, 1] : heroes.length ? [0] : [];
  return <div className="home-chamber" onPointerMove={event => {
    if (reducedMotion || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set(((event.clientX - bounds.left) / bounds.width - .5) * 14);
    y.set(-((event.clientY - bounds.top) / bounds.height - .5) * 8);
  }} onPointerLeave={() => { x.set(0); y.set(0); }}>
    <div className="home-chamber__beam" aria-hidden="true" />
    <div className="home-chamber__floor" aria-hidden="true"><i /><i /><img src="/logo.png" alt="" /></div>
    <div className="home-chamber__dust" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i key={index} style={{ '--i': index, left: `${(index * 37 + 11) % 100}%`, top: `${(index * 23 + 7) % 90}%` } as CSSProperties} />)}</div>
    <motion.div className="home-chamber__cards" style={{ rotateX, rotateY, '--home-light': light } as MotionStyle}>
      {displayed.map(offset => {
        const hero = heroes[(active + offset + heroes.length) % heroes.length];
        return <button key={`slot-${offset}`} type="button" className={`home-chamber__card home-chamber__card--${offset === 0 ? 'center' : offset < 0 ? 'left' : 'right'}`} onClick={() => offset === 0 ? onInspect(hero.id) : setSelectedId(hero.id)} aria-label={offset === 0 ? example ? 'Create your own hero' : `Inspect ${hero.character.name}` : `Show ${hero.character.name}`}>
          <ShowcaseCard hero={hero} example={example} />
        </button>;
      })}
      {!heroes.length && <button type="button" className="home-chamber__empty" onClick={onCreate}><img src="/logo.png" alt="HEROFORGE" /><span>Your first legend<br /><em>starts with an image.</em></span><small>Open the forge <ArrowRight size={14} /></small></button>}
    </motion.div>
    <div className="home-chamber__caption">
      <button type="button" aria-label="Previous hero" disabled={heroes.length < 2} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
      <span>{example ? 'Illustrative heroes' : heroes.length ? 'From your vault' : 'An unwritten legend'}<small>{heroes.length ? `${String(active + 1).padStart(2, '0')} / ${String(heroes.length).padStart(2, '0')}` : 'IMAGE → HERO'}</small></span>
      <button type="button" aria-label="Next hero" disabled={heroes.length < 2} onClick={() => move(1)}><ChevronRight size={18} /></button>
    </div>
  </div>;
}

export function HomeExperience({ playerName, heroes = [], dust = 0, relics = 0, daily, onJoin, onNavigate, onInspect, onFriends }: {
  playerName?: string; heroes?: SavedHero[]; dust?: number; relics?: number; daily?: ReactNode;
  onJoin: () => void; onNavigate: (section: GameSectionKey) => void; onInspect: (id: string) => void; onFriends: () => void;
}) {
  const signedIn = playerName !== undefined;
  const collection = [...heroes].sort((a, b) => b.createdAt - a.createdAt);
  const roster = signedIn ? collection : examples;
  const ready = heroes.some(hero => hero.pvpLifeState !== 'pvp_dead' && !hero.lockedReason);
  const enter = () => signedIn ? onNavigate('forge') : onJoin();
  return <div className={`home-experience ${signedIn ? 'home-experience--member' : 'home-experience--guest'}`}>
    <section className="home-opening" aria-label={signedIn ? 'Your hero chamber' : 'Discover HEROFORGE'}>
      <div className="home-opening__ambient" aria-hidden="true" />
      <div className="home-opening__copy">
        <div className="home-wordmark"><img src="/logo.png" alt="" /><span>HEROFORGE</span></div>
        <p className="home-eyebrow">{signedIn ? `Welcome back, ${playerName}` : 'An image. A hero. A world of rivals.'}</p>
        <h1>{signedIn ? heroes.length ? <>Your legends.<br /><em>The next chapter.</em></> : <>A place for<br /><em>your first legend.</em></> : <>Imagination,<br /><em>made playable.</em></>}</h1>
        <p className="home-opening__description">{signedIn ? heroes.length ? 'They began as images. Now choose who you’ll take into battle — or bring someone new into the world.' : 'Give an image a life beyond the frame. Forge your first hero, discover their skills, and begin your collection.' : 'Upload a character image. Forge a hero with unique attributes and skills. Bring worlds and art styles together in tactical card battles.'}</p>
        <div className="home-actions"><button type="button" className="home-primary" onClick={signedIn && ready ? () => onNavigate('arena') : enter}>{signedIn && ready ? 'Enter the arena' : 'Forge your first hero'}<ArrowRight size={17} /></button><button type="button" className="home-text-link" onClick={signedIn ? () => onNavigate('vault') : () => document.getElementById('home-how-it-works')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}>{signedIn ? 'Explore your vault' : 'Discover how it works'}<span>↗</span></button></div>
        <div className="home-opening__footnote">{signedIn ? <><span><strong>{heroes.length}</strong> heroes</span><span><strong>{dust.toLocaleString()}</strong> dust</span><span><strong>{relics.toLocaleString()}</strong> items</span></> : <><span>From your image</span><span>Into your collection</span><span>Onto the battlefield</span></>}</div>
      </div>
      <HeroChamber heroes={roster} example={!signedIn} onInspect={signedIn ? onInspect : onJoin} onCreate={enter} />
      <div className="home-opening__edition" aria-hidden="true"><span>IMAGINATION HAS A FORM</span><span>EST. IN YOUR WORLD</span></div>
    </section>

    {signedIn ? <section className="home-member-content">
      <div className="home-destinations"><p className="home-eyebrow">Continue your story</p><h2>What comes next?</h2>
        <button type="button" onClick={() => onNavigate('forge')}><span className="home-route-number">01</span><div><h3>Bring another hero to life</h3><p>Upload an image, or enchant a hero you already own.</p></div><ArrowRight size={20} /></button>
        <button type="button" onClick={() => onNavigate('vault')}><span className="home-route-number">02</span><div><h3>Prepare your collection</h3><p>Study skills and equip relics for the battle ahead.</p></div><ArrowRight size={20} /></button>
        <button type="button" onClick={onFriends}><span className="home-route-number">03</span><div><h3>Find a worthy rival</h3><p>Challenge a friend. Let your heroes settle the rest.</p></div><ArrowRight size={20} /></button>
      </div>
      <aside className="home-ritual"><p className="home-eyebrow">A little progress, every day</p><h2>The daily ritual</h2>{daily}</aside>
    </section> : <section id="home-how-it-works" className="home-process">
      <div className="home-process__intro"><p className="home-eyebrow">From a picture to a presence</p><h2>Every hero begins<br />in <em>your world.</em></h2><p>A sketch, a portrait, a character you imagined.<br />Choose the image. Discover who it becomes.</p></div>
      <div className="home-process__steps">{[
        ['01', 'Upload your image', 'Choose a character in any art style. Your image becomes the face of your hero.'],
        ['02', 'Discover your hero', 'AI interprets the image to create attributes and skills. Collect the card and refine it with enchantments and relics.'],
        ['03', 'Make your move', 'Build a formation, select skills and targets, and send your heroes into battle.'],
      ].map(([number, title, description]) => <div key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></div>)}</div>
    </section>}

    <section className="home-arena-invitation" style={{ '--hall-image': `url(${arenaHall})` } as CSSProperties}>
      <div className="home-arena-invitation__scene" aria-hidden="true"><div className="home-arena-invitation__board">{[...examples.slice(0, 2), ...examples.slice(0, 2)].map((hero, index) => <div key={index} style={{ '--slot': index } as CSSProperties}><img loading="lazy" src={hero.image} alt="" /></div>)}<span>VS</span></div></div>
      <div className="home-arena-invitation__copy"><p className="home-eyebrow">Different worlds. One battlefield.</p><h2>Let the cards<br /><em>do the talking.</em></h2><p>Place your heroes. Choose your moment. Every skill has a target, and every move leaves its mark.</p><button type="button" className="home-text-link" onClick={signedIn ? () => onNavigate('arena') : onJoin}>{signedIn ? 'Prepare for battle' : 'Begin your story'}<ArrowRight size={17} /></button></div>
    </section>
    <footer className="home-colophon"><span>HEROFORGE</span><span>Yours to imagine. Yours to forge.</span><button type="button" onClick={enter}>The forge awaits <ArrowRight size={13} /></button></footer>
  </div>;
}
