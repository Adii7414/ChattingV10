import { Download, GitCompare, Heart, Sparkles, Star } from 'lucide-react';
import type { MarketplaceOutputType } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import { CATEGORY_EMOJI } from '../../lib/marketplace';
import { RISK_CLASS, RISK_LABEL, isNew, riskOf, useCompare, useFavourites } from '../../lib/marketLocal';
import { BotAvatar, BotBadge } from '../BotMessage';

export type Listing = MarketplaceOutputType['listings'][number];

export function Stars({ value, size = 12 }: { value: number | null; size?: number }) {
  return <span className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} style={{ width: size, height: size }} className={cn(value != null && i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />)}</span>;
}

function Actions({ l }: { l: Listing }) {
  const { isFav, toggle } = useFavourites();
  const c = useCompare();
  const stop = (f: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); f(); };
  return (
    <div className="flex gap-1">
      <button onClick={stop(() => c.toggle(l.id))} aria-label="Compare" title="Compare" className={cn('grid h-8 w-8 place-items-center rounded-full bg-background/80 backdrop-blur', c.inCompare(l.id) && 'text-primary')}><GitCompare className="h-4 w-4" /></button>
      <button onClick={stop(() => toggle(l.id))} aria-label="Favourite" title="Favourite" className="grid h-8 w-8 place-items-center rounded-full bg-background/80 backdrop-blur"><Heart className={cn('h-4 w-4', isFav(l.id) && 'fill-destructive text-destructive')} /></button>
    </div>
  );
}

function Meta({ l }: { l: Listing }) {
  const r = riskOf(l.permissions);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>{CATEGORY_EMOJI[l.category]} {l.category}</span>
      <span className="flex items-center gap-1"><Download className="h-3 w-3" />{l.installs}</span>
      {l.rating != null && <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{l.rating}</span>}
      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', RISK_CLASS[r])}>{RISK_LABEL[r]}</span>
    </div>
  );
}

export function BotCardTile({ l, onOpen, row }: { l: Listing; onOpen: () => void; row?: boolean }) {
  const badges = <>{l.featured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300"><Sparkles className="h-3 w-3" />Featured</span>}{isNew(l.createdAt) && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">NEW</span>}</>;
  if (row) return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} className="flex cursor-pointer items-center gap-4 rounded-2xl border border-border bg-card p-3 transition hover:bg-secondary/50">
      <BotAvatar name={l.name} avatar={l.avatar} size={44} />
      <div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 font-semibold"><span className="truncate">{l.name}</span><BotBadge verified={l.verified} />{badges}</p><p className="truncate text-sm text-muted-foreground">{l.tagline}</p><Meta l={l} /></div>
      <Actions l={l} />
    </div>
  );
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} className="group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-border bg-card text-left transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="h-16" style={{ background: `linear-gradient(135deg, ${l.accentColor}, ${l.accentColor}33)` }} />
      <div className="absolute right-3 top-3"><Actions l={l} /></div>
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="-mt-7 flex items-end gap-2"><span className="rounded-full border-4 border-card bg-card"><BotAvatar name={l.name} avatar={l.avatar} size={52} /></span><span className="mb-1 flex gap-1">{badges}</span></div>
        <p className="mt-2 flex items-center gap-1.5 font-semibold"><span className="truncate">{l.name}</span><BotBadge verified={l.verified} /></p>
        <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">{l.tagline}</p>
        <div className="mt-3"><Meta l={l} /></div>
      </div>
    </div>
  );
}
