import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Gem, Search, Shield, X } from 'lucide-react';
import { DepthPreview } from './DepthPreview';
import type { Rarity } from '../lib/gameLogic';
import type { RelicCategory } from '../lib/relics';
import type { RelicDefinition, RelicKind } from '../types';
import './VaultItems.css';

export type VaultItem = {
  id: string;
  name: string;
  rarity: Rarity;
  family: string;
  kind: RelicKind;
  amount: number;
  icon?: string | null;
  category: RelicCategory;
  definition?: RelicDefinition;
};

function ItemArt({ item }: { item: VaultItem }) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const showIcon = item.icon && failedIcon !== item.icon;
  return <span className="vault-item-art">
    {!showIcon && (item.kind === 'relic' ? <Shield size={28} /> : <Gem size={20} />)}
    {showIcon && <img src={item.icon!} alt="" loading="lazy" onError={() => setFailedIcon(item.icon!)} />}
  </span>;
}

function ItemDetail({ item, onClose, onUse }: { item: VaultItem; onClose: () => void; onUse: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdrop = useRef(false);
  const titleId = useId();
  const material = item.kind === 'shard';
  useEffect(() => {
    const element = dialog.current;
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = overflow; focus?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className={`vault-item-detail ${material ? 'is-material' : 'is-relic'}`} aria-labelledby={titleId} aria-modal="true"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onPointerDown={(event) => { backdrop.current = event.target === event.currentTarget; }}
    onClick={(event) => { if (backdrop.current && event.target === event.currentTarget) onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'));
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    }}>
    <div className="vault-item-detail__surface">
      <header><span>{material ? 'Shard / Enchant material' : 'Relic / Equipment'}</span><button type="button" aria-label="Close item details" onClick={onClose}><X size={18} /></button></header>
      <div className="vault-item-detail__body">
        <div className="vault-item-detail__preview">
          <DepthPreview label={item.name} material={material} variant="item">
            <div className="vault-item-detail__art"><ItemArt item={item} /></div>
          </DepthPreview>
          <p className="vault-item-detail__quantity">{item.amount.toLocaleString('en-US')} {material ? 'in stock' : 'owned'}</p>
        </div>
        <div className="vault-item-detail__content">
          <span className="vault-item-rarity" data-rarity={item.rarity}>{item.rarity} · {item.family}</span>
          <h2 id={titleId}>{item.name}</h2>
          <p className="vault-item-detail__purpose">{material ? 'A consumable material for enchanting. Binding uses one shard from this stack.' : 'A standalone equipment item. Choose a hero and equip it in their relic slot.'}</p>
          <dl>
            <div><dt>{material ? 'Enchant affinity' : 'Equipment category'}</dt><dd>{material ? item.definition?.forge_bias || item.family : item.category}</dd></div>
            {!material && item.definition?.battle_bias && <div><dt>Battle affinity</dt><dd>{item.definition.battle_bias}</dd></div>}
            <div><dt>Effect</dt><dd>{item.definition?.effect_profile || 'No effect recorded.'}</dd></div>
          </dl>
          {item.definition?.lore_summary && <p className="vault-item-detail__lore">{item.definition.lore_summary}</p>}
          <button type="button" className="vault-item-detail__use" disabled={item.amount <= 0} onClick={onUse}>{item.amount <= 0 ? 'Out of stock' : material ? 'Open Enchant' : 'Choose a card to equip'}</button>
        </div>
      </div>
    </div>
  </dialog>;
}

function ItemPages({ page, count, onChange, label }: { page: number; count: number; onChange: (page: number) => void; label: string }) {
  if (count <= 1) return null;
  return <div className="vault-items__pages"><button type="button" aria-label={`Previous ${label} page`} disabled={page === 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /></button><span>{page} / {count}</span><button type="button" aria-label={`Next ${label} page`} disabled={page === count} onClick={() => onChange(page + 1)}><ChevronRight size={16} /></button></div>;
}

export function VaultItems({ items, onOpenCards, onOpenEnchant }: { items: VaultItem[]; onOpenCards: () => void; onOpenEnchant: () => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<RelicKind | 'all'>('all');
  const [category, setCategory] = useState<RelicCategory | 'all'>('all');
  const [relicPage, setRelicPage] = useState(1);
  const [shardPage, setShardPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const selected = items.find((item) => item.id === selectedId);
  const needle = query.trim().toLowerCase();
  const matches = items.filter((item) => !needle || [item.name, item.family, item.category, item.definition?.effect_profile || ''].some((value) => value.toLowerCase().includes(needle)));
  const relics = matches.filter((item) => item.kind === 'relic' && (category === 'all' || item.category === category));
  const shards = matches.filter((item) => item.kind === 'shard');
  const relicPages = Math.max(1, Math.ceil(relics.length / 8));
  const shardPages = Math.max(1, Math.ceil(shards.length / 12));
  const safeRelicPage = Math.min(relicPage, relicPages);
  const safeShardPage = Math.min(shardPage, shardPages);
  return <section className="vault-items" aria-label="Item inventory">
    <div className="vault-items__toolbar">
      <div className="vault-items__filters" role="group" aria-label="Item type">
        {(['all', 'relic', 'shard'] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setRelicPage(1); setShardPage(1); }}>{value === 'all' ? 'All items' : value === 'relic' ? 'Relics' : 'Shards'}</button>)}
      </div>
      <label className="vault-items__search"><Search size={15} /><input aria-label="Search items" placeholder="Search items, affinities…" value={query} onChange={(event) => { setQuery(event.target.value); setRelicPage(1); setShardPage(1); }} /></label>
    </div>
    {kind !== 'shard' && <section className="vault-items__relic-section" aria-label="Relic collection">
      <div className="vault-items__section-heading"><div><span className="vault-items__eyebrow">Equipment collection</span><h2><Shield size={20} />Relics <small>{relics.length}</small></h2><p>Individual pieces of power, ready for a hero’s relic slot.</p></div>
        <label className="vault-items__category">Relic category<select value={category} onChange={(event) => { setCategory(event.target.value as RelicCategory | 'all'); setRelicPage(1); }}><option value="all">All categories</option>{['weapon', 'armor', 'accessory', 'artifact'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      {relics.length ? <div className="vault-items__relic-grid">{relics.slice((safeRelicPage - 1) * 8, safeRelicPage * 8).map((item) => <button type="button" key={item.id} className="vault-relic" aria-label={`Inspect relic ${item.name}`} onClick={() => setSelectedId(item.id)}>
        <span className="vault-relic__meta"><span className="vault-item-rarity" data-rarity={item.rarity}>{item.rarity}</span><span>{item.amount} owned</span></span>
        <ItemArt item={item} /><span className="vault-relic__identity"><strong>{item.name}</strong><span>{item.category} · {item.family}</span></span>
      </button>)}</div> : <p className="vault-items__empty">{items.some((item) => item.kind === 'relic') ? 'No relics match these filters.' : 'No relics in your inventory yet.'}</p>}
      <ItemPages page={safeRelicPage} count={relicPages} onChange={setRelicPage} label="relics" />
    </section>}
    {kind !== 'relic' && <section className="vault-items__shard-section" aria-label="Shard materials">
      <div className="vault-items__section-heading"><div><span className="vault-items__eyebrow">Material stock</span><h2><Gem size={18} />Shards <small>{shards.length} types</small></h2><p>Stackable materials consumed when you enchant a card.</p></div><span className="vault-items__stock">{shards.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-US')} in stock</span></div>
      {shards.length ? <div className="vault-items__shard-grid">{shards.slice((safeShardPage - 1) * 12, safeShardPage * 12).map((item) => <button type="button" key={item.id} className="vault-shard" aria-label={`Inspect shard ${item.name}`} onClick={() => setSelectedId(item.id)}>
        <ItemArt item={item} /><span className="vault-shard__identity"><strong>{item.name}</strong><span>{item.family} · Material</span></span><span className="vault-shard__amount">×{item.amount}</span>
      </button>)}</div> : <p className="vault-items__empty">{items.some((item) => item.kind === 'shard') ? 'No shards match this search.' : 'No shards in stock yet.'}</p>}
      <ItemPages page={safeShardPage} count={shardPages} onChange={setShardPage} label="shards" />
    </section>}
    {selected && <ItemDetail key={selected.id} item={selected} onClose={() => setSelectedId('')} onUse={() => { setSelectedId(''); if (selected.kind === 'shard') onOpenEnchant(); else onOpenCards(); }} />}
  </section>;
}
