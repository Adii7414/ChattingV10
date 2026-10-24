import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, Download, Loader2, Plus, RotateCcw, Send, ShieldCheck, Undo2, EyeOff } from 'lucide-react';
import { botReleases, type BotReleasesOutputType } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Skeleton } from '@project/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { errorMessage } from '../../../lib/errors';
import { StatusPill, ReportView, FileTree, downloadSource, fmtBytes, type Release } from './shared';
import UploadStep from './UploadStep';
import PromptStep from './PromptStep';

type Data = BotReleasesOutputType;
const STEPS = ['Bot information', 'Source', 'Runtime & manifest', 'Validation', 'Review & publish'];
const LOCKED = ['Pending Review', 'Published', 'Unpublished'];

function NewVersion({ open, onClose, listingId, onMade }: { open: boolean; onClose: () => void; listingId: string; onMade: (r: Release) => void }) {
  const [v, setV] = useState('1.0.0'); const [type, setType] = useState<'Prompt' | 'Code'>('Code'); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try { const d = await botReleases({ action: 'create', listingId, version: v.trim(), botType: type, releaseNotes: notes }); if (d.release) { onMade(d.release); onClose(); toast.success(`v${v} created`); } }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t create version')); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent><DialogHeader><DialogTitle>New version</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">{(['Code', 'Prompt'] as const).map((t) => (
            <button key={t} onClick={() => setType(t)} className={`rounded-2xl border p-3 text-left ${type === t ? 'border-primary bg-primary/10' : 'border-border'}`}>
              <p className="text-sm font-semibold">{t === 'Code' ? 'Code-powered' : 'Prompt / config'}</p>
              <p className="text-xs text-muted-foreground">{t === 'Code' ? 'Upload a full project (.zip)' : 'Commands & replies, no code'}</p>
            </button>))}</div>
          <label className="block text-sm font-medium">Version<Input className="mt-1.5 font-mono" value={v} onChange={(e) => setV(e.target.value)} placeholder="1.2.0" /></label>
          <label className="block text-sm font-medium">Release notes<Textarea className="mt-1.5" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed?" /></label>
          <button disabled={busy || !/^\d+\.\d+\.\d+/.test(v)} onClick={make} className="h-10 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Create version'}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RuntimeStep({ r, runtimes, locked, onChange }: { r: Release; runtimes: string[]; locked: boolean; onChange: (r: Release) => void }) {
  const [rt, setRt] = useState(r.runtime ?? 'node20'); const [entry, setEntry] = useState(r.entryPoint ?? 'src/index.ts');
  useEffect(() => { setRt(r.runtime ?? 'node20'); setEntry(r.entryPoint ?? 'src/index.ts'); }, [r.id, r.runtime, r.entryPoint]);
  const save = async () => { try { const d = await botReleases({ action: 'update', releaseId: r.id, runtime: rt, entryPoint: entry }); if (d.release) onChange(d.release); toast.success('Saved — re-run validation'); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save')); } };
  const manifest = { apiVersion: '1', name: r.listingName, version: r.version, runtime: rt, entry, permissions: ['Read Messages', 'Send Messages'], events: ['MESSAGE_CREATE', 'INTERACTION_CREATE'] };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Runtime<Select value={rt} onValueChange={setRt} disabled={locked}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{runtimes.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></label>
        <label className="block text-sm font-medium">Entry point<Input disabled={locked} className="mt-1.5 font-mono" value={entry} onChange={(e) => setEntry(e.target.value)} /></label>
      </div>
      {!locked && <button onClick={save} className="h-9 rounded-full border border-border px-4 text-sm">Save runtime</button>}
      <div><p className="mb-1.5 text-sm font-medium">Required <code className="font-mono">chatting-bot.json</code> at the project root</p>
        <pre className="overflow-auto rounded-2xl bg-muted p-4 text-xs">{JSON.stringify(manifest, null, 2)}</pre>
        <p className="mt-2 text-xs text-muted-foreground">Dependencies go in package.json (Node) or requirements.txt (Python). Full interface: <Link to="/developers" className="text-primary hover:underline">Code-bot guide</Link>.</p></div>
      {r.report?.manifest && <div><p className="mb-1.5 text-sm font-medium">Manifest found in your upload</p><pre className="overflow-auto rounded-2xl border border-border p-4 text-xs">{JSON.stringify(r.report.manifest, null, 2)}</pre></div>}
    </div>
  );
}

function PublishStep({ r, onChange }: { r: Release; onChange: (r: Release) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (action: 'submit' | 'withdraw' | 'publish' | 'unpublish') => {
    setBusy(true);
    try { const d = await botReleases({ action, releaseId: r.id }); if (d.release) onChange(d.release); toast.success({ submit: 'Submitted for review', withdraw: 'Withdrawn', publish: 'Rolled back — this version is live', unpublish: 'Unpublished' }[action]); }
    catch (e) { toast.error(errorMessage(e, 'Action failed')); } finally { setBusy(false); }
  };
  const btn = 'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50';
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">v{r.version} <StatusPill s={r.status} live={r.live} /></p>
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{r.releaseNotes || 'No release notes yet.'}</p>
        {r.reviewNotes && <p className="mt-3 rounded-xl bg-secondary p-3"><span className="font-medium">Reviewer:</span> {r.reviewNotes}</p>}
        {r.botType === 'Code' && <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">Hosted execution of uploaded code isn’t available on Chatting yet. Once approved, communities can add this bot only if you connect your own server (events URL on the listing), which receives events through the signed Bot API.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {r.status === 'Draft' && <button disabled={busy || !r.report?.ok} onClick={() => act('submit')} className={`${btn} bg-primary text-primary-foreground`}><Send className="h-4 w-4" />Submit for review</button>}
        {r.status === 'Pending Review' && <button disabled={busy} onClick={() => act('withdraw')} className={`${btn} border border-border`}><Undo2 className="h-4 w-4" />Withdraw</button>}
        {r.status === 'Published' && <button disabled={busy} onClick={() => act('unpublish')} className={`${btn} border border-border`}><EyeOff className="h-4 w-4" />Unpublish</button>}
        {r.status === 'Unpublished' && r.publishedAt && <button disabled={busy} onClick={() => act('publish')} className={`${btn} bg-primary text-primary-foreground`}><RotateCcw className="h-4 w-4" />Roll back to this version</button>}
        {r.hasArchive && <button onClick={() => downloadSource(r.id)} className={`${btn} border border-border`}><Download className="h-4 w-4" />Download source</button>}
      </div>
      {r.status === 'Draft' && !r.report?.ok && <p className="text-xs text-muted-foreground">Submitting unlocks once validation passes.</p>}
    </div>
  );
}

export default function Releases() {
  const { id = '' } = useParams();
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<Release | null>(null);
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [validating, setValidating] = useState(false);
  const load = useCallback(() => botReleases({ action: 'list', listingId: id }).then((x) => { setD(x); return x; }).catch((e) => { toast.error(errorMessage(e, 'Couldn’t load releases')); return null; }), [id]);
  const open = useCallback(async (rid: string) => { try { const x = await botReleases({ action: 'get', releaseId: rid }); setSel(x.release); } catch (e) { toast.error(errorMessage(e, 'Couldn’t open')); } }, []);
  useEffect(() => { load().then((x) => { const first = x?.releases[0]; if (first) open(first.id); }); }, [load, open]);
  const changed = (r: Release) => { setSel(r); load(); };
  const validate = async () => { if (!sel) return; setValidating(true); try { const x = await botReleases({ action: 'validate', releaseId: sel.id }); if (x.release) changed(x.release); } catch (e) { toast.error(errorMessage(e, 'Validation failed')); } finally { setValidating(false); } };
  const savePrompt = async (json: string) => { if (!sel) return; try { const x = await botReleases({ action: 'update', releaseId: sel.id, promptConfig: json }); if (x.release) changed(x.release); toast.success('Saved — run validation next'); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save')); } };
  const live = d?.releases.find((r) => r.live);
  const locked = !!sel && LOCKED.includes(sel.status);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8">
        <Link to="/app/bots/dev" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Developer portal</Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-3xl font-semibold tracking-tight">{sel?.listingName ?? d?.releases[0]?.listingName ?? 'Releases'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{live ? <>Live version: <span className="font-mono text-foreground">v{live.version}</span></> : 'No version is live yet.'}</p></div>
          <button onClick={() => setCreating(true)} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />New version</button>
        </div>
        {!d ? <Skeleton className="h-64 rounded-3xl" /> : !d.releases.length ? (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><p className="mt-3 font-semibold">Ship your first version</p><p className="text-sm text-muted-foreground">Upload your project, pass validation, and Chatting staff will review it.</p></div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <aside className="space-y-1.5">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Versions</p>
              {d.releases.map((r) => (
                <button key={r.id} onClick={() => { open(r.id); setStep(0); }} className={`w-full rounded-2xl border p-3 text-left ${sel?.id === r.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50'}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold">v{r.version}</span><StatusPill s={r.status} live={r.live} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.botType} · {r.archiveSize ? fmtBytes(r.archiveSize) : r.botType === 'Prompt' ? 'config' : 'no upload'} · {new Date(r.createdAt).toLocaleDateString()}</p>
                  {r.releaseNotes && <p className="mt-1 line-clamp-2 text-xs">{r.releaseNotes}</p>}
                </button>
              ))}
            </aside>
            {sel && (
              <section className="min-w-0 space-y-5 rounded-3xl border border-border bg-card p-4 sm:p-6">
                <ol className="flex gap-1 overflow-x-auto pb-1">{STEPS.map((s, i) => (
                  <li key={s}><button onClick={() => setStep(i)} className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${step === i ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-background/30 text-[10px]">{i < 3 && sel.report?.ok ? <Check className="h-3 w-3" /> : i + 1}</span>{s}</button></li>))}</ol>
                {locked && <p className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground">This version is {sel.status.toLowerCase()} and immutable. Create a new version to change files.</p>}
                {step === 0 && (
                  <div className="space-y-3 text-sm">
                    <p>Name, description, category, tags, avatar, permissions, events URL and links live on the listing and apply to every version.</p>
                    <Link to={`/app/bots/dev/${sel.listingId}/information`} className="inline-flex h-9 items-center rounded-full border border-border px-4">Edit listing details</Link>
                    <div className="grid gap-2 rounded-2xl bg-secondary/50 p-4 sm:grid-cols-2"><p><span className="text-muted-foreground">Type:</span> {sel.botType === 'Code' ? 'Code-powered' : 'Prompt / configuration'}</p><p><span className="text-muted-foreground">Version:</span> <span className="font-mono">{sel.version}</span></p></div>
                  </div>
                )}
                {step === 1 && (sel.botType === 'Code' ? <UploadStep r={sel} maxMB={d.limits.archiveMB} locked={locked} onChange={changed} /> : <PromptStep key={sel.id} value={sel.promptConfig} locked={locked} onSave={savePrompt} />)}
                {step === 2 && (sel.botType === 'Code' ? <RuntimeStep r={sel} runtimes={d.runtimes} locked={locked} onChange={changed} /> : <p className="text-sm text-muted-foreground">Prompt bots run on Chatting’s built-in responder — there’s no runtime or entry point to configure.</p>)}
                {step === 3 && (
                  <div className="space-y-4">
                    {!locked && <button disabled={validating} onClick={validate} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Run validation</button>}
                    <ReportView r={sel} />
                    {sel.botType === 'Code' && <div><p className="mb-2 text-sm font-semibold">Uploaded files</p><FileTree r={sel} /></div>}
                  </div>
                )}
                {step === 4 && <PublishStep r={sel} onChange={changed} />}
              </section>
            )}
          </div>
        )}
      </div>
      <NewVersion open={creating} onClose={() => setCreating(false)} listingId={id} onMade={(r) => { setSel(r); setStep(1); load(); }} />
    </main>
  );
}
