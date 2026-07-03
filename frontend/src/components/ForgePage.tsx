import { useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Gem, ImagePlus, RefreshCw, ScrollText, Shield, UploadCloud, WandSparkles, X } from 'lucide-react';
import { HeroCard } from './HeroCard';
import { PageHeader, PageHeaderStat } from './PageHeader';
import type { CharacterData } from '../lib/gameLogic';
import { mockRelicCatalog, mockRelicInventory } from '../lib/mockContent';
import { getRelicIconSrc } from '../lib/relics';
import type { EconomySnapshot, MaterialDefinition, MaterialInventory, RelicDefinition, SavedHero } from '../types';

type ForgeStep = 'upload' | 'enchant' | 'generate' | 'result';
export type ForgeSideKey = 'create' | 'enchant' | 'break';

type ForgePageProps = {
  loading: boolean;
  error: string | null;
  resultImage: string | null;
  resultHero: CharacterData | null;
  selectedInfusions: Array<{
    label: string;
    count: number;
    overlayClass: string;
    particleClass: string;
  }>;
  heroes: SavedHero[];
  economy: EconomySnapshot | null;
  materials: MaterialInventory;
  materialDefinitions: MaterialDefinition[];
  activeTab?: ForgeSideKey;
  onEquipRelic?: (heroId: string, relicId: string | null) => Promise<void> | void;
  onEnchantHero?: (heroId: string, relicId: string) => Promise<void> | void;
  onWashEnchant?: (heroId: string) => Promise<void> | void;
  onGenerate: (file: File) => Promise<void> | void;
  onBreak: () => void;
};

type RelicOption = {
  id: string;
  name: string;
  tier: string;
  family: string;
  amount: number;
  iconSrc?: string | null;
  definition?: RelicDefinition;
};

function relicOptions(economy: EconomySnapshot | null): RelicOption[] {
  const sourceRelics = !economy || economy.relics.length === 0 ? mockRelicInventory : economy.relics;
  const sourceCatalog = !economy || economy.relic_catalog.length === 0 ? mockRelicCatalog : economy.relic_catalog;
  const catalog = Object.fromEntries(sourceCatalog.map((item) => [item.relic_type, item]));
  return sourceRelics.map((entry) => {
    const definition = catalog[entry.relic_type];
    return {
      id: entry.relic_type,
      name: definition?.display_name ?? entry.relic_type,
      tier: definition?.tier ?? 'common',
      family: definition?.family ?? 'Relic',
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

function inferStep(hasFile: boolean, loading: boolean, resultHero: CharacterData | null): ForgeStep {
  if (loading) return 'generate';
  if (resultHero) return 'result';
  if (hasFile) return 'enchant';
  return 'upload';
}

function StepIndicator({ currentStep }: { currentStep: ForgeStep }) {
  const steps: Array<{ key: ForgeStep; title: string; description: string }> = [
    { key: 'upload', title: 'Upload', description: 'Add an image' },
    { key: 'enchant', title: 'Enchant', description: 'Use a relic' },
    { key: 'generate', title: 'Generate', description: 'Forge your hero' },
    { key: 'result', title: 'Result', description: 'View and break' },
  ];
  const currentIndex = steps.findIndex((step) => step.key === currentStep);

  return (
    <div className="grid grid-cols-4 gap-6 border-b border-white/8 px-8 py-6">
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

function LeftPanel({
  heroes,
  materials,
  materialDefinitions,
  relics,
}: {
  heroes: SavedHero[];
  materials: MaterialInventory;
  materialDefinitions: MaterialDefinition[];
  relics: RelicOption[];
}) {
  return (
    <aside className="space-y-5">
      <section className="border border-white/8 bg-black/20 p-5">
        <div className="flex items-start justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Hero forged today</div>
          <div className="border border-white/10 px-4 py-3 text-center">
            <div className="text-xl text-stone-100">{heroes.length}</div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-stone-600">Cards</div>
          </div>
        </div>
        <div className="mt-5 border-t border-white/8 py-5 text-center text-[10px] uppercase tracking-[0.28em] text-stone-600">
          {heroes.length > 0 ? `${heroes.length} cards in vault` : 'No cards forged'}
        </div>
      </section>

      <section className="border border-white/8 bg-black/20 p-5">
        <div className="mb-5 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Daily ritual</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Refresh in 12:34:56</div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-white/8 pb-3">
            <div>
              <div className="text-sm text-stone-200">Forge one card</div>
              <div className="mt-1 text-xs text-stone-500">+100 score</div>
            </div>
            <button type="button" className="bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-200">
              Claim
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-stone-200">Use one relic</div>
              <div className="mt-1 text-xs text-stone-500">+300 score</div>
            </div>
            <button type="button" className="bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-200">
              Claim
            </button>
          </div>
        </div>
      </section>

      <section className="border border-white/8 bg-black/20 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Material vault</div>
          <button type="button" className="text-[10px] uppercase tracking-[0.18em] text-stone-500">View all</button>
        </div>
        <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
          {materialDefinitions.map((material) => (
            <div key={material.key} className="flex items-center justify-between border-b border-white/8 py-3">
              <div className="flex items-center gap-3">
                <Gem size={15} className="text-stone-300" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{material.label}</span>
              </div>
              <span className="text-sm text-[#d7c096]">{formatNumber(materials[material.key])}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-white/8 bg-black/20 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Relic vault</div>
          <button type="button" className="text-[10px] uppercase tracking-[0.18em] text-stone-500">View all</button>
        </div>
        <div className="border-t border-white/8 py-5 text-center text-[10px] uppercase tracking-[0.26em] text-stone-600">
          {relics.length > 0 ? `${relics.length} relics available` : 'No relics bound'}
        </div>
      </section>
    </aside>
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

function EnchantStage({
  relics,
  selectedRelicId,
  onSelectRelic,
}: {
  relics: RelicOption[];
  selectedRelicId: string;
  onSelectRelic: (id: string) => void;
}) {
  return (
    <div className="min-h-[520px] border border-white/10 bg-black/25 p-8">
      <div className="text-[10px] uppercase tracking-[0.3em] text-[#d7a852]">Enchant</div>
      <h2 className="mt-3 font-display text-5xl font-light uppercase tracking-[0.16em] text-stone-100">Use a relic</h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-500">
        Relic enchantment is a forging modifier. It guides the intended fantasy and can later be wired into the backend relic economy.
      </p>
      <div className="mt-8 grid grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onSelectRelic('')}
          className={`min-h-[150px] border p-5 text-left transition ${
            selectedRelicId === '' ? 'border-[#b49664] bg-[#b49664]/8' : 'border-white/10 bg-black/30 hover:border-stone-600'
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">No relic</div>
          <div className="mt-4 text-lg text-stone-200">Pure Forge</div>
          <div className="mt-3 text-sm leading-6 text-stone-500">Generate from image identity only.</div>
        </button>
        {relics.slice(0, 5).map((relic) => (
          <button
            key={relic.id}
            type="button"
            onClick={() => onSelectRelic(relic.id)}
            className={`min-h-[150px] border p-5 text-left transition ${
              selectedRelicId === relic.id ? 'border-[#b49664] bg-[#b49664]/8' : 'border-white/10 bg-black/30 hover:border-stone-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#d7a852]">{relic.tier}</div>
              <div className="text-xs text-stone-500">x{relic.amount}</div>
            </div>
            <div className="mt-4 flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/[0.03]">
                {relic.iconSrc ? (
                  <img src={relic.iconSrc} alt={relic.name} className="h-full w-full object-cover" />
                ) : (
                  <ScrollText size={18} className="text-stone-500" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-lg text-stone-200">{relic.name}</div>
                <div className="mt-3 text-sm leading-6 text-stone-500">{relic.family}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
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
  infusions,
  onBreak,
}: {
  hero: CharacterData | null;
  image: string | null;
  infusions: ForgePageProps['selectedInfusions'];
  onBreak: () => void;
}) {
  return (
    <div className="flex min-h-[560px] flex-col items-center justify-center border border-white/10 bg-[radial-gradient(circle_at_50%_42%,rgba(180,150,100,0.10),rgba(0,0,0,0.18)_40%,rgba(0,0,0,0.48)_100%)] p-8">
      {hero ? (
        <>
          <HeroCard character={hero} image={image ?? undefined} infusions={infusions} className="h-[520px] w-[340px]" />
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
  selectedRelic,
  resultHero,
  loading,
  error,
  onGenerateClick,
  onBreak,
}: {
  uploadedFile: File | null;
  uploadedPreview: string | null;
  selectedRelic: RelicOption | null;
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
          <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Enchant</div>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden border border-white/10 bg-white/[0.03]">
              {selectedRelic?.iconSrc ? (
                <img src={selectedRelic.iconSrc} alt={selectedRelic.name} className="h-full w-full object-cover" />
              ) : (
                <ScrollText size={18} className="text-stone-500" />
              )}
            </div>
            <div>
              <div className="text-sm text-stone-300">{selectedRelic?.name ?? 'No relic selected'}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-600">{selectedRelic?.family ?? 'Pure forge'}</div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/8 pt-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Estimated output</div>
          <div className="mt-4 text-sm leading-7 text-stone-400">
            {resultHero ? `${resultHero.name} / ${formatNumber(resultHero.BP)} BP` : selectedRelic ? 'Relic-enchanted hero' : 'Image-based hero'}
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
  onEquipRelic,
  onEnchantHero,
  onWashEnchant,
}: {
  heroes: SavedHero[];
  relics: RelicOption[];
  onEquipRelic?: (heroId: string, relicId: string | null) => Promise<void> | void;
  onEnchantHero?: (heroId: string, relicId: string) => Promise<void> | void;
  onWashEnchant?: (heroId: string) => Promise<void> | void;
}) {
  const [selectedHeroId, setSelectedHeroId] = useState(heroes[0]?.id ?? '');
  const [selectedRelicId, setSelectedRelicId] = useState(relics[0]?.id ?? '');
  const selectedHero = heroes.find((hero) => hero.id === selectedHeroId) ?? heroes[0] ?? null;
  const equippedRelic = relics.find((relic) => relic.id === selectedHero?.equippedRelicId) ?? null;
  const selectedRelic = relics.find((relic) => relic.id === selectedRelicId) ?? relics[0] ?? null;
  const activeEnchant = selectedHero?.enchantment && !selectedHero.enchantment.removedAt ? selectedHero.enchantment : null;
  const spentEnchant = Boolean(selectedHero?.enchantment);
  const canEnchant = Boolean(selectedHero && selectedRelic && selectedRelic.amount > 0 && !spentEnchant);

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="border border-white/10 bg-black/25 p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">Forge</div>
            <h2 className="mt-2 font-display text-3xl font-light uppercase tracking-[0.16em] text-stone-100">Enchant Cards</h2>
          </div>
          <div className="text-right text-[10px] uppercase tracking-[0.22em] text-stone-600">
            One enchant lifetime per card
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {heroes.map((hero) => {
            const active = hero.id === selectedHero?.id;
            const enchant = hero.enchantment;
            return (
              <button
                key={hero.id}
                type="button"
                onClick={() => setSelectedHeroId(hero.id)}
                className={`min-h-[150px] border p-4 text-left transition ${
                  active ? 'border-[#b49664] bg-[#b49664]/8' : 'border-white/10 bg-black/30 hover:border-stone-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-xl font-light tracking-[0.08em] text-stone-100">{hero.character.name}</div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-stone-600">{hero.character.state.TYPE}</div>
                  </div>
                  <div className="text-right text-[10px] uppercase tracking-[0.16em] text-stone-500">
                    {hero.character.BP} BP
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.16em]">
                  <span className="border border-white/8 bg-black/35 px-2 py-2 text-stone-500">
                    Equip {hero.equippedRelicId ? '1/1' : '0/1'}
                  </span>
                  <span className={`border px-2 py-2 ${enchant ? 'border-[#b49664]/35 bg-[#b49664]/10 text-[#d8b06c]' : 'border-white/8 bg-black/35 text-stone-500'}`}>
                    {enchant?.removedAt ? 'Washed' : enchant ? 'Enchanted' : 'Clean'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="border border-white/10 bg-[#0a0a0a]/88 p-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">Selected Card</div>
          <h3 className="mt-3 font-display text-2xl font-light tracking-[0.1em] text-stone-100">{selectedHero?.character.name ?? 'No card'}</h3>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Equipped relic</span>
              <select
                value={selectedHero?.equippedRelicId ?? ''}
                onChange={(event) => selectedHero && onEquipRelic?.(selectedHero.id, event.target.value || null)}
                disabled={!selectedHero}
                className="mt-2 h-11 w-full border border-white/10 bg-black/45 px-3 text-sm text-stone-200 outline-none"
              >
                <option value="">No relic equipped</option>
                {relics.map((relic) => (
                  <option key={relic.id} value={relic.id}>{relic.name} x{relic.amount}</option>
                ))}
              </select>
            </label>

            <div className="border border-white/8 bg-black/25 p-4">
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Current equip</div>
              <div className="mt-2 text-sm text-stone-200">{equippedRelic?.name ?? 'None'}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-600">{equippedRelic?.family ?? 'No battle relic'}</div>
            </div>

            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Enchant relic</span>
              <select
                value={selectedRelicId}
                onChange={(event) => setSelectedRelicId(event.target.value)}
                disabled={!selectedHero || spentEnchant}
                className="mt-2 h-11 w-full border border-white/10 bg-black/45 px-3 text-sm text-stone-200 outline-none disabled:opacity-50"
              >
                {relics.map((relic) => (
                  <option key={relic.id} value={relic.id}>{relic.name}</option>
                ))}
              </select>
            </label>

            <div className="border border-white/8 bg-black/25 p-4">
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Enchant state</div>
              <div className="mt-2 text-sm text-stone-200">
                {activeEnchant ? activeEnchant.relicName : selectedHero?.enchantment?.removedAt ? 'Washed off' : 'Never enchanted'}
              </div>
              <div className="mt-2 text-xs leading-5 text-stone-500">
                {activeEnchant?.effectProfile ?? (selectedHero?.enchantment?.removedAt ? 'This card has spent its one enchant opportunity.' : 'Enchant consumes the selected relic fee and cannot be repeated.')}
              </div>
            </div>

            <button
              type="button"
              onClick={() => selectedHero && selectedRelic && onEnchantHero?.(selectedHero.id, selectedRelic.id)}
              disabled={!canEnchant}
              className="w-full bg-[#806838] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-100 transition hover:bg-[#9a7d4a] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Enchant Once
            </button>
            <button
              type="button"
              onClick={() => selectedHero && onWashEnchant?.(selectedHero.id)}
              disabled={!activeEnchant}
              className="w-full border border-white/10 bg-black/35 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-300 transition hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Wash Enchant
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

export function ForgePage({
  loading,
  error,
  resultImage,
  resultHero,
  selectedInfusions,
  heroes,
  economy,
  materials,
  materialDefinitions,
  activeTab = 'create',
  onEquipRelic,
  onEnchantHero,
  onWashEnchant,
  onGenerate,
  onBreak,
}: ForgePageProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [selectedRelicId, setSelectedRelicId] = useState('');
  const relics = useMemo(() => relicOptions(economy), [economy]);
  const selectedRelic = relics.find((relic) => relic.id === selectedRelicId) ?? null;
  const currentStep = inferStep(Boolean(uploadedFile || uploadedPreview), loading, resultHero);
  const displayImage = resultImage || uploadedPreview;

  const setFile = (file: File) => {
    setUploadedFile(file);
    setUploadedPreview(URL.createObjectURL(file));
  };

  const clearUpload = () => {
    setUploadedFile(null);
    setUploadedPreview(null);
    setSelectedRelicId('');
  };

  const generate = () => {
    if (!uploadedFile) return;
    void onGenerate(uploadedFile);
  };

  const mainStage = (() => {
    if (activeTab === 'enchant') {
      return (
        <ManageEnchantStage
          heroes={heroes}
          relics={relics}
          onEquipRelic={onEquipRelic}
          onEnchantHero={onEnchantHero}
          onWashEnchant={onWashEnchant}
        />
      );
    }
    if (activeTab === 'break') {
      return (
        <div className="flex min-h-[560px] flex-col items-center justify-center border border-white/10 bg-black/25 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#b49664]">Break</div>
          <h2 className="mt-3 font-display text-3xl font-light uppercase tracking-[0.16em] text-stone-100">Clear Forge Result</h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-stone-500">Break resets the current forge output surface. Enchant washing is handled in the Enchant tab.</p>
          <button
            type="button"
            onClick={onBreak}
            className="mt-7 border border-white/12 px-8 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-200 transition hover:border-[#b49664]/50 hover:text-[#f0d8ad]"
          >
            Break
          </button>
        </div>
      );
    }
    if (loading) return <GenerateStage />;
    if (resultHero) return <ResultStage hero={resultHero} image={displayImage} infusions={selectedInfusions} onBreak={onBreak} />;
    if (uploadedFile || uploadedPreview) {
      return <EnchantStage relics={relics} selectedRelicId={selectedRelicId} onSelectRelic={setSelectedRelicId} />;
    }
    return <UploadStage imagePreview={uploadedPreview} onPickFile={setFile} onClear={clearUpload} />;
  })();

  return (
    <div className="mx-auto max-w-[1540px] px-6 py-8 2xl:px-8">
      <PageHeader
        title="Forge"
        eyebrow="Hero Forge"
        subtitle={activeTab === 'enchant' ? 'Relic Chamber' : activeTab === 'break' ? 'Salvage Desk' : 'Workshop'}
        description={
          activeTab === 'enchant'
            ? 'Bind relics before generation.'
            : activeTab === 'break'
              ? 'Break cards down for materials.'
              : 'Images become heroes.'
        }
        stats={
          <>
            <PageHeaderStat label="Cards Forged" value={formatNumber(heroes.length)} />
            <PageHeaderStat label="Relics Ready" value={formatNumber(relics.length)} />
            <PageHeaderStat
              label="Materials"
              value={formatNumber(materialDefinitions.reduce((sum, material) => sum + (materials[material.key] || 0), 0))}
            />
            <PageHeaderStat label="Forge State" value={loading ? 'Active' : resultHero ? 'Result' : uploadedFile ? 'Ready' : 'Idle'} />
          </>
        }
      />
      <div className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <LeftPanel heroes={heroes} materials={materials} materialDefinitions={materialDefinitions} relics={relics} />
        <section className="border border-white/8 bg-black/20">
          {activeTab === 'create' ? (
            <>
              <StepIndicator currentStep={currentStep} />
              <div className="grid grid-cols-1 gap-7 p-7 2xl:grid-cols-[minmax(0,1fr)_330px]">
                <div>{mainStage}</div>
                <SummaryPanel
                  uploadedFile={uploadedFile}
                  uploadedPreview={displayImage}
                  selectedRelic={selectedRelic}
                  resultHero={resultHero}
                  loading={loading}
                  error={error}
                  onGenerateClick={generate}
                  onBreak={onBreak}
                />
              </div>
            </>
          ) : (
            <div className="p-7">{mainStage}</div>
          )}
          <div className="grid grid-cols-[1fr_280px] border-t border-white/8">
            <div className="flex items-center gap-5 px-8 py-6 text-sm leading-6 text-stone-500">
              <Shield size={28} className="text-[#b49664]" />
              <span>Each forge is unique. Stats and traits are generated by the rule-based system. Relic enchantment is presented as UX and can be connected to economy rules later.</span>
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
