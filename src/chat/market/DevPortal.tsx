import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { Activity, BarChart3, BookOpen, Boxes, ChevronLeft, Command, Hash, KeyRound, LayoutGrid, Package, Radio, Search, Server, Settings2, ShieldCheck, Terminal, Wrench, Download, Info, ScrollText, Menu } from 'lucide-react';
import { marketplace } from 'zitejs/api';
import { Dialog, DialogContent } from '@project/components/ui/dialog';
import { Sheet, SheetContent } from '@project/components/ui/sheet';
import { cn } from '@project/components/lib/utils';
import { BotAvatar, BotBadge } from '../BotMessage';
import { Apps, useLocal, type Listing } from './dev/kit';
import Home from './dev/Home';
import General from './dev/General';
import Installation from './dev/Installation';
import BotPage from './dev/BotPage';
import Commands from './dev/Commands';
import Permissions from './dev/Permissions';
import Events from './dev/Events';
import Servers from './dev/Servers';
import Analytics from './dev/Analytics';
import Console from './dev/Console';
import EventLog from './dev/EventLog';
import Verification from './dev/Verification';
import Danger from './dev/Danger';
import ServerBots from './ServerBots';
import DevTools from './DevTools';

export const SECTIONS = [
  { k: 'information', t: 'General Information', I: Info, group: 'Settings' },
  { k: 'installation', t: 'Installation', I: Download, group: 'Settings' },
  { k: 'bot', t: 'Bot', I: KeyRound, group: 'Settings' },
  { k: 'commands', t: 'Commands', I: Hash, group: 'Settings' },
  { k: 'permissions', t: 'Permissions', I: ShieldCheck, group: 'Settings' },
  { k: 'events', t: 'Events & Webhooks', I: Radio, group: 'Settings' },
  { k: 'servers', t: 'Servers', I: Server, group: 'Insights' },
  { k: 'analytics', t: 'Analytics', I: BarChart3, group: 'Insights' },
  { k: 'logs', t: 'Event Log', I: ScrollText, group: 'Insights' },
  { k: 'console', t: 'API Console', I: Terminal, group: 'Build' },
  { k: 'releases', t: 'Releases', I: Package, group: 'Build' },
  { k: 'verification', t: 'Verification', I: ShieldCheck, group: 'Build' },
  { k: 'settings', t: 'Danger Zone', I: Settings2, group: 'Build' },
] as const;

const item = ({ isActive }: { isActive: boolean }) => cn('flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition', isActive ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground');

function Nav({ app, apps, onPick }: { app: Listing | null; apps: Listing[]; onPick?: () => void }) {
  const [pinned] = useLocal<string[]>('dev.pinned', []);
  if (app) {
    const groups = [...new Set(SECTIONS.map((s) => s.group))];
    return (
      <nav className="space-y-4" onClick={onPick}>
        <Link to="/app/bots/dev" className="flex items-center gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" />All applications</Link>
        <div className="flex items-center gap-2.5 rounded-xl bg-secondary/60 p-2.5"><BotAvatar name={app.name} avatar={app.avatar} size={36} /><div className="min-w-0"><p className="flex items-center gap-1 truncate text-sm font-semibold">{app.name}<BotBadge verified={app.verified} /></p><p className="text-[11px] text-muted-foreground">{app.status}</p></div></div>
        {groups.map((g) => (
          <div key={g}><p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
            {SECTIONS.filter((s) => s.group === g).map(({ k, t, I }) => <NavLink key={k} to={k === 'releases' ? `/app/bots/dev/${app.id}/releases` : `/app/bots/dev/${app.id}/${k}`} className={item}><I className="h-4 w-4" />{t}</NavLink>)}
          </div>
        ))}
      </nav>
    );
  }
  const sorted = [...apps].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
  return (
    <nav className="space-y-4" onClick={onPick}>
      <div><NavLink end to="/app/bots/dev" className={item}><LayoutGrid className="h-4 w-4" />Applications</NavLink>
        <NavLink to="/app/bots/dev/my-servers" className={item}><Boxes className="h-4 w-4" />Your servers</NavLink>
        <NavLink to="/app/bots/dev/toolbox" className={item}><Wrench className="h-4 w-4" />Toolbox</NavLink>
        <Link to="/developers" className={item({ isActive: false })}><BookOpen className="h-4 w-4" />Documentation</Link></div>
      {!!apps.length && <div><p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">My applications</p>
        {sorted.map((a) => <NavLink key={a.id} to={`/app/bots/dev/${a.id}/information`} className={item}><BotAvatar name={a.name} avatar={a.avatar} size={20} /><span className="truncate">{a.name}</span>{pinned.includes(a.id) && <span className="ml-auto text-[10px]">📌</span>}</NavLink>)}</div>}
    </nav>
  );
}

function Switcher({ open, setOpen, apps }: { open: boolean; setOpen: (b: boolean) => void; apps: Listing[] }) {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const items = useMemo(() => [
    ...apps.flatMap((a) => SECTIONS.map((s) => ({ label: `${a.name} › ${s.t}`, to: s.k === 'releases' ? `/app/bots/dev/${a.id}/releases` : `/app/bots/dev/${a.id}/${s.k}` }))),
    { label: 'Applications', to: '/app/bots/dev' }, { label: 'Your servers', to: '/app/bots/dev/my-servers' }, { label: 'Toolbox', to: '/app/bots/dev/toolbox' }, { label: 'Documentation', to: '/developers' },
  ].filter((x) => x.label.toLowerCase().includes(q.toLowerCase())).slice(0, 12), [apps, q]);
  const go = (to: string) => { setOpen(false); setQ(''); nav(to); };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <div className="flex items-center gap-2 border-b border-border px-4"><Search className="h-4 w-4 text-muted-foreground" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && items[0] && go(items[0].to)} placeholder="Jump to an app or page…" className="h-12 flex-1 bg-transparent text-sm outline-none" /></div>
        <div className="max-h-80 overflow-y-auto p-2">{items.map((x) => <button key={x.to} onClick={() => go(x.to)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-secondary">{x.label}</button>)}{!items.length && <p className="p-4 text-center text-sm text-muted-foreground">Nothing found</p>}</div>
      </DialogContent>
    </Dialog>
  );
}

export default function DevPortal() {
  const { '*': rest = '' } = useParams();
  const [apps, setApps] = useState<Listing[] | null>(null);
  const [sw, setSw] = useState(false);
  const [mob, setMob] = useState(false);
  const [, setRecent] = useLocal<string[]>('dev.recent', []);
  const reload = useCallback(async () => { const r = await marketplace({ action: 'mine' }).catch(() => null); setApps(r?.listings ?? []); }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSw(true); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const [first, section = 'information'] = rest.split('/');
  const app = apps?.find((a) => a.id === first) ?? null;
  useEffect(() => { if (app) setRecent((r) => [app.id, ...r.filter((x) => x !== app.id)].slice(0, 6)); }, [app?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = () => {
    if (first === 'my-servers') return <ServerBots />;
    if (first === 'toolbox') return <><Head2 t="Toolbox" d="Utilities for building and debugging bots. Everything runs in your browser." /><DevTools /></>;
    if (!first) return <Home />;
    if (!apps) return <div className="h-40 animate-pulse rounded-2xl bg-secondary" />;
    if (!app) return <p className="py-20 text-center text-muted-foreground">Application not found. <Link to="/app/bots/dev" className="text-primary">Back to applications</Link></p>;
    const P = { information: General, installation: Installation, bot: BotPage, commands: Commands, permissions: Permissions, events: Events, servers: Servers, analytics: Analytics, logs: EventLog, console: Console, verification: Verification, settings: Danger }[section] ?? General;
    return <P key={`${app.id}-${section}`} l={app} />;
  };

  return (
    <Apps.Provider value={{ apps, reload }}>
      <div className="flex min-h-0 w-full flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 md:flex">
          <button onClick={() => setSw(true)} className="m-3 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground"><Search className="h-4 w-4" />Search<kbd className="ml-auto flex items-center gap-0.5 rounded bg-secondary px-1.5 text-[10px]"><Command className="h-3 w-3" />K</kbd></button>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"><Nav app={app} apps={apps ?? []} /></div>
          <div className="border-t border-border p-3 text-[11px] text-muted-foreground"><Activity className="mr-1 inline h-3 w-3 text-primary" />Bot API online</div>
        </aside>
        <Sheet open={mob} onOpenChange={setMob}><SheetContent side="left" className="w-72 overflow-y-auto p-4"><Nav app={app} apps={apps ?? []} onPick={() => setMob(false)} /></SheetContent></Sheet>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/90 px-4 py-2 backdrop-blur md:hidden"><button onClick={() => setMob(true)} aria-label="Menu"><Menu className="h-5 w-5" /></button><span className="truncate text-sm font-medium">{app ? `${app.name} · ${SECTIONS.find((s) => s.k === section)?.t ?? ''}` : 'Developer Portal'}</span><button onClick={() => setSw(true)} className="ml-auto" aria-label="Search"><Search className="h-4 w-4" /></button></div>
          <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">{page()}</div>
        </main>
        <Switcher open={sw} setOpen={setSw} apps={apps ?? []} />
      </div>
    </Apps.Provider>
  );
}

function Head2({ t, d }: { t: string; d: string }) {
  return <div className="mb-6 border-b border-border pb-5"><h1 className="text-2xl font-semibold tracking-tight">{t}</h1><p className="mt-1 text-sm text-muted-foreground">{d}</p></div>;
}
