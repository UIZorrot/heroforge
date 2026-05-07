import { motion, type Variants } from 'framer-motion';
import { ArrowRight, Swords, Sparkles, Shield, ScrollText, ChevronRight } from 'lucide-react';
import { AppLogo } from './AppLogo';

type LandingSectionKey = 'forge' | 'barracks' | 'train' | 'duel' | 'chronicle';

interface LandingPageProps {
  onNavigate: (section: LandingSectionKey) => void;
  onLogin: () => void;
  isAuthenticated: boolean;
}

export function LandingPage({ onNavigate, onLogin }: LandingPageProps) {
  const fadeUpVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98] } },
  };

  const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  return (
    <div className="relative min-h-screen bg-[#050403] text-stone-200 selection:bg-[#c59a5a]/25 overflow-x-hidden">
      {/* Global Background Effects */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(197,154,90,0.08),transparent_50%),radial-gradient(circle_at_100%_100%,rgba(255,255,255,0.03),transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_10%,transparent_90%,rgba(255,255,255,0.02))]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')] opacity-[0.035] mix-blend-overlay" />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 flex items-center justify-between px-6 py-6 sm:px-12">
        <AppLogo
          iconClassName="h-8 w-8 sm:h-10 sm:w-10"
          textClassName="text-[clamp(1.2rem,1.5vw,1.5rem)] tracking-[0.2em]"
        />
        <button
          type="button"
          onClick={onLogin}
          className="group flex items-center gap-3 border border-[#c59a5a] bg-[#c59a5a] px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.3em] text-black shadow-[0_0_15px_rgba(197,154,90,0.2)] transition-all hover:bg-[#f0d8ad] hover:border-[#f0d8ad]"
        >
          Play Now
          <ChevronRight size={14} className="transition-transform group-hover:translate-x-1" />
        </button>
      </nav>

      <main className="relative z-10 flex flex-col items-center">
        {/* 1. Hero Section */}
        <section className="relative flex min-h-[85vh] w-full max-w-[1400px] flex-col items-center justify-center px-6 text-center">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="relative z-10 flex flex-col items-center"
          >
            <motion.p variants={fadeUpVariants} className="mb-6 text-[10px] uppercase tracking-[0.5em] text-[#c59a5a]">
              A dark tactical hero-card battler
            </motion.p>
            <motion.h1
              variants={fadeUpVariants}
              className="max-w-5xl font-display text-[clamp(4rem,10vw,11rem)] font-light leading-[0.85] tracking-[-0.04em] text-stone-50 uppercase"
            >
              Where Images<br />
              <span className="bg-gradient-to-b from-[#f0d8ad] to-[#c59a5a] bg-clip-text text-transparent">Become Heroes</span>
            </motion.h1>
            <motion.p variants={fadeUpVariants} className="mt-10 max-w-2xl text-base leading-relaxed text-stone-400 sm:text-lg">
              You are not just collecting cards. You are running a command console for a living battle archive. Forge heroes from your imagination, test their limits, and stake your claim in the PvP arena.
            </motion.p>

            <motion.div variants={fadeUpVariants} className="mt-14 flex flex-col gap-4 sm:flex-row sm:gap-6">
              <button
                type="button"
                onClick={() => onNavigate('forge')}
                className="group relative inline-flex h-16 items-center justify-center gap-3 overflow-hidden border border-[#c59a5a]/50 bg-[#c59a5a]/10 px-10 text-[11px] font-bold uppercase tracking-[0.35em] text-[#f0d8ad] transition-all hover:bg-[#c59a5a] hover:text-black"
              >
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <Sparkles size={18} />
                Initialize Forge
              </button>
              <button
                type="button"
                onClick={() => onNavigate('chronicle')}
                className="group inline-flex h-16 items-center justify-center gap-3 border border-white/10 bg-transparent px-10 text-[11px] font-bold uppercase tracking-[0.35em] text-stone-300 transition-colors hover:border-white/30 hover:bg-white/5"
              >
                <ScrollText size={18} />
                Discover Lore
              </button>
            </motion.div>
          </motion.div>

          {/* Decorative Hero Elements */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              className="h-[40rem] w-[40rem] rounded-full border border-[#c59a5a]/10"
              animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              className="h-[30rem] w-[30rem] rounded-full border border-[#c59a5a]/20 border-dashed"
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        </section>

        {/* 2. Feature: Forge */}
        <section className="relative w-full border-t border-white/5 bg-black/40 py-24 sm:py-32">
          <div className="mx-auto grid max-w-[1400px] gap-16 px-6 lg:grid-cols-2 lg:items-center lg:gap-24">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="max-w-xl text-left"
            >
              <motion.p variants={fadeUpVariants} className="text-[10px] uppercase tracking-[0.4em] text-[#c59a5a]">The Forge</motion.p>
              <motion.h2 variants={fadeUpVariants} className="mt-4 font-display text-[clamp(2.5rem,5vw,4.5rem)] font-light leading-[0.9] text-stone-100 uppercase">
                Craft Your <br /><span className="text-stone-500">Champions</span>
              </motion.h2>
              <motion.p variants={fadeUpVariants} className="mt-8 text-lg leading-relaxed text-stone-400">
                Upload any image and watch the living battle archive turn it into a unique hero. AI-assisted concepting meets rule-based numeric generation for balanced, tactical stats. Every creation is uniquely yours.
              </motion.p>
              <motion.div variants={fadeUpVariants} className="mt-10">
                <button onClick={() => onNavigate('forge')} className="group flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-[#c59a5a] transition-colors hover:text-[#f0d8ad]">
                  Enter the Forge Chamber <ArrowRight size={16} className="transition-transform group-hover:translate-x-2" />
                </button>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="relative aspect-square w-full max-w-md mx-auto lg:mx-0"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(197,154,90,0.15),transparent_60%)]" />
              <div className="absolute inset-4 border border-[#c59a5a]/20 bg-[#0a0a0a] shadow-2xl flex flex-col justify-between p-6">
                <div className="flex justify-between items-start border-b border-white/10 pb-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Input Phase</div>
                    <div className="mt-2 text-xl font-light text-stone-200">Image Processing</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-[#c59a5a]">Cost</div>
                    <div className="mt-2 text-xl font-light text-stone-200">100 Dust</div>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="h-32 w-32 rounded-full border border-dashed border-[#c59a5a]/40 animate-[spin_20s_linear_infinite]" />
                </div>
                <div className="border-t border-white/10 pt-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-3">Generation Output</div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-[#c59a5a] w-[75%]" />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 3. Feature: Train */}
        <section className="relative w-full py-24 sm:py-32">
          <div className="mx-auto grid max-w-[1400px] gap-16 px-6 lg:grid-cols-2 lg:items-center lg:gap-24">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="order-2 lg:order-1 relative aspect-video w-full border border-white/10 bg-[linear-gradient(145deg,rgba(15,15,15,0.8),rgba(5,5,5,0.9))]"
            >
              <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')] opacity-[0.05] mix-blend-overlay" />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-white/10 bg-black/40 px-4 py-3">
                <span className="text-[9px] uppercase tracking-[0.3em] text-stone-500">Sandbox Environment</span>
                <span className="text-[9px] uppercase tracking-[0.3em] text-emerald-500/70">Safe Zone</span>
              </div>
              <div className="absolute inset-0 flex items-center justify-center p-8 pt-16">
                <div className="grid w-full grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex flex-col items-center justify-center gap-2 border border-white/5 bg-white/[0.02] py-6 transition-colors hover:bg-white/[0.04]">
                      <Shield size={20} className="text-stone-600" />
                      <span className="text-[9px] uppercase tracking-[0.2em] text-stone-500">Unit {i}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="order-1 lg:order-2 max-w-xl text-left"
            >
              <motion.p variants={fadeUpVariants} className="text-[10px] uppercase tracking-[0.4em] text-[#c59a5a]">The Barracks</motion.p>
              <motion.h2 variants={fadeUpVariants} className="mt-4 font-display text-[clamp(2.5rem,5vw,4.5rem)] font-light leading-[0.9] text-stone-100 uppercase">
                Private Training <br /><span className="text-stone-500">Grounds</span>
              </motion.h2>
              <motion.p variants={fadeUpVariants} className="mt-8 text-lg leading-relaxed text-stone-400">
                Test your newly forged heroes in the sandbox Train mode. Experiment with 1v1 and 4v4 formats without matchmaking pressure. Validate builds and perfect your team compositions before entering the real war.
              </motion.p>
              <motion.div variants={fadeUpVariants} className="mt-10">
                <button onClick={() => onNavigate('train')} className="group flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-[#c59a5a] transition-colors hover:text-[#f0d8ad]">
                  Initiate Training Sequence <ArrowRight size={16} className="transition-transform group-hover:translate-x-2" />
                </button>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* 4. Feature: Arena */}
        <section className="relative w-full border-y border-white/5 bg-black/40 py-24 sm:py-32">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(197,154,90,0.05),transparent_50%)]" />
          <div className="mx-auto grid max-w-[1400px] gap-16 px-6 lg:grid-cols-2 lg:items-center lg:gap-24">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="max-w-xl text-left"
            >
              <motion.p variants={fadeUpVariants} className="text-[10px] uppercase tracking-[0.4em] text-[#c59a5a]">PvP Arena</motion.p>
              <motion.h2 variants={fadeUpVariants} className="mt-4 font-display text-[clamp(2.5rem,5vw,4.5rem)] font-light leading-[0.9] text-stone-100 uppercase">
                Skill Beats <br /><span className="text-stone-500">Luck</span>
              </motion.h2>
              <motion.p variants={fadeUpVariants} className="mt-8 text-lg leading-relaxed text-stone-400">
                Enter formal matchmaking where only players within a 10% Battle Power gap can fight. Stake your Dust, outsmart opponents with lane-aware tactics, and claim the winner's pool. No holding back, no holding hands.
              </motion.p>
              <motion.div variants={fadeUpVariants} className="mt-10">
                <button onClick={() => onNavigate('duel')} className="group flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-[#c59a5a] transition-colors hover:text-[#f0d8ad]">
                  Enter the Arena <ArrowRight size={16} className="transition-transform group-hover:translate-x-2" />
                </button>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
              className="relative aspect-square w-full max-w-md mx-auto lg:mx-0 flex items-center justify-center"
            >
              <div className="absolute inset-0 rounded-full border border-[#c59a5a]/20 bg-[radial-gradient(circle_at_center,rgba(197,154,90,0.1),transparent_70%)] blur-md" />
              <div className="relative flex items-center justify-center gap-8">
                <div className="h-48 w-32 border border-[#c59a5a]/40 bg-[#0a0a0a] shadow-[0_0_30px_rgba(197,154,90,0.15)] -rotate-6 transform transition-transform hover:rotate-0" />
                <Swords size={32} className="text-[#c59a5a]" />
                <div className="h-48 w-32 border border-white/20 bg-[#0a0a0a] shadow-xl rotate-6 transform transition-transform hover:rotate-0" />
              </div>
            </motion.div>
          </div>
        </section>

        {/* 5. Modes Grid */}
        <section className="relative w-full py-24 sm:py-32">
          <div className="mx-auto max-w-[1400px] px-6">
            <div className="text-center mb-16">
              <h2 className="font-display text-4xl font-light tracking-[0.05em] text-stone-100 uppercase">More Than One Way To Play</h2>
              <div className="mt-4 h-px w-24 mx-auto bg-gradient-to-r from-transparent via-[#c59a5a]/50 to-transparent" />
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: 'Forge', desc: 'AI-assisted hero creation from image inputs.', icon: Sparkles, action: 'forge' as LandingSectionKey },
                { title: 'Train', desc: 'Sandbox battle mode for private experimentation.', icon: Shield, action: 'train' as LandingSectionKey },
                { title: 'Arena', desc: 'Formal PvP mode with queue-based matchmaking.', icon: Swords, action: 'duel' as LandingSectionKey },
                { title: 'Archive', desc: 'Persistent vault and story exploration.', icon: ScrollText, action: 'chronicle' as LandingSectionKey },
              ].map((mode, i) => (
                <motion.div
                  key={mode.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className="group relative border border-white/10 bg-[#080808] p-8 transition-all hover:border-[#c59a5a]/40 hover:bg-[#0a0a0a]"
                >
                  <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/5 p-4 text-stone-400 transition-colors group-hover:border-[#c59a5a]/30 group-hover:text-[#c59a5a]">
                    <mode.icon size={24} />
                  </div>
                  <h3 className="font-display text-2xl tracking-wide text-stone-200">{mode.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-stone-500">{mode.desc}</p>
                  <button onClick={() => onNavigate(mode.action)} className="mt-8 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-stone-400 group-hover:text-[#c59a5a]">
                    Explore <ArrowRight size={14} />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Footer CTA */}
        <section className="relative w-full border-t border-white/10 bg-[linear-gradient(to_bottom,#050403,#0a0a0a)] py-32 text-center">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')] opacity-[0.03] mix-blend-overlay" />
            <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative z-10 flex flex-col items-center px-6"
          >
            <h2 className="font-display text-[clamp(3rem,6vw,5rem)] font-light leading-none text-stone-100 uppercase">
              The Archive <span className="text-[#c59a5a] italic">Awaits</span>
            </h2>
            <p className="mt-6 max-w-xl text-lg text-stone-400">
              Join the living battle archive today. Forge your first hero and prepare for war.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('chronicle')}
              className="mt-12 group relative inline-flex h-16 items-center justify-center gap-3 overflow-hidden border border-[#c59a5a]/80 bg-[#c59a5a] px-12 text-[12px] font-bold uppercase tracking-[0.4em] text-black transition-transform hover:scale-105"
            >
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.3)_50%,transparent_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              Discover More
            </button>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
