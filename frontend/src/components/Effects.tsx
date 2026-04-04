import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type ChipTone = 'gold' | 'violet' | 'emerald' | 'slate' | 'amber';

const chipToneMap: Record<ChipTone, string> = {
  gold: 'border-[#c59a5a]/40 bg-[#c59a5a]/10 text-[#f0d8ad]',
  violet: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  slate: 'border-stone-700 bg-stone-950/60 text-stone-300',
  amber: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
};

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      {eyebrow && <div className="text-[10px] uppercase tracking-[0.35em] text-stone-500">{eyebrow}</div>}
      <h2 className="text-2xl font-light tracking-[0.12em] text-stone-100 sm:text-3xl">{title}</h2>
      {description && <p className="max-w-2xl text-sm leading-6 text-stone-400">{description}</p>}
    </div>
  );
}

export function StatPill({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  tone?: ChipTone;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 border px-2.5 py-1 text-[11px] tracking-[0.12em]', chipToneMap[tone])}>
      <span className="text-[10px] uppercase text-stone-400">{label}</span>
      <span className="font-mono">{value}</span>
    </span>
  );
}

export function StatusPill({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: ChipTone;
}) {
  return <span className={cn('inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.2em]', chipToneMap[tone])}>{children}</span>;
}

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="border border-stone-800 bg-black/40 p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{label}</div>
      <div className="mt-2 text-3xl font-light tracking-[0.08em] text-stone-100">{value}</div>
      {hint && <div className="mt-2 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-stone-800 bg-black/30 p-8 text-center">
      <div className="text-xl font-light tracking-[0.12em] text-stone-100">{title}</div>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-400">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function HitSparks({ color = '#f59e0b' }: { color?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.6 }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle, ${color}66 0%, transparent 70%)`,
          }}
        />
      </motion.div>
    </div>
  );
}

export function HealAura() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 rounded-2xl bg-emerald-400/10"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 0.8 }}
    />
  );
}

export function PoisonAura() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 rounded-2xl bg-violet-500/10"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 0.8 }}
    />
  );
}
