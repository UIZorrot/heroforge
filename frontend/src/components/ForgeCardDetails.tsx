import { ChevronDown } from 'lucide-react';
import { resolveRarity, type CharacterData, type Skill } from '../lib/gameLogic';

const attributes = [
  ['HP', 'Health'], ['MP', 'Mana'], ['ATK', 'Attack'], ['DEF', 'Defense'],
  ['SPEED', 'Speed'], ['CC', 'Critical rating'], ['CA', 'Critical damage'],
  ['PI', 'Armor penetration'], ['EV', 'Evasion'], ['AC', 'Accuracy'],
] as const;
const effects = [
  ['DMG', 'Damage'], ['BUFF_HP', 'HP effect'], ['BUFF_MP', 'MP effect'],
  ['BUFF_DMG', 'Attack effect'], ['BUFF_CC', 'Critical effect'], ['BUFF_DEF', 'Defense effect'],
  ['BUFF_EV', 'Evasion effect'], ['BUFF_AC', 'Accuracy effect'],
] as const;
const label = (value: unknown) => String(value ?? '').replace(/_/g, ' ').trim() || '—';
const numeric = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat('en-US').format(parsed) : label(value);
};
const truthy = (value: unknown) => ['true', '1'].includes(String(value).toLowerCase());

function SkillDetails({ skill, index }: { skill: Skill; index: number }) {
  const activeEffects = effects.filter(([key]) => Number.isFinite(Number(skill[key])) && Number(skill[key]) !== 0);
  const duration = Number(skill.BUFF_TIME);
  return <article className="forge-details__skill">
    <header><span className="forge-details__skill-number">{String(index + 1).padStart(2, '0')}</span>
      <div><span className="forge-details__kicker">{truthy(skill.IS_PASSIVE) ? 'Opening passive' : 'Active'}{skill.ROLE ? ` · ${label(skill.ROLE)}` : ''}</span><h4>{skill.name || 'Unnamed skill'}</h4></div>
      <span className="forge-details__mana">{numeric(skill.MP_COST)} <small>MP</small></span>
    </header>
    <p>{skill.description || 'No description available.'}</p>
    <dl className="forge-details__skill-facts">
      <div><dt>Target</dt><dd>{label(skill.TARGET)}</dd></div>
      <div><dt>Targets</dt><dd>{numeric(skill.TARGET_NUM)}</dd></div>
      {skill.RANGE && <div><dt>Range</dt><dd>{label(skill.RANGE)}</dd></div>}
      {skill.TYPE && <div><dt>Type</dt><dd>{label(skill.TYPE)}</dd></div>}
      {activeEffects.map(([key, name]) => <div key={key}><dt>{name}</dt><dd>{numeric(skill[key])}</dd></div>)}
      {skill.BUFF_NAME && <div><dt>Status</dt><dd>{label(skill.BUFF_NAME)}</dd></div>}
      {truthy(skill.IS_PASSIVE) && <div><dt>Trigger</dt><dd>Once at battle start · no action cost</dd></div>}
      {duration > 0 && <div><dt>Duration</dt><dd>{duration} {skill.BUFF_NAME === 'stun' || truthy(skill.IS_STUN) ? 'skipped action(s)' : 'round(s)'}</dd></div>}
      {truthy(skill.IS_STUN) && <div><dt>Stun</dt><dd>Yes</dd></div>}
    </dl>
  </article>;
}

export function ForgeCardDetails({ hero }: { hero: CharacterData }) {
  const skills = Object.entries(hero.skill ?? {}).filter(([, skill]) => Boolean(skill));
  return <details className="forge-details">
    <summary><div><span className="forge-details__kicker">Inspect your hero</span><span className="forge-details__title">Attributes &amp; skills</span></div><span className="forge-details__summary-meta">{skills.length} {skills.length === 1 ? 'skill' : 'skills'}<ChevronDown size={18} /></span></summary>
    <div className="forge-details__body">
      <section className="forge-details__attributes" aria-label="Hero attributes">
        <span className="forge-details__kicker">{resolveRarity(hero)} · {label(hero.state.TYPE)}</span>
        <h3>{hero.name}</h3><p>{hero.description}</p>
        <div className="forge-details__power"><span>Battle power</span><strong>{numeric(hero.BP)}</strong></div>
        <dl className="forge-details__stat-grid">{attributes.map(([key, name]) => <div key={key}><dt>{name}<small>{key}</small></dt><dd>{numeric(hero.state[key])}</dd></div>)}</dl>
        {hero.extra && <p className="forge-details__lore">{hero.extra}</p>}
      </section>
      <section aria-label="Hero skills" className="forge-details__skills"><h3>Skills</h3>{skills.map(([key, skill], index) => <SkillDetails key={key} skill={skill} index={index} />)}{!skills.length && <p>No skill details available.</p>}</section>
    </div>
  </details>;
}
