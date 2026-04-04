import { motion } from 'framer-motion';

export function ParticleBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-[#c59a5a]/12 blur-3xl"
        animate={{ x: [0, 18, 0], y: [0, -10, 0], opacity: [0.18, 0.28, 0.18] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-10 top-1/4 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl"
        animate={{ x: [0, -20, 0], opacity: [0.1, 0.22, 0.1] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-cyan-400/8 blur-3xl"
        animate={{ y: [0, -18, 0], opacity: [0.08, 0.18, 0.08] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(197,154,90,0.10),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.10),transparent_24%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:44px_44px] opacity-30" />
    </div>
  );
}
