import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navigation from '../../components/layout/Navigation';
import HeroCard from '../../components/cards/HeroCard';
import { generateHeroCard } from '../../utils/cardGenerator';
import { cardStorage } from '../../utils/cardStorage';
import type { HeroCard as HeroCardType } from '../../types/card';

const FORGE_STEPS = [
  { label: 'Upload Essence' },
  { label: 'Soul Imprinting' },
  { label: 'Relic Forged' },
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
    <div className="min-h-screen bg-[#080808] overflow-hidden">
      {/* Subtle texture overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(ellipse at 50% 30%, rgba(180, 150, 100, 0.08) 0%, transparent 60%),
                           radial-gradient(ellipse at 20% 70%, rgba(100, 80, 60, 0.05) 0%, transparent 50%)`
        }}></div>

      <Navigation />

      <main className="relative pt-32 pb-20 px-6">
        {/* Page Title - Ultra wide spacing */}
        <div className="text-center mb-20">
          <p className="text-stone-600 text-xs italic mb-6 tracking-wide">"Illuminate the enemy"</p>
          <h1 className="text-6xl md:text-7xl font-display font-light text-stone-200 tracking-[0.25em] mb-4">
            F O R G E
          </h1>
          <div className="flex items-center justify-center gap-4 mt-8">
            <div className="w-20 h-px bg-gradient-to-r from-transparent via-stone-700 to-transparent"></div>
            <div className="w-2 h-2 rotate-45 border border-stone-700"></div>
            <div className="w-20 h-px bg-gradient-to-r from-transparent via-stone-700 to-transparent"></div>
          </div>
        </div>

        {/* Main Content - Single Column Centered */}
        <div className="max-w-2xl mx-auto">
          {/* Step Indicator - Vertical Left Side */}
          <div className="flex items-start gap-12 mb-16">
            <div className="flex flex-col gap-8 pt-2">
              {FORGE_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                    forgeStep === i
                      ? 'bg-gold-400 shadow-[0_0_8px_rgba(180,150,100,0.4)]'
                      : forgeStep > i
                      ? 'bg-gold-400/40'
                      : 'bg-stone-800'
                  }`}></div>
                  <span className={`text-xs tracking-widest transition-all duration-500 ${
                    forgeStep === i
                      ? 'text-gold-400'
                      : forgeStep > i
                      ? 'text-stone-600'
                      : 'text-stone-800'
                  }`}>
                    {step.label.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex-1 space-y-8">
              {/* Name Input */}
              <div className="space-y-2">
                <label className="block text-stone-600 text-xs tracking-widest uppercase">Hero Name</label>
                <input
                  type="text"
                  value={heroName}
                  onChange={(e) => setHeroName(e.target.value)}
                  placeholder="Optional..."
                  maxLength={30}
                  className="w-full px-0 py-3 bg-transparent border-0 border-b border-stone-800 text-stone-200 placeholder-stone-800 focus:outline-none focus:border-gold-400/40 transition-all text-sm tracking-wide"
                  disabled={isForging}
                />
              </div>

              {/* Upload Zone - Minimal Rectangle */}
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
                    block relative transition-all duration-300 cursor-pointer
                    ${isForging ? 'cursor-wait' : 'cursor-pointer'}
                  `}
                >
                  {/* Minimal border */}
                  <div className={`absolute inset-0 border-hairline transition-all duration-300 pointer-events-none ${
                    isDragOver ? 'border-gold-400' : isForging ? 'border-gold-400/30' : 'border-stone-800 hover:border-stone-700'
                  }`}></div>

                  {previewImage ? (
                    /* Preview */
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img src={previewImage} alt="Preview" className="w-full h-full object-cover object-top" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                      {isForging && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                          <MinimalSpinner />
                          <p className="text-stone-600 text-xs tracking-widest mt-6">IMPRINTING</p>
                        </div>
                      )}
                      {!isForging && (
                        <div className="absolute bottom-6 left-6 right-6">
                          <p className="text-stone-600 text-xs tracking-wide">Click to replace</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Empty state */
                    <div className="aspect-[4/3] flex flex-col items-center justify-center gap-6 hover:bg-stone-950/30 transition-all">
                      {isForging ? (
                        <>
                          <MinimalSpinner />
                          <p className="text-stone-600 text-xs tracking-widest">IMPRINTING</p>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 border-hairline border-stone-800 flex items-center justify-center">
                            <i className="ri-add-line text-2xl text-stone-800"></i>
                          </div>
                          <div className="text-center">
                            <p className="text-stone-600 text-xs tracking-widest mb-2">DROP IMAGE HERE</p>
                            <p className="text-stone-800 text-xs tracking-wide">or click to browse</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </label>
              </div>

              {/* Result Area */}
              {forgedCard && !isForging ? (
                <div className="space-y-8 pt-8 border-t border-stone-900">
                  {/* Card preview */}
                  <div className="animate-fade-in">
                    <div className="max-w-[280px] mx-auto">
                      <HeroCard card={forgedCard} />
                    </div>
                  </div>

                  {/* Rarity text */}
                  <div className="text-center">
                    <p className={`text-xs tracking-[0.2em] uppercase ${
                      forgedCard.rarity === 'mythic' ? 'text-gold-400' :
                      forgedCard.rarity === 'epic'   ? 'text-rarity-epic' :
                      forgedCard.rarity === 'rare'   ? 'text-rarity-rare' :
                      'text-stone-600'
                    }`}>
                      {forgedCard.rarity} Relic
                    </p>
                  </div>

                  {/* Action Buttons */}
                  {showSuccess ? (
                    <div className="text-center py-8">
                      <p className="text-stone-600 text-xs tracking-widest">SAVED TO VAULT</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-6">
                      <button
                        onClick={handleReforge}
                        className="text-stone-600 text-xs tracking-widest hover:text-stone-400 transition-all cursor-pointer"
                      >
                        REFORGE
                      </button>
                      <div className="w-px h-4 bg-stone-900"></div>
                      <button
                        onClick={handleSaveCard}
                        className="text-gold-400 text-xs tracking-widest hover:text-gold-300 transition-all cursor-pointer"
                      >
                        SAVE TO VAULT
                      </button>
                    </div>
                  )}

                  <div className="text-center">
                    <button
                      onClick={handleReset}
                      className="text-stone-800 text-xs tracking-wide hover:text-stone-700 transition-all cursor-pointer"
                    >
                      ← Forge another
                    </button>
                  </div>
                </div>
              ) : isForging ? (
                <div className="py-20 text-center border-t border-stone-900">
                  <MinimalSpinner large />
                  <p className="text-stone-600 text-xs tracking-widest mt-8">EXTRACTING ESSENCE</p>
                </div>
              ) : (
                <div className="py-12 text-center border-t border-stone-900">
                  <p className="text-stone-800 text-xs tracking-wide">Awaiting essence</p>
                </div>
              )}

              {/* Quick link to vault */}
              {!forgedCard && !isForging && (
                <div className="text-center pt-8">
                  <Link
                    to="/vault"
                    className="inline-flex items-center gap-2 text-stone-700 text-xs tracking-widest hover:text-stone-600 transition-all cursor-pointer"
                  >
                    VIEW VAULT
                    <i className="ri-arrow-right-line text-xs"></i>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MinimalSpinner({ large = false }: { large?: boolean }) {
  const size = large ? 'w-16 h-16' : 'w-10 h-10';
  return (
    <div className={`relative ${size} flex items-center justify-center`}>
      {/* Single thin ring */}
      <div className="absolute inset-0 border-hairline border-stone-800 border-t-gold-400 rounded-full animate-spin-slow"></div>
    </div>
  );
}