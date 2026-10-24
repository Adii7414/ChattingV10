import { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { marketplace } from 'zitejs/api';
import { cn } from '@project/components/lib/utils';
import type { Listing } from '../BotCard';
import { toPatch, type Patch } from './Editor';
import { errorMessage } from '../../../lib/errors';

export type { Listing };
export type AppsCtx = { apps: Listing[] | null; reload: () => Promise<void> };
export const Apps = createContext<AppsCtx>({ apps: null, reload: async () => {} });
export const useApps = () => useContext(Apps);

export const copyText = (s: string, msg = 'Copied') => { navigator.clipboard.writeText(s); toast.success(msg); };

/** Saves only some listing fields, keeping the rest as they are. */
export async function savePart(l: Listing, part: Partial<Patch>, ok = 'Saved') {
  try { const r = await marketplace({ action: 'save', listingId: l.id, patch: { ...toPatch(l), ...part } }); toast.success(ok); return r.listing; }
  catch (e) { toast.error(errorMessage(e, 'Couldn’t save')); return null; }
}

export function useLocal<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : init; } catch { return init; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* full */ } }, [key, v]);
  return [v, setV] as const;
}

export function PageHead({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{desc && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{desc}</p>}</div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ title, desc, right, children, className }: { title?: string; desc?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5', className)}>
      {(title || right) && <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div>{title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>}{desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}</div>{right}</div>}
      {children}
    </section>
  );
}

export function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
        <span className={cn('min-w-0 flex-1 truncate text-sm', mono && 'font-mono text-xs')}>{value}</span>
        <button onClick={() => copyText(value)} aria-label={`Copy ${label}`} className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-background">Copy</button>
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return <div className="rounded-xl border border-border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>{hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}</div>;
}

export function Code({ code }: { code: string }) {
  return <div className="relative"><pre className="max-h-80 overflow-auto rounded-xl bg-secondary p-3 font-mono text-[11px] leading-relaxed"><code>{code}</code></pre><button onClick={() => copyText(code)} aria-label="Copy" className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-background"><Copy className="h-3.5 w-3.5" /></button></div>;
}

export const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
