import { useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AuthUser, BattleHistoryRecord, EconomySnapshot, LadderSnapshot, SavedHero } from '../types';
import { resolveRarity, toNumber } from '../lib/gameLogic';
import type { GameSectionKey } from './GameShell';
import './PlayerProfile.css';

type Props = {
  user: AuthUser; heroes: SavedHero[]; dust: number; relics: number;
  economy: EconomySnapshot | null; ladder: LadderSnapshot | null;
  history: BattleHistoryRecord[] | null; historyError: string | null; ladderError: string | null;
  demo: boolean; retry: () => void; onNavigate: (section: GameSectionKey) => void;
  onInspect: (id: string) => void; onReplay: (record: BattleHistoryRecord) => void;
};
const rarities = ['common', 'rare', 'epic', 'mythic'] as const;
const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function PlayerProfile({ user, heroes, dust, relics, economy, ladder, history, historyError, ladderError, demo, retry, onNavigate, onInspect, onReplay }: Props) {
  const [page, setPage] = useState(0);
  const name = user.email.split('@')[0];
  const collection = heroes.filter(hero => hero.cardStatus !== 'decomposed');
  const strongest = [...collection].sort((a, b) => toNumber(b.character.BP) - toNumber(a.character.BP)).slice(0, 3);
  const record = demo ? null : ladder?.record;
  const results = demo ? [] : (ladder?.recent_matches ?? []).slice(0, 12).reverse();
  const transactions = (economy?.transactions ?? []).slice(0, 6);
  const maxPage = Math.max(0, Math.ceil((history?.length ?? 0) / 5) - 1);
  const currentPage = Math.min(page, maxPage);
  const counts = rarities.map(rarity => ({ rarity, count: collection.filter(hero => resolveRarity(hero.character) === rarity).length }));
  const wins = record?.wins ?? 0, losses = record?.losses ?? 0, ties = record?.ties ?? 0;
  const total = wins + losses + ties;
  const winAngle = total ? wins / total * 360 : 0;
  const lossAngle = total ? (wins + losses) / total * 360 : 0;
  return <main className="player-profile">
    <header className="profile-identity">
      <div className="profile-monogram" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</div>
      <div className="profile-identity__name"><span className="profile-kicker">Player archive · {demo ? 'Local simulation' : 'Founders beta'}</span><h1>{name}</h1><p>{user.email}</p></div>
      <button className="profile-link" onClick={() => onNavigate('settings')}>Account settings <ArrowRight size={16} /></button>
    </header>
    <dl className="profile-ledger" aria-label="Account resources">
      <div><dt>Hero collection</dt><dd>{collection.length.toLocaleString()} <small>cards</small></dd></div>
      <div><dt>Dust balance</dt><dd>{dust.toLocaleString()} <small>dust</small></dd></div>
      <div><dt>Item inventory</dt><dd>{relics.toLocaleString()} <small>items</small></dd></div>
    </dl>
    <div className="profile-columns">
      <section className="profile-combat" aria-labelledby="profile-combat-title">
        <div className="profile-section-heading"><div><span className="profile-kicker">01 / Arena</span><h2 id="profile-combat-title">A record of battle.</h2></div><button className="profile-link" onClick={() => onNavigate('arena')}>Enter Arena <ArrowRight size={15} /></button></div>
        {ladderError && !demo ? <div className="profile-empty" role="status">{ladderError}<button className="profile-link" onClick={retry}>Try again</button></div> : <>
          <div className="profile-combat__summary">
            <div className="profile-win-ring" role="img" aria-label={total ? `${wins} wins, ${losses} losses, ${ties} draws. ${ladder?.win_rate}% win rate.` : 'No ranked matches recorded'} style={{ background: `conic-gradient(#baa06d 0deg ${winAngle}deg, #955f56 ${winAngle}deg ${lossAngle}deg, #6b7473 ${lossAngle}deg ${total ? 360 : 0}deg, #292923 ${total ? 360 : 0}deg 360deg)` }}><div><strong>{total ? `${ladder?.win_rate}%` : '—'}</strong><span>Win rate</span></div></div>
            <div className="profile-ranking"><span className="profile-kicker">{demo ? 'Unranked · Simulation' : ladder ? ladder.tier : 'Loading rank'}</span><strong>{demo ? '—' : ladder?.rating.toLocaleString() ?? '—'}</strong><p>{record ? `${record.played} ranked matches played` : demo ? 'Simulation does not affect your rank.' : 'Retrieving your Arena record…'}</p><dl className="profile-record"><div><dt>Wins</dt><dd>{record ? wins : '—'}</dd></div><div><dt>Losses</dt><dd>{record ? losses : '—'}</dd></div><div><dt>Draws</dt><dd>{record ? ties : '—'}</dd></div></dl></div>
          </div>
          <div className="profile-form"><span className="profile-kicker">Recent form · oldest to newest</span><div className="profile-form__marks">{results.length ? results.map((match, index) => <span key={match.id} data-result={match.result} title={`${match.result} · ${match.rating_delta >= 0 ? '+' : ''}${match.rating_delta} rating`} aria-label={`Match ${index + 1}: ${match.result}, ${match.rating_delta} rating`}>{match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'D'}</span>) : <p>No ranked results yet.</p>}</div></div>
        </>}
      </section>
      <section className="profile-collection" aria-labelledby="profile-collection-title">
        <div className="profile-section-heading"><div><span className="profile-kicker">02 / Vault</span><h2 id="profile-collection-title">Your collected worlds.</h2></div><button className="profile-link" onClick={() => onNavigate('vault')}>Open vault <ArrowRight size={15} /></button></div>
        <div className="profile-rarity" role="img" aria-label={counts.map(item => `${item.count} ${item.rarity}`).join(', ')}>{counts.filter(item => item.count).map(item => <span key={item.rarity} data-rarity={item.rarity} style={{ flex: item.count }} />)}</div>
        <dl className="profile-rarity-legend">{counts.map(item => <div key={item.rarity}><dt><i data-rarity={item.rarity} />{item.rarity}</dt><dd>{item.count}</dd></div>)}</dl>
        <div className="profile-section-heading profile-section-heading--small"><span className="profile-kicker">Strongest heroes · by BP</span><span>{strongest.length ? `${strongest[0].character.BP} best BP` : 'Forge your first hero'}</span></div>
        <div className="profile-heroes">{strongest.map(hero => <button key={hero.id} onClick={() => onInspect(hero.id)} aria-label={`Inspect ${hero.character.name}`}><div className="profile-heroes__art">{hero.image && <img src={hero.image} alt="" />}<span>{resolveRarity(hero.character)}</span><strong>{hero.character.name}</strong></div><span>{toNumber(hero.character.BP).toLocaleString()} BP <ArrowRight size={12} /></span></button>)}</div>
        {!strongest.length && <p className="profile-empty">Upload an image in the Forge to begin your collection.<button className="profile-link" onClick={() => onNavigate('forge')}>Create a hero <ArrowRight size={15} /></button></p>}
      </section>
    </div>
    <div className="profile-columns profile-columns--history">
      <section aria-labelledby="profile-history-title"><div className="profile-section-heading"><div><span className="profile-kicker">03 / Chronicle</span><h2 id="profile-history-title">Recent encounters.</h2></div><span className="profile-kicker">{history?.length ?? 0} saved</span></div>
        {historyError ? <div className="profile-empty" role="alert">{historyError}<button className="profile-link" onClick={retry}>Try again</button></div> : history === null ? <p className="profile-empty" role="status">Loading battle history…</p> : !history.length ? <p className="profile-empty">{demo ? 'Local battles do not create a live combat record.' : 'Your next completed battle will appear here with its replay.'}</p> : <><div className="profile-battles">{history.slice(currentPage * 5, currentPage * 5 + 5).map(battle => <button key={battle.id} onClick={() => onReplay(battle)}><span className="profile-battles__date">{dateLabel(battle.created_at)}</span><span><small>{battle.battle_type.replaceAll('_', ' ')}</small><strong>{battle.result?.board ? `${battle.result.board.bottomLabel} vs ${battle.result.board.topLabel}` : 'Battle record'}</strong></span><span className="profile-battles__result">{battle.result?.winnerLabel ?? 'Resolved'}<small>Watch replay ↗</small></span></button>)}</div><nav className="profile-pagination" aria-label="Battle history pages"><button disabled={currentPage === 0} aria-label="Previous battles" onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>{currentPage + 1} / {maxPage + 1}</span><button disabled={currentPage === maxPage} aria-label="Next battles" onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></nav></>}
      </section>
      <section aria-labelledby="profile-activity-title"><div className="profile-section-heading"><div><span className="profile-kicker">04 / Ledger</span><h2 id="profile-activity-title">Recent activity.</h2></div></div><ol className="profile-activity">{transactions.map(tx => <li key={tx.id}><span className="profile-activity__dot" aria-hidden="true" /><div><strong>{tx.reason.replaceAll('_', ' ')}</strong><small>{dateLabel(tx.created_at)}</small></div><span data-gain={tx.delta >= 0}>{tx.delta >= 0 ? '+' : ''}{tx.delta.toLocaleString()}<small>{tx.resource_type === 'dust' ? 'Dust' : tx.resource_key?.replaceAll('_', ' ') ?? tx.resource_type}</small></span></li>)}</ol>{!transactions.length && <p className="profile-empty">Forge, battle and trade activity will appear here.</p>}</section>
    </div>
  </main>;
}
