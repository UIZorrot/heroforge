
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navigation from '../../components/layout/Navigation';
import HeroCard from '../../components/cards/HeroCard';
import { generateHeroCard } from '../../utils/cardGenerator';
import { cardStorage } from '../../utils/cardStorage';
import type { HeroCard as HeroCardType } from '../../types/card';

const FORGE_STEPS = [
  { icon: 'ri-image-add-line', label: 'Upload Essence' },
  { icon: 'ri-fire-fill', label: 'Soul Imprinting' },
  { icon: 'ri-sparkling-2-fill', label: 'Relic Forged' },
];

export default function ForgePage() {
  const [isForging, setIsForging] = useState(false);
  const [forgedCard, setForgedCard] = useState<HeroCardType | null>(null);
  const [heroName, setHeroName] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [forgeStep, setForgeStep] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const runForge = (imageUrl: string) => {
    setIsForging(true);
    setForgedCard(null);
    setShowSuccess(false);
    setForgeStep(1);

    setTimeout(() => {
      setForgeStep(2);
      const card = generateHeroCard(imageUrl, heroName || undefined);
      setForgedCard(card);
      setIsForging(false);
    }, 2200);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      setPreviewImage(url);
      runForge(url);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      setPreviewImage(url);
      runForge(url);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCard = () => {
    if (forgedCard) {
      cardStorage.saveCard(forgedCard);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setForgedCard(null);
        setHeroName('');
        setPreviewImage(null);
        setForgeStep(0);
      }, 2500);
    }
  };

  const handleReforge = () => {
    if (forgedCard) {
      setForgeStep(1);
      setIsForging(true);
      setTimeout(() => {
        const newCard = generateHeroCard(forgedCard.imageUrl, heroName || undefined);
        setForgedCard(newCard);
        setForgeStep(2);
        setIsForging(false);
      }, 1500);
    }
  };

  const handleReset = () => {
    setForgedCard(null);
    setPreviewImage(null);
    setHeroName('');
    setForgeStep(0);
    setShowSuccess(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-400/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/5 rounded-full blur-[100px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-400/3 rounded-full blur-[150px]"></div>
      </div>

      <Navigation />

      <main className="relative pt-20 pb-16">
        {/* Page Header */}
        <div className="text-center pt-10 pb-8 px-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/20 mb-5">
            <i className="ri-hammer-fill text-amber-400 text-xs"></i>
            <span className="text-amber-400/80 text-xs font-mono tracking-widest uppercase">Arcane Forge</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-display font-black text-white mb-3 tracking-wide"
            style={{ textShadow: '0 0 40px rgba(234,179,8,0.3)' }}>
            THE <span className="text-amber-400">FORGE</span>
          </h1>
          <p className="text-gray-500 font-mono text-sm tracking-widest">
            IMPRINT SOULS · FORGE RELICS · CLAIM POWER
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-0 mb-10 px-6">
          {FORGE_STEPS.map((step, i) => (
            <div key={i} className="flex items-center">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-500 ${
                forgeStep === i
                  ? 'bg-amber-400/15 border border-amber-400/40 text-amber-400'
                  : forgeStep > i
                  ? 'text-emerald-400 opacity-70'
                  : 'text-gray-600'
              }`}>
                <div className={`w-5 h-5 flex items-center justify-center`}>
                  {forgeStep > i
                    ? <i className="ri-check-line text-sm"></i>
                    : <i className={`${step.icon} text-sm`}></i>
                  }
                </div>
                <span className="text-xs font-semibold whitespace-nowrap">{step.label}</span>
              </div>
              {i < FORGE_STEPS.length - 1 && (
                <div className={`w-12 h-px mx-1 transition-all duration-500 ${forgeStep > i ? 'bg-emerald-400/40' : 'bg-white/10'}`}></div>
              )}
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-6 items-start">

            {/* ── LEFT PANEL: Input ── */}
            <div className="space-y-4">
              {/* Panel header */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-400/10 border border-amber-400/20">
                  <i className="ri-quill-pen-fill text-amber-400 text-sm"></i>
                </div>
                <div>
                  <h2 className="text-sm font-display font-bold text-white tracking-wider">SOUL INSCRIPTION</h2>
                  <p className="text-xs text-gray-600">Name your hero before forging</p>
                </div>
              </div>

              {/* Name Input */}
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                  <i className="ri-quill-pen-line text-amber-400/60 text-sm"></i>
                </div>
                <input
                  type="text"
                  value={heroName}
                  onChange={(e) => setHeroName(e.target.value)}
                  placeholder="Hero name (optional)..."
                  maxLength={30}
                  className="w-full pl-11 pr-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-xl text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-400/40 focus:bg-amber-400/5 transition-all text-sm font-medium"
                  disabled={isForging}
                />
              </div>

              {/* Upload Zone */}
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="image-upload"
                  disabled={isForging}
                />
                <label
                  htmlFor="image-upload"
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={`
                    block relative rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer
                    ${isDragOver ? 'border-amber-400 bg-amber-400/10 scale-[1.01]' : ''}
                    ${isForging ? 'cursor-wait' : 'cursor-pointer'}
                  `}
                >
                  {/* Border */}
                  <div className={`absolute inset-0 rounded-2xl border-2 border-dashed transition-all duration-300 pointer-events-none z-10 ${
                    isDragOver ? 'border-amber-400' : isForging ? 'border-amber-400/50' : 'border-white/10 hover:border-amber-400/30'
                  }`}></div>

                  {previewImage ? (
                    /* Preview with overlay */
                    <div className="relative aspect-[4/3] rounded-2xl overflow-hidden">
                      <img src={previewImage} alt="Preview" className="w-full h-full object-cover object-top" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                      {isForging && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                          <ForgeAnimation />
                        </div>
                      )}
                      {!isForging && (
                        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                          <span className="text-xs text-gray-400 font-mono">Image loaded</span>
                          <span className="text-xs text-amber-400/70 font-mono">Click to change</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Empty state */
                    <div className="aspect-[4/3] rounded-2xl bg-white/[0.02] flex flex-col items-center justify-center gap-4 hover:bg-white/[0.04] transition-all">
                      {isForging ? (
                        <ForgeAnimation />
                      ) : (
                        <>
                          <div className="relative">
                            <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                              <i className="ri-image-add-line text-3xl text-amber-400/60"></i>
                            </div>
                            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center">
                              <i className="ri-add-line text-amber-400 text-xs"></i>
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-300 font-semibold text-sm mb-1">Drop hero image here</p>
                            <p className="text-gray-600 text-xs">PNG · JPG · WEBP · up to 10MB</p>
                          </div>
                          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400/10 border border-amber-400/20">
                            <i className="ri-upload-2-line text-amber-400 text-xs"></i>
                            <span className="text-amber-400 text-xs font-semibold">Browse Files</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </label>
              </div>

              {/* Forge Tips */}
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ri-lightbulb-flash-fill text-amber-400/60 text-sm"></i>
                  <span className="text-xs font-bold text-gray-400 tracking-wider uppercase">Forge Lore</span>
                </div>
                <div className="space-y-2">
                  {[
                    { icon: 'ri-image-line', text: 'Clear portraits yield stronger relics' },
                    { icon: 'ri-dice-line', text: 'Rarity is determined by arcane fate' },
                    { icon: 'ri-refresh-line', text: 'Reforge to roll new attributes' },
                    { icon: 'ri-archive-line', text: 'Save to Vault to use in duels' },
                  ].map((tip, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                        <i className={`${tip.icon} text-amber-400/40 text-xs`}></i>
                      </div>
                      <span className="text-xs text-gray-600">{tip.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── CENTER DIVIDER ── */}
            <div className="hidden lg:flex flex-col items-center gap-3 pt-16">
              <div className="w-px flex-1 bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
              <div className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                <i className="ri-arrow-right-line text-amber-400/60 text-sm"></i>
              </div>
              <div className="w-px flex-1 bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
            </div>

            {/* ── RIGHT PANEL: Result ── */}
            <div className="space-y-4">
              {/* Panel header */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-400/10 border border-amber-400/20">
                  <i className="ri-sparkling-2-fill text-amber-400 text-sm"></i>
                </div>
                <div>
                  <h2 className="text-sm font-display font-bold text-white tracking-wider">FORGED RELIC</h2>
                  <p className="text-xs text-gray-600">Your hero card preview</p>
                </div>
              </div>

              {forgedCard && !isForging ? (
                <>
                  {/* Card preview */}
                  <div className="animate-card-reveal">
                    <div className="max-w-[280px] mx-auto">
                      <HeroCard card={forgedCard} />
                    </div>
                  </div>

                  {/* Rarity reveal banner */}
                  <div className={`rounded-xl p-3 border text-center ${
                    forgedCard.rarity === 'mythic' ? 'bg-amber-900/20 border-amber-400/30' :
                    forgedCard.rarity === 'epic'   ? 'bg-violet-900/20 border-violet-400/30' :
                    forgedCard.rarity === 'rare'   ? 'bg-sky-900/20 border-sky-400/30' :
                    'bg-white/[0.03] border-white/10'
                  }`}>
                    <div className="flex items-center justify-center gap-2">
                      <i className={`ri-sparkling-fill text-sm ${
                        forgedCard.rarity === 'mythic' ? 'text-amber-400' :
                        forgedCard.rarity === 'epic'   ? 'text-violet-400' :
                        forgedCard.rarity === 'rare'   ? 'text-sky-400' : 'text-gray-400'
                      }`}></i>
                      <span className={`text-xs font-bold tracking-widest uppercase ${
                        forgedCard.rarity === 'mythic' ? 'text-amber-400' :
                        forgedCard.rarity === 'epic'   ? 'text-violet-400' :
                        forgedCard.rarity === 'rare'   ? 'text-sky-400' : 'text-gray-400'
                      }`}>
                        {forgedCard.rarity} relic forged
                      </span>
                      <i className={`ri-sparkling-fill text-sm ${
                        forgedCard.rarity === 'mythic' ? 'text-amber-400' :
                        forgedCard.rarity === 'epic'   ? 'text-violet-400' :
                        forgedCard.rarity === 'rare'   ? 'text-sky-400' : 'text-gray-400'
                      }`}></i>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {showSuccess ? (
                    <div className="rounded-xl bg-emerald-900/20 border border-emerald-400/30 p-5 text-center">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
                        <i className="ri-checkbox-circle-fill text-2xl text-emerald-400"></i>
                      </div>
                      <p className="text-emerald-400 font-bold text-sm mb-1">Relic forged successfully!</p>
                      <p className="text-gray-500 text-xs">Saved to your Vault</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={handleReforge}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-gray-300 font-semibold text-sm hover:border-amber-400/30 hover:text-amber-400 hover:bg-amber-400/5 transition-all whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-refresh-line"></i>
                        Reforge
                      </button>
                      <button
                        onClick={handleSaveCard}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-400 text-[#0a0a0c] font-bold text-sm hover:bg-amber-300 transition-all whitespace-nowrap cursor-pointer shadow-[0_0_20px_rgba(234,179,8,0.3)]"
                      >
                        <i className="ri-archive-fill"></i>
                        Save to Vault
                      </button>
                    </div>
                  )}

                  <button
                    onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-gray-600 text-xs font-semibold hover:text-gray-400 transition-all cursor-pointer"
                  >
                    <i className="ri-arrow-left-line text-xs"></i>
                    Forge another hero
                  </button>
                </>
              ) : isForging ? (
                /* Forging in progress */
                <div className="rounded-2xl bg-white/[0.02] border border-amber-400/20 aspect-[3/4] flex flex-col items-center justify-center gap-6">
                  <ForgeAnimation large />
                  <div className="text-center">
                    <p className="text-amber-400 font-display font-bold text-lg mb-1">Soul imprinting...</p>
                    <p className="text-gray-600 text-xs font-mono">Extracting arcane essence</p>
                  </div>
                  {/* Fake progress bar */}
                  <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-amber-300 rounded-full animate-[forge-progress_2.2s_ease-in-out_forwards]"
                      style={{ animation: 'forge-progress 2.2s ease-in-out forwards' }}></div>
                  </div>
                </div>
              ) : (
                /* Empty state */
                <div className="rounded-2xl bg-white/[0.02] border border-dashed border-white/10 aspect-[3/4] flex flex-col items-center justify-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
                    <i className="ri-sparkling-2-line text-4xl text-gray-700"></i>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-600 text-sm font-semibold mb-1">Awaiting essence</p>
                    <p className="text-gray-700 text-xs">Upload an image to begin forging</p>
                  </div>
                </div>
              )}

              {/* Quick link to vault */}
              {!forgedCard && !isForging && (
                <Link
                  to="/vault"
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-gray-500 text-xs font-semibold hover:text-gray-300 hover:border-white/10 transition-all cursor-pointer"
                >
                  <i className="ri-archive-line text-sm"></i>
                  View your Vault
                  <i className="ri-arrow-right-line text-xs"></i>
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes forge-progress {
          0% { width: 0%; }
          30% { width: 40%; }
          70% { width: 75%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}

function ForgeAnimation({ large = false }: { large?: boolean }) {
  const size = large ? 'w-20 h-20' : 'w-12 h-12';
  const iconSize = large ? 'text-3xl' : 'text-xl';
  return (
    <div className={`relative ${size} flex items-center justify-center`}>
      {/* Outer ring */}
      <div className={`absolute inset-0 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-forge-spin`}></div>
      {/* Inner ring */}
      <div className={`absolute inset-2 rounded-full border border-amber-400/10 border-b-amber-400/50`}
        style={{ animation: 'forge-spin 1s linear infinite reverse' }}></div>
      {/* Center icon */}
      <div className={`w-5 h-5 flex items-center justify-center`}>
        <i className={`ri-fire-fill ${iconSize} text-amber-400 animate-glow-pulse`}></i>
      </div>
    </div>
  );
}
