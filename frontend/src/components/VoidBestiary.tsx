import { useState } from 'react';
import type { PveCreature } from '../lib/pveTypes';

export function VoidBestiary({ creatures }: { creatures: PveCreature[] }) {
  const [chosen, setChosen] = useState('boss');
  const creature = creatures.find(entry => entry.id === chosen) ?? creatures[0];
  if (!creature) return null;
  return <section className="void-bestiary" aria-label="Creatures of the labyrinth">
    <div className="void-bestiary__portrait" key={creature.id}><img src={`/art/void-labyrinth/${creature.id}-v2.webp`} alt={creature.name} loading="lazy" /><span aria-hidden="true">FIELD NOTES / {String(creatures.indexOf(creature) + 1).padStart(2, '0')}</span></div>
    <div className="void-bestiary__notes"><p className="void-eyebrow">Things that remember you</p><h2>Bestiary</h2>
      <div className="void-bestiary__index" role="group" aria-label="Choose a creature">{creatures.map(entry => <button type="button" key={entry.id} aria-pressed={creature.id === entry.id} aria-label={entry.name} onClick={() => setChosen(entry.id)}><img src={`/art/void-labyrinth/${entry.id}-v2.webp`} alt="" loading="lazy" /></button>)}</div>
      <div aria-live="polite" aria-atomic="true"><p className="void-bestiary__role">{creature.role}</p><h3>{creature.name}</h3><p className="void-bestiary__lore">{creature.lore}</p><div className="void-bestiary__tactic"><span>Know your enemy</span><p>{creature.tactic}</p></div></div>
      <p className="void-bestiary__footnote">Nine creatures. One place that wants to forget you.</p>
    </div>
  </section>;
}
