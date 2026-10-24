import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ChevronRight, FileCode2, Info, Loader2, XCircle } from 'lucide-react';
import { botReleases, type BotReleasesOutputType } from 'zitejs/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { errorMessage } from '../../../lib/errors';

export type Release = NonNullable<BotReleasesOutputType['release']>;

export const STATUS_TONE: Record<string, string> = {
  Draft: 'bg-secondary text-secondary-foreground', Uploading: 'bg-sky-500/15 text-sky-500', Validating: 'bg-sky-500/15 text-sky-500',
  'Pending Review': 'bg-amber-500/15 text-amber-500', Published: 'bg-primary/15 text-primary', Rejected: 'bg-destructive/15 text-destructive',
  Failed: 'bg-destructive/15 text-destructive', Unpublished: 'bg-muted text-muted-foreground',
};
export function StatusPill({ s, live }: { s: string; live?: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[s] ?? 'bg-muted'}`}>{live && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{live ? 'Live' : s}</span>;
}
export const fmtBytes = (n: number | null | undefined) => (n == null ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

const ICON = { error: <XCircle className="h-4 w-4 shrink-0 text-destructive" />, warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />, info: <Info className="h-4 w-4 shrink-0 text-muted-foreground" /> };

/** The validation report: verdict, counts and every issue with the file it refers to. */
export function ReportView({ r }: { r: Release }) {
  const rep = r.report;
  if (!rep) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Not validated yet.</p>;
  const errors = rep.issues.filter((i) => i.level === 'error');
  const warns = rep.issues.filter((i) => i.level === 'warning');
  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-3 rounded-2xl border p-4 ${rep.ok ? 'border-primary/40 bg-primary/5' : 'border-destructive/40 bg-destructive/5'}`}>
        {rep.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" /> : <XCircle className="mt-0.5 h-5 w-5 text-destructive" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{rep.ok ? 'All required checks passed' : `${errors.length} blocking ${errors.length === 1 ? 'problem' : 'problems'}`}</p>
          <p className="text-xs text-muted-foreground">{warns.length} warnings · {rep.fileCount} files · {fmtBytes(rep.totalBytes)} unpacked · checked {new Date(rep.checkedAt).toLocaleString()}</p>
          {rep.sha256 && <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">sha256 {rep.sha256}</p>}
        </div>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border font-mono text-xs">
        {[...errors, ...warns, ...rep.issues.filter((i) => i.level === 'info')].map((i, k) => (
          <li key={k} className="flex gap-2.5 px-3 py-2.5">{ICON[i.level]}<div className="min-w-0"><p className="whitespace-pre-wrap break-words font-sans text-[13px]">{i.message}</p><p className="mt-0.5 text-muted-foreground">{i.code}{i.file ? ` · ${i.file}` : ''}</p></div></li>
        ))}
      </ul>
      {rep.dependencies.length > 0 && <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Declared dependencies</p><div className="flex flex-wrap gap-1.5">{rep.dependencies.map((d) => <span key={d.name} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[11px]">{d.name}@{d.version}</span>)}</div></div>}
      <p className="text-[11px] text-muted-foreground">{rep.scanner}</p>
    </div>
  );
}

/** Lists what was actually stored in the archive; click a file to read it straight out of storage. */
export function FileTree({ r }: { r: Release }) {
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const view = async (path: string) => {
    setOpen(path); setText(null); setBusy(true);
    try { const d = await botReleases({ action: 'readFile', releaseId: r.id, path }); setText((d.fileText ?? '') + (d.fileTruncated ? '\n\n… truncated (download the archive for the full file)' : '')); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t open file')); setOpen(null); } finally { setBusy(false); }
  };
  if (!r.files.length) return <p className="text-sm text-muted-foreground">No files indexed yet.</p>;
  return (
    <>
      <ul className="max-h-80 divide-y divide-border overflow-auto rounded-2xl border border-border">
        {r.files.map((f) => (
          <li key={f.path}><button onClick={() => view(f.path)} className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs hover:bg-secondary/60">
            <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{f.path}</span>
            {f.path === r.entryPoint && <span className="rounded bg-primary/15 px-1.5 text-[10px] text-primary">entry</span>}
            <span className="text-muted-foreground">{fmtBytes(f.size)}</span><ChevronRight className="h-3 w-3 text-muted-foreground" />
          </button></li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle className="truncate font-mono text-sm">{open}</DialogTitle></DialogHeader>
          {busy ? <div className="grid h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : <pre className="max-h-[65vh] overflow-auto rounded-xl bg-muted p-4 text-xs leading-relaxed">{text}</pre>}
        </DialogContent>
      </Dialog>
    </>
  );
}

export async function downloadSource(id: string) {
  try { const d = await botReleases({ action: 'download', releaseId: id }); if (d.downloadUrl) window.open(d.downloadUrl, '_blank', 'noopener'); }
  catch (e) { toast.error(errorMessage(e, 'Download failed')); }
}
