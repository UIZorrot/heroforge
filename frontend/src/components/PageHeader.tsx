import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type PageHeaderProps = {
  title: string;
  eyebrow: string;
  subtitle: string;
  description: ReactNode;
  stats?: ReactNode;
  className?: string;
};

export function PageHeader({ title, eyebrow, subtitle, description, stats, className }: PageHeaderProps) {
  return (
    <section className={cn('border-b border-white/8 pb-6', className)}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end">
        <h1 className="font-display text-4xl font-light uppercase leading-none tracking-[0.34em] text-stone-100 sm:text-5xl xl:text-6xl">
          {title}
        </h1>
        <div className="hidden h-14 border-l border-white/10 xl:block" />
        <div className="pb-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#b49664]">{eyebrow}</div>
          <div className="mt-2 flex flex-wrap items-center gap-5">
            <h2 className="font-display text-2xl font-light uppercase tracking-[0.24em] text-stone-100 sm:text-3xl">{subtitle}</h2>
            <div className="h-7 border-l border-white/10" />
            <p className="max-w-2xl text-sm leading-6 text-stone-500">{description}</p>
          </div>
        </div>
      </div>
      {stats && <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-4">{stats}</div>}
    </section>
  );
}

export function PageHeaderStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex h-[148px] flex-col border border-white/8 bg-black/20 px-5 py-6">
      <div className="flex h-11 items-start text-[10px] font-semibold uppercase leading-5 tracking-[0.24em] text-stone-600">
        {label}
      </div>
      <div className="text-2xl font-light leading-none tracking-[0.04em] text-stone-200">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
