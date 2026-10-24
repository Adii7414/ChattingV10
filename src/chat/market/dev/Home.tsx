import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, KeyRound, LayoutGrid, List, Loader2, Pin, Plus, Search } from 'lucide-react';
import { marketplace } from 'zitejs/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Input } from '@project/components/ui/input';
import { Checkbox } from '@project/components/ui/checkbox';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import { BotAvatar, BotBadge } from '../../BotMessage';
import { errorMessage } from '../../../lib/errors';
import { blank } from './Editor';
import { PageHead, Stat, copyText, useApps, useLocal, type Listing } from './kit';

const TEMPLATES = [
  { name: 'Blank', emoji: '🤖', category: 'Utility', perms: ['Read Messages', 'Send Messages'], events: ['MESSAGE_CREATE', 'INTERACTION_CREATE'] },
  { name: 'Moderation', emoji: '🛡️', category: 'Moderation', perms: ['Read Messages', 'Send Messages', 'Manage Messages', 'Moderate Members'], events: ['MESSAGE_CREATE', 'MEMBER_JOIN'] },
  { name: 'Fun & games', emoji: '🎲', category: 'Games', perms: ['Read Messages', 'Send Messages', 'Add Reactions'], events: ['MESSAGE_CREATE', 'REACTION_ADD', 'INTERACTION_CREATE'] },
  { name: 'Welcome', emoji: '👋', category: 'Social', perms: ['Send Messages', 'Manage Roles'], events: ['MEMBER_JOIN', 'MEMBER_LEAVE'] },
] as const;

function Create({ open, setOpen }: { open: boolean; setOpen: (b: boolean) => void }) {
  const [name, setName] = useState(''); const [agree, setAgree] = useState(false); const [tpl, setTpl] = useState(0);
  const [busy, setBusy] = useState(false); const [key, setKey] = useState<{ token: string; id: string } | null>(null);
  const { reload } = useApps(); const nav = useNavigate();
  const create = async () => {
    setBusy(true);
    const t = TEMPLATES[tpl];
    try {
      const r = await marketplace({ action: 'save', patch: { ...blank, name: name.trim(), tagline: `${name.trim()} — a Chatting bot`.slice(0, 90), avatar: t.emoji, category: t.category as typeof blank.category, permissions: [...t.perms] as typeof blank.permissions, eventTypes: [...t.events] as typeof blank.eventTypes } });
      await reload();
      if (r.listing) setKey({ token: r.token ?? r.listing.apiKey ?? '', id: r.listing.id });
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t create')); } finally { setBusy(false); }
  };
  const done = () => { const id = key?.id; setOpen(false); setKey(null); setName(''); setAgree(false); if (id) nav(`/app/bots/dev/${id}/information`); };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : key ? done() : setOpen(false))}>
      <DialogContent className="max-w-md">
        {!key ? <>
          <DialogHeader><DialogTitle>Create an application</DialogTitle><DialogDescription>Give your bot a name. You can change everything later.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</p><Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="My cool bot" /></div>
            <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start from</p>
              <div className="grid grid-cols-2 gap-2">{TEMPLATES.map((t, i) => <button key={t.name} onClick={() => setTpl(i)} className={cn('rounded-xl border p-2.5 text-left text-sm', tpl === i ? 'border-primary bg-primary/10' : 'border-border')}><span className="mr-1.5">{t.emoji}</span>{t.name}<span className="block text-[11px] text-muted-foreground">{t.perms.length} permissions · {t.events.length} events</span></button>)}</div></div>
            <label className="flex items-start gap-2 text-sm text-muted-foreground"><Checkbox checked={agree} onCheckedChange={(v) => setAgree(!!v)} className="mt-0.5" />I agree to keep my API key secret and follow the Chatting developer terms.</label>
            <button onClick={create} disabled={busy || name.trim().length < 2 || !agree} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Create</button>
          </div>
        </> : <>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />Your application is ready</DialogTitle><DialogDescription>Here’s its API key. It works in every server your bot joins, and you can always find it again on the Bot page.</DialogDescription></DialogHeader>
          <div className="flex gap-2"><code className="flex-1 break-all rounded-lg bg-secondary p-3 text-xs">{key.token}</code><button onClick={() => copyText(key.token, 'API key copied')} aria-label="Copy"><Copy className="h-4 w-4" /></button></div>
          <button onClick={done} className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground">Open application</button>
        </>}
      </DialogContent>
    </Dialog>
  );
}

function Tile({ a, pinned, onPin, list }: { a: Listing; pinned: boolean; onPin: () => void; list: boolean }) {
  const nav = useNavigate();
  return (
    <div onClick={() => nav(`/app/bots/dev/${a.id}/information`)} className={cn('group relative cursor-pointer rounded-2xl border border-border bg-card transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg', list ? 'flex items-center gap-3 p-3' : 'p-4 text-center')}>
      <button onClick={(e) => { e.stopPropagation(); onPin(); }} aria-label="Pin" className={cn('absolute right-2 top-2 rounded-md p-1 transition', pinned ? 'text-primary' : 'text-muted-foreground opacity-0 group-hover:opacity-100')}><Pin className="h-3.5 w-3.5" /></button>
      <div className={cn(!list && 'mx-auto mb-3 w-fit')}><BotAvatar name={a.name} avatar={a.avatar} size={list ? 40 : 72} /></div>
      <div className="min-w-0"><p className={cn('flex items-center gap-1 truncate font-semibold', !list && 'justify-center')}>{a.name}<BotBadge verified={a.verified} /></p>
        <p className="text-xs text-muted-foreground">{a.status} · {a.installs} servers{a.rating != null ? ` · ${a.rating}★` : ''}</p></div>
    </div>
  );
}

export default function Home() {
  const { apps } = useApps();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(''); const [sort, setSort] = useLocal('dev.sort', 'recent'); const [view, setView] = useLocal<'grid' | 'list'>('dev.view', 'grid');
  const [pinned, setPinned] = useLocal<string[]>('dev.pinned', []); const [recent] = useLocal<string[]>('dev.recent', []);
  const list = useMemo(() => {
    const xs = (apps ?? []).filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
    const by = { recent: (a: Listing) => -recent.indexOf(a.id) * -1 || 99, name: () => 0, installs: (a: Listing) => -a.installs } as Record<string, (a: Listing) => number>;
    const s = sort === 'name' ? xs.sort((a, b) => a.name.localeCompare(b.name)) : sort === 'installs' ? xs.sort((a, b) => b.installs - a.installs) : xs.sort((a, b) => ((recent.indexOf(a.id) + 1 || 99) - (recent.indexOf(b.id) + 1 || 99)));
    void by;
    return s.sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
  }, [apps, q, sort, recent, pinned]);
  const all = apps ?? [];
  return (
    <>
      <PageHead title="Applications" desc="Each application is one bot with its own API key. Build it here, then add it to any server.">
        <button onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />New Application</button>
      </PageHead>
      {all.length > 0 && <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Applications" value={all.length} /><Stat label="Servers reached" value={all.reduce((s, a) => s + a.installs, 0)} /><Stat label="Published" value={all.filter((a) => a.status === 'Published').length} /><Stat label="Verified" value={all.filter((a) => a.verified).length} /></div>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search applications" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm" /></div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm"><option value="recent">Recently opened</option><option value="name">Name</option><option value="installs">Most servers</option></select>
        <div className="flex rounded-lg border border-border p-0.5">{(['grid', 'list'] as const).map((v) => <button key={v} onClick={() => setView(v)} aria-label={v} className={cn('rounded-md p-1.5', view === v && 'bg-secondary')}>{v === 'grid' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}</button>)}</div>
      </div>
      {!apps ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
        : !all.length ? <div className="rounded-2xl border border-dashed border-border py-20 text-center"><p className="text-4xl">🤖</p><p className="mt-3 font-semibold">No applications yet</p><p className="text-sm text-muted-foreground">Create one to get an API key and start building.</p><button onClick={() => setOpen(true)} className="mt-4 h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">New Application</button></div>
        : <div className={view === 'grid' ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4' : 'space-y-2'}>{list.map((a) => <Tile key={a.id} a={a} list={view === 'list'} pinned={pinned.includes(a.id)} onPin={() => setPinned((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))} />)}</div>}
      <p className="mt-6 text-center text-xs text-muted-foreground">Tip: press <kbd className="rounded bg-secondary px-1">Ctrl/⌘ K</kbd> to jump anywhere.</p>
      <Create open={open} setOpen={setOpen} />
    </>
  );
}
