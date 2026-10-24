import { useEffect, useState } from 'react';

import { toast } from 'sonner';
import { Loader2, Plus, ShieldCheck, Trash2, X, Check } from 'lucide-react';
import { marketplace, type MarketplaceInputType, type MarketplaceOutputType } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { BOT_EVENTS, BOT_PERMS } from '../../../lib/bots';
import { BOT_CATEGORIES } from '../../../lib/marketplace';
import { errorMessage } from '../../../lib/errors';
import { BotCardTile, type Listing } from '../BotCard';
import ColorPicker from '../../../components/ColorPicker';
import { useChat } from '../../store';

export type Patch = NonNullable<MarketplaceInputType['patch']>;
export type Data = MarketplaceOutputType;
export const blank: Patch = { name: '', tagline: '', description: '', avatar: '🤖', accentColor: '#60E4C5', category: 'Utility', tags: [], permissions: ['Read Messages', 'Send Messages'], eventTypes: ['MESSAGE_CREATE', 'INTERACTION_CREATE'], commands: [], screenshots: [], eventsUrl: null, website: null, supportUrl: null, privacyUrl: null, version: '1.0.0', status: 'Draft' };
export const toPatch = (l: Listing): Patch => ({ name: l.name, tagline: l.tagline, description: l.description, avatar: l.avatar, accentColor: l.accentColor, category: l.category as Patch['category'], tags: l.tags, permissions: l.permissions as Patch['permissions'], eventTypes: l.eventTypes as Patch['eventTypes'], commands: l.commands, screenshots: l.screenshots, eventsUrl: l.eventsUrl, website: l.website, supportUrl: l.supportUrl, privacyUrl: l.privacyUrl, version: l.version, status: (l.status === 'Removed' ? 'Draft' : l.status) as Patch['status'] });
export const url = (s: string) => (s.trim() ? s.trim() : null);
export const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success('Copied'); };

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium">{label}</span>{hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}<div className="mt-1.5">{children}</div></label>;
}
export function Chips<T extends string>({ all, value, onChange }: { all: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  return <div className="flex flex-wrap gap-1.5">{all.map((x) => <button type="button" key={x} onClick={() => onChange(value.includes(x) ? value.filter((y) => y !== x) : [...value, x])} className={`rounded-full border px-2.5 py-1 text-xs ${value.includes(x) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{x}</button>)}</div>;
}

export function Editor({ listing, onSaved, onClose }: { listing: Listing | null; onSaved: (d: Data) => void; onClose: () => void }) {
  const [p, setP] = useState<Patch>(listing ? toPatch(listing) : blank);
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const { communities, can } = useChat();
  const servers = communities.filter((c) => can(c.id, 'manageCommunity'));
  const [server, setServer] = useState<string>('none');
  const set = <K extends keyof Patch>(k: K, v: Patch[K]) => setP((x) => ({ ...x, [k]: v }));
  const valid = p.name.trim().length >= 2 && p.tagline.trim().length >= 4;
  const [initial] = useState(() => JSON.stringify(listing ? toPatch(listing) : blank));
  const dirty = JSON.stringify(p) !== initial;
  const [askClose, setAskClose] = useState(false);
  const close = () => { if (dirty) setAskClose(true); else onClose(); };
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);
  const checklist = [['Tagline', p.tagline.length >= 4], ['Description (80+ chars)', p.description.length >= 80], ['Avatar', !!p.avatar], ['A command', p.commands.some((c) => c.name)], ['Events URL', !!p.eventsUrl], ['Privacy policy', !!p.privacyUrl], ['Screenshot', p.screenshots.length > 0], ['Tags', p.tags.length > 0], ['Website or support link', !!(p.website || p.supportUrl)]] as const;
  const score = Math.round((checklist.filter(([, ok]) => ok).length / checklist.length) * 100);
  const exportJson = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })); a.download = `${p.name || 'bot'}.json`; a.click(); };
  const importJson = (f?: File) => f && f.text().then((t) => { try { const j = JSON.parse(t); setP({ ...blank, ...j, status: p.status }); toast.success('Imported — review and save'); } catch { toast.error('That isn’t a valid listing file'); } });
  const preview: Listing = { ...(listing ?? {} as Listing), id: listing?.id ?? 'preview', name: p.name || 'Your bot', tagline: p.tagline || 'A short tagline', avatar: p.avatar, accentColor: p.accentColor, category: p.category, permissions: p.permissions, installs: listing?.installs ?? 0, rating: listing?.rating ?? null, verified: !!listing?.verified, featured: false, createdAt: listing?.createdAt ?? new Date().toISOString(), tags: p.tags, commands: p.commands } as Listing;
  const save = async () => {
    setBusy(true);
    try { onSaved(await marketplace({ action: 'save', listingId: listing?.id, patch: p, communityId: !listing && server !== 'none' ? server : undefined })); toast.success(p.status === 'Published' ? 'Published to the marketplace 🚀' : 'Saved'); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save')); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-5 rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{listing ? `Edit ${listing.name}` : 'New bot'}{dirty && <span className="ml-2 text-xs font-normal text-amber-500">● unsaved</span>}</h2>
        <div className="flex items-center gap-2 text-xs">
          <label className="cursor-pointer rounded-full border border-border px-3 py-1.5">Import JSON<input type="file" accept="application/json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} /></label>
          <button onClick={exportJson} className="rounded-full border border-border px-3 py-1.5">Export JSON</button>
          <button onClick={close} aria-label="Close"><X className="h-4 w-4" /></button></div></div>
      <AlertDialog open={askClose} onOpenChange={setAskClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard changes?</AlertDialogTitle><AlertDialogDescription>You have unsaved edits to this listing.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={onClose} className="bg-destructive text-destructive-foreground">Discard</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
        <div className="pointer-events-none"><p className="mb-2 text-xs font-medium text-muted-foreground">Marketplace preview</p><BotCardTile l={preview} onOpen={() => {}} /></div>
        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between text-sm"><span className="font-semibold">Listing quality</span><span className="font-semibold tabular-nums">{score}%</span></div>
          <div className="mt-2 h-2 rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${score}%` }} /></div>
          <ul className="mt-3 grid gap-1 text-xs sm:grid-cols-2">{checklist.map(([t, ok]) => <li key={t} className={ok ? '' : 'text-muted-foreground'}>{ok ? '✓' : '○'} {t}</li>)}</ul>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input value={p.name} maxLength={40} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Category"><Select value={p.category} onValueChange={(v) => set('category', v as Patch['category'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BOT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Tagline" hint="4–90 chars"><Input value={p.tagline} maxLength={90} onChange={(e) => set('tagline', e.target.value)} /></Field>
        <Field label="Avatar" hint="emoji or image URL"><Input value={p.avatar ?? ''} onChange={(e) => set('avatar', e.target.value || null)} /></Field>
        <Field label="Accent colour"><div className="flex gap-2"><ColorPicker value={p.accentColor} onChange={(h) => set('accentColor', h)} /><Input value={p.accentColor} onChange={(e) => set('accentColor', e.target.value)} /></div></Field>
        <Field label="Version"><Input value={p.version} maxLength={20} onChange={(e) => set('version', e.target.value)} /></Field>
      </div>
      <Field label="Description" hint={`${p.description.length}/4000`}><Textarea rows={5} value={p.description} maxLength={4000} onChange={(e) => set('description', e.target.value)} /></Field>
      <Field label="Tags"><div className="flex flex-wrap items-center gap-1.5">{p.tags.map((t) => <span key={t} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">{t}<button onClick={() => set('tags', p.tags.filter((x) => x !== t))}><X className="h-3 w-3" /></button></span>)}<input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && tag.trim() && p.tags.length < 8) { e.preventDefault(); set('tags', [...new Set([...p.tags, tag.trim().slice(0, 20)])]); setTag(''); } }} placeholder="Type and press Enter" className="h-8 min-w-32 flex-1 bg-transparent text-sm outline-none" /></div></Field>
      <Field label="Permissions"><Chips all={BOT_PERMS} value={p.permissions} onChange={(v) => set('permissions', v)} /></Field>
      <Field label="Events it listens to"><Chips all={BOT_EVENTS} value={p.eventTypes} onChange={(v) => set('eventTypes', v)} /></Field>
      <Field label="Commands" hint="shown on your listing">
        <div className="space-y-2">{p.commands.map((c, i) => <div key={i} className="flex gap-2"><Input className="w-36 font-mono" value={c.name} placeholder="help" onChange={(e) => set('commands', p.commands.map((x, j) => (j === i ? { ...x, name: e.target.value.replace(/\s/g, '').slice(0, 32) } : x)))} /><Input value={c.description} placeholder="What it does" maxLength={120} onChange={(e) => set('commands', p.commands.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /><button onClick={() => set('commands', p.commands.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4 text-muted-foreground" /></button></div>)}
          <button onClick={() => set('commands', [...p.commands, { name: '', description: '' }])} className="inline-flex items-center gap-1 text-sm text-primary"><Plus className="h-4 w-4" />Add command</button></div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Events URL" hint="we POST signed events here"><Input value={p.eventsUrl ?? ''} placeholder="https://…" onChange={(e) => set('eventsUrl', url(e.target.value))} /></Field>
        <Field label="Website"><Input value={p.website ?? ''} placeholder="https://…" onChange={(e) => set('website', url(e.target.value))} /></Field>
        <Field label="Support server / URL"><Input value={p.supportUrl ?? ''} placeholder="https://…" onChange={(e) => set('supportUrl', url(e.target.value))} /></Field>
        <Field label="Privacy policy"><Input value={p.privacyUrl ?? ''} placeholder="https://…" onChange={(e) => set('privacyUrl', url(e.target.value))} /></Field>
      </div>
      {!listing && (
        <Field label="Test it in a server" hint="optional · your API key works in every server either way">
          <Select value={server} onValueChange={setServer}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            {servers.map((c) => <SelectItem key={c.id} value={c.id}>{c.emoji ?? ''} {c.name}</SelectItem>)}
            <SelectItem value="none">Don’t add it to a server yet</SelectItem>
          </SelectContent></Select>
        </Field>
      )}
      <Field label="Screenshots" hint="one image URL per line, up to 6"><Textarea rows={2} value={p.screenshots.join('\n')} onChange={(e) => set('screenshots', e.target.value.split('\n').map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)).slice(0, 6))} /></Field>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Select value={p.status} onValueChange={(v) => set('status', v as Patch['status'])}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Draft">Draft (only you)</SelectItem><SelectItem value="Unlisted">Unlisted (link only)</SelectItem><SelectItem value="Published">Published</SelectItem></SelectContent></Select>
        <button onClick={save} disabled={!valid || busy} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>
      </div>
    </div>
  );
}

export function Verify({ l, checks, onDone }: { l: Listing; checks: Data['checks']; onDone: (d: Data) => void }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState({ purpose: '', dataUse: '', contact: '' });
  const ok = a.purpose.length >= 40 && a.dataUse.length >= 20 && /\S+@\S+\.\S+/.test(a.contact);
  const submit = async () => { try { onDone(await marketplace({ action: 'applyVerification', listingId: l.id, application: a })); setOpen(false); toast.success('Application sent — staff will review it'); } catch (e) { toast.error(errorMessage(e, 'Couldn’t apply')); } };
  const status = { None: 'Not verified', Pending: '⏳ Under review', Verified: 'Verified', Rejected: '❌ Not approved' }[l.verificationStatus] ?? l.verificationStatus;
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />Verification · <span className="font-normal">{status}</span></p>
        {(l.verificationStatus === 'None' || l.verificationStatus === 'Rejected') && <button onClick={() => setOpen(true)} disabled={checks.some((c) => !c.ok)} className="h-8 rounded-full bg-foreground px-3 text-xs font-medium text-background disabled:opacity-40">Apply</button>}</div>
      {l.verificationNote && <p className="mt-2 rounded-lg bg-secondary p-2 text-xs">Staff note: {l.verificationNote}</p>}
      {l.verificationStatus !== 'Verified' && <ul className="mt-3 space-y-1 text-xs">{checks.map((c) => <li key={c.label} className={c.ok ? 'text-foreground' : 'text-muted-foreground'}><span className="inline-flex items-center gap-1.5">{c.ok ? <Check className="inline text-primary h-3.5 w-3.5 shrink-0" strokeWidth={2.75} /> : <span className="inline-block h-3.5 w-3.5 rounded-full border border-current" />}{c.label}</span></li>)}</ul>}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Apply for verification</DialogTitle></DialogHeader>
        <div className="space-y-3"><Field label="What does your bot do?" hint="40+ chars"><Textarea value={a.purpose} onChange={(e) => setA({ ...a, purpose: e.target.value })} /></Field>
          <Field label="What data does it store, and why?" hint="20+ chars"><Textarea value={a.dataUse} onChange={(e) => setA({ ...a, dataUse: e.target.value })} /></Field>
          <Field label="Contact email"><Input type="email" value={a.contact} onChange={(e) => setA({ ...a, contact: e.target.value })} /></Field>
          <button onClick={submit} disabled={!ok} className="h-10 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">Submit application</button></div>
      </DialogContent></Dialog>
    </div>
  );
}

