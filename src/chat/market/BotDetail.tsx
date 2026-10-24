import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Download, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { marketplace, type MarketplaceOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Textarea } from '@project/components/ui/textarea';
import { useChat } from '../store';
import { errorMessage } from '../../lib/errors';
import { CATEGORY_EMOJI } from '../../lib/marketplace';
import { BotAvatar, BotBadge } from '../BotMessage';
import { Stars } from './Market';
import { Heart, Share2, GitCompare } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { listingUrl, useCompare, useFavourites, useRecent } from '../../lib/marketLocal';
import { Commands, Permissions, Related, Screenshots } from './DetailParts';

function HeaderActions({ id, name }: { id: string; name: string }) {
  const { isFav, toggle } = useFavourites();
  const c = useCompare();
  const share = async () => { const url = listingUrl(id); if (navigator.share) { try { await navigator.share({ title: name, url }); return; } catch { /* cancelled */ } } navigator.clipboard.writeText(url); toast.success('Link copied'); };
  const b = 'grid h-9 w-9 place-items-center rounded-full border border-border';
  return <div className="flex gap-2">
    <button onClick={share} aria-label="Share" title="Share" className={b}><Share2 className="h-4 w-4" /></button>
    <button onClick={() => c.toggle(id)} aria-label="Compare" title="Add to compare (open the marketplace to compare)" className={cn(b, c.inCompare(id) && 'border-primary text-primary')}><GitCompare className="h-4 w-4" /></button>
    <button onClick={() => toggle(id)} aria-label="Favourite" title="Favourite" className={b}><Heart className={cn('h-4 w-4', isFav(id) && 'fill-destructive text-destructive')} /></button>
  </div>;
}

type Data = MarketplaceOutputType;

function Install({ d, reload }: { d: Data; reload: (n: Data) => void }) {
  const { communities, can, refresh } = useChat();
  const mine = communities.filter((c) => can(c.id, 'manageCommunity'));
  const [cid, setCid] = useState<string>();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!cid) return;
    setBusy(true);
    try { reload(await marketplace({ action: 'install', listingId: d.listing!.id, communityId: cid })); await refresh(); toast.success(`${d.listing!.name} added 🎉`); setCid(undefined); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t add the bot')); } finally { setBusy(false); }
  };
  if (!mine.length) return <p className="text-sm text-muted-foreground">You need to own or manage a community to add bots.</p>;
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={cid} onValueChange={setCid}>
        <SelectTrigger className="h-11 rounded-full sm:w-64"><SelectValue placeholder="Choose a community" /></SelectTrigger>
        <SelectContent>{mine.map((c) => <SelectItem key={c.id} value={c.id} disabled={d.installedIn.includes(c.id)}>{c.name}{d.installedIn.includes(c.id) ? ' · added' : ''}</SelectItem>)}</SelectContent>
      </Select>
      <button onClick={go} disabled={!cid || busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Add to server</button>
    </div>
  );
}

function Reviews({ d, reload }: { d: Data; reload: (n: Data) => void }) {
  const [rating, setRating] = useState(d.myReview?.rating ?? 0);
  const [body, setBody] = useState(d.myReview?.body ?? '');
  const [reply, setReply] = useState<Record<string, string>>({});
  const l = d.listing!;
  const submit = async () => {
    try { reload(await marketplace({ action: 'review', listingId: l.id, rating, body })); toast.success('Review saved'); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save')); }
  };
  const sendReply = async (id: string) => {
    try { reload(await marketplace({ action: 'reply', listingId: l.id, reviewId: id, body: reply[id] ?? '' })); toast.success('Reply posted'); } catch (e) { toast.error(errorMessage(e, 'Couldn’t reply')); }
  };
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: d.reviews.filter((r) => r.rating === s).length }));
  const [rsort, setRsort] = useState<'new' | 'high' | 'low'>('new');
  const [star, setStar] = useState(0);
  const reviews = d.reviews.filter((r) => !star || r.rating === star).sort((a, b) => rsort === 'high' ? b.rating - a.rating : rsort === 'low' ? a.rating - b.rating : b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold">Reviews</h2>
      <div className="mt-4 grid gap-6 sm:grid-cols-[200px_1fr]">
        <div><p className="text-4xl font-semibold">{l.rating ?? '—'}</p><Stars value={l.rating} size={14} /><p className="mt-1 text-xs text-muted-foreground">{l.ratingCount} review{l.ratingCount === 1 ? '' : 's'}</p>
          <div className="mt-3 space-y-1">{dist.map(({ s, n }) => <div key={s} role="button" onClick={() => setStar(star === s ? 0 : s)} className={cn('flex cursor-pointer items-center gap-2 rounded text-xs', star === s && 'font-semibold text-foreground')}><span className="w-3">{s}</span><div className="h-1.5 flex-1 rounded-full bg-secondary"><div className="h-full rounded-full bg-amber-400" style={{ width: `${d.reviews.length ? (n / d.reviews.length) * 100 : 0}%` }} /></div></div>)}</div>
        </div>
        <div className="space-y-4">
          {!l.mine && <div className="rounded-2xl border border-border p-4">
            <p className="text-sm font-medium">{d.myReview ? 'Update your review' : 'Write a review'}</p>
            <div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((i) => <button key={i} onClick={() => setRating(i)} aria-label={`${i} stars`} className={`text-2xl ${i <= rating ? 'text-amber-400' : 'text-muted-foreground/30'}`}>★</button>)}</div>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="What do you like? What could be better?" className="mt-2" />
            <button onClick={submit} disabled={!rating} className="mt-2 h-9 rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50">Post review</button>
          </div>}
          {d.reviews.length > 1 && <div className="flex flex-wrap items-center gap-2 text-xs">
            {([['new', 'Newest'], ['high', 'Highest'], ['low', 'Lowest']] as const).map(([k, t]) => <button key={k} onClick={() => setRsort(k)} className={cn('rounded-full border px-3 py-1', rsort === k ? 'border-foreground bg-foreground text-background' : 'border-border')}>{t}</button>)}
            {star > 0 && <button onClick={() => setStar(0)} className="rounded-full bg-secondary px-3 py-1">{star}★ only ✕</button>}
          </div>}
          {reviews.length === 0 && <p className="text-sm text-muted-foreground">No reviews {star ? 'with that rating' : 'yet'}.</p>}
          {reviews.map((r) => (
            <div key={r.id} className={cn('rounded-2xl bg-secondary/50 p-4', d.myReview?.id === r.id && 'ring-1 ring-primary')}>
              <div className="flex items-center justify-between"><p className="text-sm font-medium">{r.authorName}{d.myReview?.id === r.id && <span className="ml-2 text-xs text-primary">You</span>}<span className="ml-2 text-xs font-normal text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</span></p><Stars value={r.rating} /></div>
              {r.body && <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>}
              {r.developerReply && <div className="mt-3 border-l-2 border-primary pl-3 text-sm"><p className="text-xs font-semibold text-primary">Developer reply</p><p className="whitespace-pre-wrap">{r.developerReply}</p></div>}
              {l.mine && <div className="mt-2 flex gap-2"><input value={reply[r.id] ?? r.developerReply ?? ''} onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })} placeholder="Reply as developer" className="h-8 flex-1 rounded-full border border-border bg-background px-3 text-sm" /><button onClick={() => sendReply(r.id)} className="h-8 rounded-full border border-border px-3 text-xs font-medium">Reply</button></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BotDetail() {
  const { id = '' } = useParams();
  const [d, setD] = useState<Data | null>(null);
  const load = useCallback(() => marketplace({ action: 'get', listingId: id }).then(setD).catch((e) => toast.error(errorMessage(e, 'Bot not found'))), [id]);
  useEffect(() => { setD(null); load(); }, [load]);
  const { push } = useRecent();
  const navigate = useNavigate();
  useEffect(() => { if (id) push(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const l = d?.listing;
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
        <Link to="/app/bots" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Marketplace</Link>
        {!l ? <Skeleton className="h-64 rounded-3xl" /> : <>
          <div className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="h-28" style={{ background: `linear-gradient(135deg, ${l.accentColor}, ${l.accentColor}22)` }} />
            <div className="px-6 pb-6">
              <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
                <span className="rounded-full border-4 border-card bg-card"><BotAvatar name={l.name} avatar={l.avatar} size={80} /></span>
                <div className="flex gap-2">{l.mine && <Link to={`/app/bots/dev/${l.id}/information`} className="h-9 rounded-full border border-border px-4 text-sm font-medium leading-9">Edit listing</Link>}<HeaderActions id={l.id} name={l.name} /></div>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold">{l.name}<BotBadge verified={l.verified} /></h1>
              <p className="mt-1 text-muted-foreground">{l.tagline}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>by {l.ownerName}</span><span>{CATEGORY_EMOJI[l.category]} {l.category}</span><span>v{l.version}</span><span className="flex items-center gap-1"><Download className="h-3 w-3" />{l.installs} servers</span><span className="flex items-center gap-1"><Stars value={l.rating} />{l.ratingCount}</span>
              </div>
              {l.verified && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"><ShieldCheck className="h-3.5 w-3.5" />Verified by Chatting — reviewed for safety and quality</p>}
              <div className="mt-5"><Install d={d!} reload={setD} /></div>
            </div>
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_260px]">
            <div>
              <h2 className="text-lg font-semibold">About</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{l.description || 'No description yet.'}</p>
              <Screenshots shots={l.screenshots} />
              <Commands cmds={l.commands} />
            </div>
            <aside className="space-y-5 text-sm">
              <Permissions perms={l.permissions} />
              {l.eventTypes.length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Listens to</p><div className="mt-2 flex flex-wrap gap-1">{l.eventTypes.map((e) => <span key={e} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]">{e}</span>)}</div></div>}
              {l.tags.length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p><div className="mt-2 flex flex-wrap gap-1">{l.tags.map((t) => <button key={t} onClick={() => navigate(`/app/bots?q=${encodeURIComponent(t)}`)} className="rounded-full bg-secondary px-2 py-0.5 text-xs hover:bg-primary/10 hover:text-primary">#{t}</button>)}</div></div>}
              {l.createdAt && <p className="text-xs text-muted-foreground">Listed {new Date(l.createdAt).toLocaleDateString()}</p>}
              <div className="space-y-1">{[['Website', l.website], ['Support', l.supportUrl], ['Privacy policy', l.privacyUrl]].filter(([, u]) => u).map(([n, u]) => <a key={n} href={u!} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">{n}<ExternalLink className="h-3 w-3" /></a>)}</div>
            </aside>
          </div>
          <Reviews key={d!.myReview?.id ?? 'new'} d={d!} reload={setD} />
          <Related l={l} />
        </>}
      </div>
    </section>
  );
}
