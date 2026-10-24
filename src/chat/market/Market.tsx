import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebouncedCallback } from 'use-debounce';
import { Dices, Heart, LayoutGrid, List, Search, ShieldCheck, X } from 'lucide-react';
import { marketplace } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import { BOT_CATEGORIES, CATEGORY_EMOJI } from '../../lib/marketplace';
import { useFavourites, useRecent } from '../../lib/marketLocal';
import { BotCardTile, type Listing } from './BotCard';
import CompareTray from './CompareTray';

export { BotCardTile, Stars, type Listing } from './BotCard';
const SORTS = [['popular', 'Popular'], ['top', 'Top rated'], ['new', 'New'], ['name', 'A–Z']] as const;
type Sort = (typeof SORTS)[number][0];

function Row({ title, items, open, action }: { title: string; items: Listing[]; open: (id: string) => void; action?: React.ReactNode }) {
  if (!items.length) return null;
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>{action}</div>
      <div className="mt-3 flex gap-4 overflow-x-auto pb-2">{items.map((l) => <div key={l.id} className="w-64 shrink-0"><BotCardTile l={l} onOpen={() => open(l.id)} /></div>)}</div>
    </div>
  );
}

export default function Market() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const cat = params.get('cat') ?? '';
  const sort = (params.get('sort') as Sort) || 'popular';
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [favOnly, setFavOnly] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('market:view') as 'grid' | 'list') || 'grid');
  const [list, setList] = useState<Listing[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { favs, isFav } = useFavourites();
  const { recent, clear } = useRecent();
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  const load = useDebouncedCallback(async (query: string, category: string, s: Sort) => {
    try { setList((await marketplace({ action: 'browse', q: query, category, sort: s === 'name' ? 'popular' : s })).listings); } catch { setList([]); }
  }, 250);
  useEffect(() => { setList(null); load(q, cat, sort); }, [cat, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  useEffect(() => { localStorage.setItem('market:view', view); }, [view]);

  const shown = useMemo(() => {
    let r = (list ?? []).filter((l) => (!verifiedOnly || l.verified) && (l.rating ?? 0) >= minRating && (!favOnly || isFav(l.id)));
    if (sort === 'name') r = [...r].sort((a, b) => a.name.localeCompare(b.name));
    return r;
  }, [list, verifiedOnly, minRating, favOnly, sort, favs]); // eslint-disable-line react-hooks/exhaustive-deps
  const home = !q && !cat && sort === 'popular' && !verifiedOnly && !minRating && !favOnly;
  const all = list ?? [];
  const open = (id: string) => navigate(`/app/bots/${id}`);
  const filtered = !!(q || cat || verifiedOnly || minRating || favOnly);
  const reset = () => { setQ(''); setVerifiedOnly(false); setMinRating(0); setFavOnly(false); setParams({}, { replace: true }); load('', '', 'popular'); };
  const stats = [[all.length, 'bots'], [all.filter((l) => l.verified).length, 'verified'], [all.reduce((s, l) => s + l.installs, 0), 'installs']] as const;

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 pb-28 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bot marketplace</h1><p className="mt-2 text-muted-foreground">Add bots built by the community to your servers.</p></div>
          <div className="flex gap-4 text-sm">{stats.map(([n, l]) => <div key={l}><p className="text-xl font-semibold tabular-nums">{list ? n.toLocaleString() : '—'}</p><p className="text-xs text-muted-foreground">{l}</p></div>)}</div>
        </div>
        <div className="mt-6 flex gap-2">
          <label className="flex h-12 flex-1 items-center gap-2 rounded-2xl bg-secondary px-4 focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input ref={searchRef} value={q} onChange={(e) => { setQ(e.target.value); setParam('q', e.target.value); load(e.target.value, cat, sort); }} placeholder="Search bots, tags, features…" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
            {q ? <button onClick={() => { setQ(''); setParam('q', ''); load('', cat, sort); }} aria-label="Clear"><X className="h-4 w-4" /></button> : <kbd className="hidden rounded border border-border px-1.5 text-xs text-muted-foreground sm:block">/</kbd>}
          </label>
          <button onClick={() => all.length && open(all[Math.floor(Math.random() * all.length)].id)} title="Surprise me" className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary"><Dices className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {['', ...BOT_CATEGORIES].map((c) => <button key={c || 'all'} onClick={() => setParam('cat', c)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium', cat === c ? 'border-foreground bg-foreground text-background' : 'border-border')}>{c ? `${CATEGORY_EMOJI[c]} ${c}` : 'All'}</button>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex gap-1 rounded-full bg-secondary p-1">{SORTS.map(([k, label]) => <button key={k} onClick={() => setParam('sort', k === 'popular' ? '' : k)} className={cn('rounded-full px-3 py-1.5 font-medium', sort === k ? 'bg-background shadow-sm' : 'text-muted-foreground')}>{label}</button>)}</div>
          <button onClick={() => setVerifiedOnly(!verifiedOnly)} className={cn('inline-flex h-8 items-center gap-1 rounded-full border px-3 font-medium', verifiedOnly ? 'border-primary bg-primary/10 text-primary' : 'border-border')}><ShieldCheck className="h-3.5 w-3.5" />Verified</button>
          <button onClick={() => setFavOnly(!favOnly)} className={cn('inline-flex h-8 items-center gap-1 rounded-full border px-3 font-medium', favOnly ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border')}><Heart className="h-3.5 w-3.5" />Favourites{favs.length ? ` · ${favs.length}` : ''}</button>
          <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="h-8 rounded-full border border-border bg-background px-2 font-medium"><option value={0}>Any rating</option><option value={3}>3★ & up</option><option value={4}>4★ & up</option><option value={4.5}>4.5★ & up</option></select>
          <div className="ml-auto flex gap-1 rounded-full bg-secondary p-1">{([['grid', LayoutGrid], ['list', List]] as const).map(([v, I]) => <button key={v} onClick={() => setView(v)} aria-label={`${v} view`} className={cn('grid h-7 w-7 place-items-center rounded-full', view === v && 'bg-background shadow-sm')}><I className="h-3.5 w-3.5" /></button>)}</div>
        </div>
        {home && <>
          <Row title="Featured" items={all.filter((l) => l.featured).slice(0, 6)} open={open} />
          <Row title="Recently viewed" items={recent.map((id) => all.find((l) => l.id === id)).filter(Boolean) as Listing[]} open={open} action={<button onClick={clear} className="text-xs text-muted-foreground hover:underline">Clear</button>} />
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">All bots</h2>
        </>}
        <div className={cn('mt-4 grid gap-4', view === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'gap-2')}>
          {list === null && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className={view === 'grid' ? 'h-52 rounded-3xl' : 'h-20 rounded-2xl'} />)}
          {list && shown.map((l) => <BotCardTile key={l.id} l={l} row={view === 'list'} onOpen={() => open(l.id)} />)}
        </div>
        {list && !shown.length && <div className="py-16 text-center text-muted-foreground"><p>{filtered ? 'No bots match these filters.' : 'No bots published yet — be the first from the developer portal.'}</p>{filtered && <button onClick={reset} className="mt-3 h-9 rounded-full border border-border px-4 text-sm">Reset filters</button>}</div>}
      </div>
      <CompareTray pool={all} open={comparing} setOpen={setComparing} />
    </section>
  );
}
