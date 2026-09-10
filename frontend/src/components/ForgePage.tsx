import { useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ImagePlus, RefreshCw, Shield, UploadCloud, WandSparkles, X } from 'lucide-react';
import { HeroCard } from './HeroCard';
import { CardCarousel } from './CardCarousel';
import { ForgeRitualDialog } from './ForgeRitualDialog';
import { PageHeader, PageHeaderStat } from './PageHeader';
import { toNumber, type CharacterData } from '../lib/gameLogic';
import { mockRelicCatalog, mockRelicInventory } from '../lib/mockContent';
import { getRelicIconSrc, getRelicKind } from '../lib/relics';
import type { EconomySnapshot, RelicDefinition, RelicKind, SavedHero } from '../types';

type ForgeStep = 'upload' | 'generate' | 'result';
export type ForgeSideKey = 'create' | 'enchant';

type ForgePageProps = {
  loading: boolean;
  error: string | null;
  resultImage: string | null;
  resultHero: CharacterData | null;
  heroes: SavedHero[];
  economy: EconomySnapshot | null;
  demoMode?: boolean;
  activeTab?: ForgeSideKey;
  onEnchantHero?: (heroId: string, relicId: string) => Promise<void> | void;
  onWashEnchant?: (heroId: string) => Promise<void> | void;
  onBreakHero?: (heroId: string) => Promise<number | null>;
  onGenerate: (file: File) => Promise<void> | void;
  onBreak: () => void;
};

type RelicOption = {
  id: string;
  name: string;
  tier: string;
  family: string;
  kind: RelicKind;
  amount: number;
  iconSrc?: string | null;
  definition?: RelicDefinition;
};

function relicOptions(economy: EconomySnapshot | null, demoMode: boolean): RelicOption[] {
  const sourceRelics = demoMode && (!economy || economy.relics.length === 0) ? mockRelicInventory : economy?.relics ?? [];
  const sourceCatalog = demoMode && (!economy || economy.relic_catalog.length === 0) ? mockRelicCatalog : economy?.relic_catalog ?? [];
  const catalog = Object.fromEntries(sourceCatalog.map((item) => [item.relic_type, item]));
  return sourceRelics.map((entry) => {
    const definition = catalog[entry.relic_type];
    return {
      id: entry.relic_type,
      name: definition?.display_name ?? entry.relic_type,
      tier: definition?.tier ?? 'common',
      family: definition?.family ?? 'Relic',
      kind: getRelicKind(definition ?? { relic_type: entry.relic_type }),
      amount: entry.amount,
      iconSrc: getRelicIconSrc(definition),
      definition,
    };
  });
}

function formatNumber(value: unknown) {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value || 0));
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(Number.isFinite(num) ? num : 0)));
}

function heroBp(hero: SavedHero) {
  return toNumber(hero.character.BP);
}

function inferStep(hasFile: boolean, loading: boolean, resultHero: CharacterData | null): ForgeStep {
  if (loading) return 'generate';
  if (resultHero) return 'result';
  if (hasFile) return 'generate';
  return 'upload';
}

function StepIndicator({ currentStep }: { currentStep: ForgeStep }) {
  const steps: Array<{ key: ForgeStep; title: string; description: string }> = [
    { key: 'upload', title: 'Upload', description: 'Add an image' },
    { key: 'generate', title: 'Generate', description: 'Forge your hero' },
    { key: 'result', title: 'Result', description: 'View and break' },
  ];
  const currentIndex = steps.findIndex((step) => step.key === currentStep);

  return (
    <div className="grid grid-cols-3 gap-6 border-b border-white/8 px-8 py-6">
      {steps.map((step, index) => {
        const active = step.key === currentStep;
        const complete = index < currentIndex;
        return (
          <div key={step.key} className="flex items-center gap-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm ${
                active
                  ? 'border-[#b49664] text-[#f0d8ad] shadow-[0_0_20px_rgba(180,150,100,0.18)]'
                  : complete
                    ? 'border-[#b49664]/40 bg-[#b49664]/10 text-[#d7a852]'
                    : 'border-white/12 text-stone-500'
              }`}
            >
              {complete ? <Check size={16} /> : index + 1}
            </div>
            <div>
              <div className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${active ? 'text-stone-100' : 'text-stone-500'}`}>
                {step.title}
              </div>
              <div className="mt-1 text-xs text-stone-500">{step.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


const shardTierTone: Record<string, { text: string; border: string; glow: string }> = {
  common: { text: 'text-stone-400', border: 'border-white/12', glow: '' },
  rare: { text: 'text-sky-300', border: 'border-sky-400/40', glow: 'shadow-[0_0_18px_rgba(56,189,248,0.12)]' },
  epic: { text: 'text-violet-300', border: 'border-violet-400/40', glow: 'shadow-[0_0_18px_rgba(167,139,250,0.14)]' },
  mythic: { text: 'text-[#d7a852]', border: 'border-[#b49664]/70', glow: 'shadow-[0_0_22px_rgba(180,150,100,0.16)]' },
  limited: { text: 'text-rose-300', border: 'border-rose-400/40', glow: 'shadow-[0_0_18px_rgba(251,113,133,0.14)]' },
};

function ShardTile({
  relic,
  active,
  disabled = false,
  onSelect,
}: {
  relic: RelicOption;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const tone = shardTierTone[relic.tier] ?? shardTierTone.common;
  const depleted = relic.amount <= 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled || depleted}
      className={`group relative aspect-square overflow-hidden border bg-[#090909] text-left transition ${
        disabled || depleted
          ? 'cursor-not-allowed border-white/8 opacity-35'
          : `hover:-translate-y-0.5 hover:border-stone-500 ${active ? `${tone.border} ${tone.glow}` : 'border-white/10'}`
      }`}
    >
      {relic.iconSrc ? (
        <img
          src={relic.iconSrc}
          alt={relic.name}
          className="absolute inset-0 h-full w-full object-cover object-center opacity-90 transition duration-200 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(180,150,100,0.12),transparent_42%)]">
          <WandSparkles size={22} className={tone.text} />
        </div>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.08)_35%,rgba(0,0,0,0.78)_100%)]" />
      <div className="relative flex h-full flex-col justify-between p-3">
        <div className="flex items-start justify-between gap-2">
          <span className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${tone.text}`}>{relic.tier}</span>
          <span className="border border-white/10 bg-black/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-stone-300">
            x{relic.amount}
          </span>
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-light text-stone-100">{relic.name}</div>
          <div className="mt-1 truncate text-[9px] uppercase tracking-[0.16em] text-stone-500">{relic.family}</div>
        </div>
      </div>
      {active && !disabled && !depleted && <div className="pointer-events-none absolute inset-0 border border-[#d7a852]" />}
    </button>
  );
}

function UploadStage({
  imagePreview,
  onPickFile,
  onClear,
}: {
  imagePreview: string | null;
  onPickFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = (file?: File | null) => {
    if (!file) return;
    onPickFile(file);
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        handleFile(event.dataTransfer.files?.[0]);
      }}
      className={`relative flex min-h-[560px] w-full flex-col items-center justify-center overflow-hidden border bg-black/25 text-center transition ${
        dragActive ? 'border-[#b49664]' : 'border-white/10 hover:border-stone-600'
      }`}
    >
      {imagePreview ? (
        <>
          <img src={imagePreview} alt="Upload preview" className="absolute inset-0 h-full w-full object-cover object-top opacity-55" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
            className="absolute right-5 top-5 border border-white/10 bg-black/60 p-2 text-stone-300 hover:border-[#b49664]/50"
            aria-label="Clear upload"
          >
            <X size={16} />
          </button>
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#d7a852]">Image uploaded</div>
            <div className="mt-3 text-2xl font-light tracking-[0.08em] text-stone-100">Ready for enchantment</div>
            <div className="mt-3 text-sm text-stone-400">Click to replace the image.</div>
          </div>
        </>
      ) : (
        <div>
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
            <ImagePlus size={28} className="text-stone-400" />
          </div>
          <div className="mt-6 text-[10px] uppercase tracking-[0.3em] text-[#d7a852]">Upload</div>
          <div className="mt-3 text-3xl font-light tracking-[0.12em] text-stone-100">Add an image</div>
          <div className="mt-4 text-sm leading-7 text-stone-500">Drop a character image here or click to browse.</div>
          <div className="mt-7 inline-flex items-center gap-2 border border-white/10 px-5 py-3 text-[10px] uppercase tracking-[0.22em] text-stone-300">
            <UploadCloud size={15} />
            Browse image
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </button>
  );
}

function GenerateStage() {
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center border border-white/10 bg-black/25 text-center">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-[#b49664]/25" />
        <div className="absolute inset-3 animate-spin rounded-full border border-[#b49664]/70 border-t-transparent" />
        <WandSparkles size={28} className="relative text-[#f0d8ad]" />
      </div>
      <div className="mt-7 text-[10px] uppercase tracking-[0.3em] text-[#d7a852]">Generate</div>
      <div className="mt-3 text-3xl font-light tracking-[0.12em] text-stone-100">Forging your hero</div>
      <div className="mt-4 max-w-md text-sm leading-7 text-stone-500">Analyzing image identity, resolving template intent, and applying rule-based stat generation.</div>
    </div>
  );
}

function ResultStage({
  hero,
  image,
  onBreak,
}: {
  hero: CharacterData | null;
  image: string | null;
  onBreak: () => void;
}) {
  return (
    <div className="flex min-h-[560px] flex-col items-center justify-center border border-white/10 bg-[radial-gradient(circle_at_50%_42%,rgba(180,150,100,0.10),rgba(0,0,0,0.18)_40%,rgba(0,0,0,0.48)_100%)] p-8">
      {hero ? (
        <>
          <HeroCard character={hero} image={image ?? undefined} className="w-[340px] max-w-full" />
          <button
            type="button"
            onClick={onBreak}
            className="mt-6 border border-white/12 px-8 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-200 transition hover:border-[#b49664]/50 hover:text-[#f0d8ad]"
          >
            <RefreshCw size={15} className="mr-2 inline-block" />
            Break
          </button>
        </>
      ) : (
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-600">Result</div>
          <div className="mt-3 text-2xl text-stone-300">No hero generated yet</div>
        </div>
      )}
    </div>
  );
}

function SummaryPanel({
  uploadedFile,
  uploadedPreview,
  resultHero,
  loading,
  error,
  onGenerateClick,
  onBreak,
}: {
  uploadedFile: File | null;
  uploadedPreview: string | null;
  resultHero: CharacterData | null;
  loading: boolean;
  error: string | null;
  onGenerateClick: () => void;
  onBreak: () => void;
}) {
  return (
    <aside className="border border-white/10 bg-[#0a0a0a]/88 p-6">
      <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-stone-400">Forging summary</div>
      <div className="mt-5 space-y-6">
        <div className="border-t border-white/8 pt-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Image</div>
          <div className="mt-4 flex items-center gap-4">
            <div className="h-12 w-12 overflow-hidden border border-white/10 bg-white/[0.03]">
              {uploadedPreview ? <img src={uploadedPreview} alt="Upload" className="h-full w-full object-cover" /> : <ImagePlus size={18} className="m-4 text-stone-600" />}
            </div>
            <div className="truncate text-sm text-stone-400">{uploadedFile?.name ?? 'No image uploaded'}</div>
          </div>
        </div>

        <div className="border-t border-white/8 pt-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Estimated output</div>
          <div className="mt-4 text-sm leading-7 text-stone-400">
            {resultHero ? `${resultHero.name} / ${formatNumber(resultHero.BP)} BP` : 'Image-based hero'}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={resultHero ? onBreak : onGenerateClick}
          disabled={!uploadedFile || loading}
          className="w-full bg-[#806838] px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-100 transition hover:bg-[#9a7d4a] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? 'Generating' : resultHero ? 'Break' : 'Generate'}
        </button>
      </div>
    </aside>
  );
}

function ManageEnchantStage({
  heroes,
  relics,
  onEnchantHero,
  onWashEnchant,
  onBreakHero,
  decomposePercent,
  error,
}: {
  error: string | null;
  decomposePercent: number;
  onBreakHero?: (heroId: string) => Promise<number | null>;
  heroes: SavedHero[];
  relics: RelicOption[];
  onEnchantHero?: (heroId: string, relicId: string) => Promise<void> | void;
  onWashEnchant?: (heroId: string) => Promise<void> | void;
}) {
  const [selectedHeroId, setSelectedHeroId] = useState(heroes[0]?.id ?? '');
  const [mode, setMode] = useState<'enchant' | 'break'>('enchant');
  const [notice, setNotice] = useState('');
  const [openHeroId, setOpenHeroId] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const shards = relics.filter((relic) => relic.kind === 'shard');
  const [selectedRelicId, setSelectedRelicId] = useState('');
  const selectedHero = heroes.find((hero) => hero.id === selectedHeroId) ?? heroes[0] ?? null;
  const selectedRelic = shards.find((relic) => relic.id === selectedRelicId) ?? shards[0] ?? null;
  const activeEnchant = selectedHero?.enchantment && !selectedHero.enchantment.removedAt ? selectedHero.enchantment : null;
  const spentEnchant = Boolean(selectedHero?.enchantment);
  const canEnchant = Boolean(selectedHero && selectedRelic && selectedRelic.amount > 0 && !spentEnchant);

  const runRitual = async (wash: boolean) => {
    if (!selectedHero || busy) return;
    setBusy(true);
    setActionError('');
    try {
      if (wash) await onWashEnchant?.(selectedHero.id);
      else if (selectedRelic) await onEnchantHero?.(selectedHero.id, selectedRelic.id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The ritual could not be completed. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-w-0">
      <section className="min-w-0 border border-white/10 bg-black/25 p-3 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">Forge</div>
            <h2 className="mt-2 font-display text-3xl font-light uppercase tracking-[0.16em] text-stone-100">Enchant</h2>
          </div>
          <div className="text-right text-[10px] uppercase tracking-[0.22em] text-stone-600">
            Bind shards · Recover Dust
          </div>
        </div>

        <div className="mt-6">
          <CardCarousel size="large" onActivateHero={(id) => { setOpenHeroId(id); setMode('enchant'); setActionError(''); }} heroes={heroes} selectedHeroId={selectedHero?.id ?? ''} onSelectHero={setSelectedHeroId} title="Choose a card"
            badgeForHero={(hero) => hero.enchantment?.removedAt ? 'Washed' : hero.enchantment ? 'Enchanted' : undefined} />
        </div>
      </section>

      {selectedHero && openHeroId === selectedHero.id && <ForgeRitualDialog hero={selectedHero} mode={mode} busy={busy} onClose={() => setOpenHeroId('')}>
        <div className="forge-ritual__modes" role="group" aria-label="Card operation">
          <button type="button" aria-pressed={mode === 'enchant'} disabled={busy} onClick={() => { setMode('enchant'); setActionError(''); }}>Enchant</button>
          <button type="button" aria-pressed={mode === 'break'} disabled={busy} onClick={() => { setMode('break'); setActionError(''); }}>Break</button>
        </div>
        {mode === 'enchant' ? <div className="forge-ritual__operation space-y-3">
            <div className="text-xs leading-6 text-stone-400">{activeEnchant ? 'Bound to ' + activeEnchant.relicName + '.' : spentEnchant ? 'This card has already used its enchant opportunity.' : 'Choose one shard to bind to this hero. Each card can be enchanted once.'}</div>

            <div>
              <div className="flex items-end justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Shard inventory</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Select a shard</div>
              </div>
              {shards.length === 0 ? (
                <div className="mt-3 border border-white/8 bg-black/25 px-4 py-8 text-center text-xs uppercase tracking-[0.18em] text-stone-600">
                  No shards available
                </div>
              ) : (
                <div className="forge-ritual__inventory mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {shards.map((relic) => (
                    <ShardTile
                      key={relic.id}
                      relic={relic}
                      active={relic.id === selectedRelic?.id}
                      disabled={!selectedHero || spentEnchant || busy}
                      onSelect={() => setSelectedRelicId(relic.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="border border-white/8 bg-black/25 p-4">
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Selected shard</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden border border-white/10 bg-[#090909]">
                  {selectedRelic?.iconSrc ? (
                    <img src={selectedRelic.iconSrc} alt={selectedRelic.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <WandSparkles size={16} className="text-stone-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm text-stone-100">{selectedRelic?.name ?? 'None'}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-600">
                    {selectedRelic ? `${selectedRelic.family} · x${selectedRelic.amount}` : 'Choose a shard'}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs leading-5 text-stone-500">
                {activeEnchant?.effectProfile
                  ?? selectedRelic?.definition?.effect_profile
                  ?? (selectedHero?.enchantment?.removedAt
                    ? 'This card has spent its one enchant opportunity.'
                    : 'Enchant consumes one shard and can only be done once per card. Equip relics on the Vault card page.')}
              </div>
            </div>

            {(actionError || error) && <p role="alert" className="text-sm text-amber-200">{actionError || error}</p>}
            <button
              type="button"
              onClick={() => void runRitual(false)}
              disabled={!canEnchant || busy || !onEnchantHero}
              className="w-full bg-[#806838] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-100 transition hover:bg-[#9a7d4a] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? 'Working…' : 'Bind Shard'}
            </button>
            {activeEnchant && <button
              type="button"
              onClick={() => void runRitual(true)}
              disabled={!activeEnchant || busy || !onWashEnchant}
              className="w-full border border-white/10 bg-black/35 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-300 transition hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Wash Enchant
            </button>}
          </div> : <BreakRitualPanel hero={selectedHero} relics={relics} decomposePercent={decomposePercent} onBreakHero={onBreakHero} error={error}
            busy={busy} onBusyChange={setBusy} onComplete={(message) => { setNotice(message); setOpenHeroId(''); }} />}
      </ForgeRitualDialog>}
      {notice && <p role="status" className="mt-4 px-4 py-3 text-sm text-[#d8b06c]">{notice}</p>}
    </div>
  );
}

function BreakRitualPanel({ hero, relics, decomposePercent, onBreakHero, error, busy, onBusyChange, onComplete }: {
  hero: SavedHero;
  relics: RelicOption[];
  decomposePercent: number;
  onBreakHero?: (heroId: string) => Promise<number | null>;
  error: string | null;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onComplete: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState('');
  const breakable = (hero.cardStatus ?? 'active') === 'active' && !hero.activePvpEntryId;
  const estimatedDust = Math.max(10, Math.floor(heroBp(hero) * decomposePercent / 100));
  const equippedRelic = relics.find((relic) => relic.id === hero.equippedRelicId);
  const enchant = hero.enchantment && !hero.enchantment.removedAt ? hero.enchantment : null;

  const breakSelected = async () => {
    if (!breakable || !onBreakHero || busy) return;
    onBusyChange(true);
    setActionError('');
    try {
      const dust = await onBreakHero(hero.id);
      if (dust !== null) onComplete(hero.character.name + ' broke down into ' + formatNumber(dust) + ' Dust.');
      else setActionError('This card could not be broken. Try again.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'This card could not be broken. Try again.');
    } finally { onBusyChange(false); }
  };

  return <div className="forge-ritual__salvage">
    <div className="forge-ritual__yield">
      <p>Dust recovered</p>
      <div><strong>{formatNumber(estimatedDust)}</strong><span>Dust</span></div>
      <small>{formatNumber(heroBp(hero))} BP × {decomposePercent}% · Minimum 10 Dust</small>
    </div>
    <div className="forge-ritual__consequences">
      <h3>What will be consumed</h3>
      <dl>
        <div><dt>Hero card</dt><dd>{hero.character.name}<small>Removed from your collection</small></dd></div>
        <div><dt>Equipped relic</dt><dd>{equippedRelic?.name ?? hero.equippedRelicId ?? 'None equipped'}{hero.equippedRelicId && <small>Consumed with this card</small>}</dd></div>
        <div><dt>Enchantment</dt><dd>{enchant?.relicName ?? (hero.enchantment?.removedAt ? 'Washed' : 'None bound')}{enchant && <small>Bound shard is not returned</small>}</dd></div>
      </dl>
    </div>
    <div className="forge-ritual__salvage-action">
      <p>{confirming ? 'Confirm breaking ' + hero.character.name + '? This cannot be undone.' : 'Breaking is permanent. Review the card and its attachments before continuing.'}</p>
      {(actionError || error) && <p role="alert" className="text-amber-200">{actionError || error}</p>}
      {!breakable && <p className="text-amber-200">This card is locked or queued for battle and cannot be broken.</p>}
      <button type="button" className={confirming ? 'is-confirming' : ''} disabled={!breakable || busy || !onBreakHero}
        onClick={() => { if (!confirming) setConfirming(true); else void breakSelected(); }}>
        {busy ? 'Breaking…' : confirming ? 'Confirm Break' : 'Break Card'}
      </button>
      {confirming && !busy && <button type="button" className="forge-ritual__cancel" onClick={() => setConfirming(false)}>Cancel</button>}
    </div>
  </div>;
}

export function ForgePage({
  loading,
  error,
  resultImage,
  resultHero,
  heroes,
  economy,
  demoMode = false,
  activeTab = 'create',
  onEnchantHero,
  onWashEnchant,
  onBreakHero,
  onGenerate,
  onBreak,
}: ForgePageProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const relics = useMemo(() => relicOptions(economy, demoMode), [demoMode, economy]);
  const currentStep = inferStep(Boolean(uploadedFile || uploadedPreview), loading, resultHero);
  const displayImage = resultImage || uploadedPreview;

  const setFile = (file: File) => {
    setUploadedFile(file);
    setUploadedPreview(URL.createObjectURL(file));
  };

  const clearUpload = () => {
    setUploadedFile(null);
    setUploadedPreview(null);
  };

  const generate = () => {
    if (!uploadedFile) return;
    void onGenerate(uploadedFile);
  };

  const mainStage = (() => {
    if (activeTab === 'enchant') {
      return (
        <ManageEnchantStage
          error={error}
          heroes={heroes}
          relics={relics}
          onEnchantHero={onEnchantHero}
          onWashEnchant={onWashEnchant}
          onBreakHero={onBreakHero}
          decomposePercent={economy?.costs.decompose_bp_percent ?? 5}
        />
      );
    }
    if (loading) return <GenerateStage />;
    if (resultHero) return <ResultStage hero={resultHero} image={displayImage} onBreak={onBreak} />;
    return <UploadStage imagePreview={uploadedPreview} onPickFile={setFile} onClear={clearUpload} />;
  })();

  return (
    <div className="mx-auto max-w-[1540px] px-3 py-8 sm:px-6 2xl:px-8">
      <PageHeader
        title="Forge"
        eyebrow="Hero Forge"
        subtitle={activeTab === 'enchant' ? 'Enchant' : 'Workshop'}
        description={activeTab === 'enchant' ? 'Select a hero to bind shards or recover Dust.' : 'Images become heroes. Shards and relics are applied afterward.'}
        stats={
          <>
            <PageHeaderStat label="Cards Forged" value={formatNumber(heroes.length)} />
            <PageHeaderStat label="Relics Ready" value={formatNumber(relics.length)} />
            <PageHeaderStat label="Forge Cost" value={formatNumber(economy?.costs.forge ?? 100)} />
            <PageHeaderStat label="Forge State" value={loading ? 'Active' : resultHero ? 'Result' : uploadedFile ? 'Ready' : 'Idle'} />
          </>
        }
      />
      <div className="mt-7">
        <section className="border border-white/8 bg-black/20">
          {activeTab === 'create' ? (
            <>
              <StepIndicator currentStep={currentStep} />
              <div className="grid grid-cols-1 gap-7 p-7 2xl:grid-cols-[minmax(0,1fr)_330px]">
                <div>{mainStage}</div>
                <SummaryPanel
                  uploadedFile={uploadedFile}
                  uploadedPreview={displayImage}
                  resultHero={resultHero}
                  loading={loading}
                  error={error}
                  onGenerateClick={generate}
                  onBreak={onBreak}
                />
              </div>
            </>
          ) : (
            <div className="p-3 sm:p-7">{mainStage}</div>
          )}
          <div className="grid grid-cols-1 border-t border-white/8 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex items-center gap-5 px-8 py-6 text-sm leading-6 text-stone-500">
              <Shield size={28} className="text-[#b49664]" />
              <span>Each forge is unique. Stats and traits are generated by the rule-based system, while relic inventory and enchantment actions are resolved by the backend.</span>
            </div>
            <button type="button" className="border-l border-white/8 px-8 py-6 text-left text-[10px] uppercase tracking-[0.24em] text-stone-500 hover:text-stone-300">
              Learn more about<br />
              <span className="text-stone-300">the forge system</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
