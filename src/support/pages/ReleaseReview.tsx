import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Download, Loader2, X } from 'lucide-react';
import { botReleases } from 'zitejs/api';
import { Textarea } from '@project/components/ui/textarea';
import { Skeleton } from '@project/components/ui/skeleton';
import { PageHeader, Empty } from '../kit';
import { errorMessage } from '../../lib/errors';
import { ReportView, FileTree, StatusPill, downloadSource, fmtBytes, type Release } from '../../chat/market/release/shared';

/** Staff queue: inspect source, validation report, permissions and notes, then approve or reject. */
export default function ReleaseReview() {
  const [list, setList] = useState<Release[] | null>(null);
  const [sel, setSel] = useState<Release | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => botReleases({ action: 'queue' }).then((d) => setList(d.releases)).catch((e) => { toast.error(errorMessage(e, 'Couldn’t load')); setList([]); }), []);
  useEffect(() => { load(); }, [load]);
  const open = async (id: string) => { try { setSel((await botReleases({ action: 'get', releaseId: id })).release); setNotes(''); } catch (e) { toast.error(errorMessage(e, 'Couldn’t open')); } };
  const decide = async (action: 'approve' | 'reject') => {
    if (!sel) return; setBusy(true);
    try { await botReleases({ action, releaseId: sel.id, notes }); toast.success(action === 'approve' ? 'Approved — now live' : 'Rejected'); setSel(null); load(); }
    catch (e) { toast.error(errorMessage(e, 'Action failed')); } finally { setBusy(false); }
  };
  const perms = (sel?.report?.manifest as { permissions?: string[] } | null)?.permissions ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Bot releases" desc="Review submitted bot versions before they can be installed" />
      {!list ? <Skeleton className="h-40" /> : !list.length ? <Empty>Nothing waiting for review</Empty> : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div className="space-y-2">{list.map((r) => (
            <button key={r.id} onClick={() => open(r.id)} className={`w-full rounded-xl border p-3 text-left ${sel?.id === r.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <p className="font-medium">{r.listingName} <span className="font-mono text-xs text-muted-foreground">v{r.version}</span></p>
              <p className="text-xs text-muted-foreground">{r.botType} · {fmtBytes(r.archiveSize)} · {new Date(r.createdAt).toLocaleDateString()}</p>
            </button>))}</div>
          {sel && (
            <div className="min-w-0 space-y-5 rounded-2xl border border-border p-5">
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{sel.listingName} v{sel.version}</h2><StatusPill s={sel.status} />
                {sel.hasArchive && <button onClick={() => downloadSource(sel.id)} className="ml-auto inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs"><Download className="h-3.5 w-3.5" />Source</button>}</div>
              <div className="grid gap-3 text-sm sm:grid-cols-3"><p><span className="text-muted-foreground">Runtime:</span> {sel.runtime ?? 'built-in responder'}</p><p><span className="text-muted-foreground">Entry:</span> <span className="font-mono">{sel.entryPoint ?? '—'}</span></p><p><span className="text-muted-foreground">Permissions:</span> {perms.join(', ') || '—'}</p></div>
              <div><p className="mb-1 text-sm font-semibold">Release notes</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{sel.releaseNotes}</p></div>
              {sel.botType === 'Prompt' && <pre className="max-h-60 overflow-auto rounded-xl bg-muted p-3 text-xs">{sel.promptConfig}</pre>}
              <ReportView r={sel} />
              {sel.botType === 'Code' && <FileTree r={sel} />}
              {sel.supportingFiles.length > 0 && <div className="text-sm"><p className="font-semibold">Supporting files</p>{sel.supportingFiles.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="block text-primary hover:underline">{f.name}</a>)}</div>}
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for the developer (required to reject)" />
              <div className="flex gap-2">
                <button disabled={busy || !sel.report?.ok} onClick={() => decide('approve')} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve & publish</button>
                <button disabled={busy || !notes.trim()} onClick={() => decide('reject')} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm text-destructive disabled:opacity-50"><X className="h-4 w-4" />Reject</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
