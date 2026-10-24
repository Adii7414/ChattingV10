import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, FileArchive, Loader2, Paperclip, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { useUpload } from 'zitejs/upload';
import { botReleases } from 'zitejs/api';
import { errorMessage } from '../../../lib/errors';
import { fmtBytes, type Release } from './shared';

type Stage = 'idle' | 'reserving' | 'storing' | 'verifying' | 'done' | 'error';
const STAGES: { k: Stage; l: string }[] = [{ k: 'reserving', l: 'Preparing version' }, { k: 'storing', l: 'Uploading to file storage' }, { k: 'verifying', l: 'Verifying stored bytes & validating' }];

function Drop({ accept, multiple, disabled, onFiles, children }: { accept?: string; multiple?: boolean; disabled?: boolean; onFiles: (f: File[]) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div onClick={() => !disabled && ref.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles([...e.dataTransfer.files]); }}
      className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${over ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'} ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {children}
    </div>
  );
}

export default function UploadStep({ r, maxMB, locked, onChange }: { r: Release; maxMB: number; locked: boolean; onChange: (r: Release) => void }) {
  const { upload } = useUpload();
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  const send = async (f: File) => {
    setErr(null); setFile(f);
    if (!/\.zip$/i.test(f.name)) { setErr('Upload the project as a .zip archive.'); setStage('error'); return; }
    if (f.size > maxMB * 1048576) { setErr(`That archive is ${fmtBytes(f.size)} — the limit is ${maxMB} MB.`); setStage('error'); return; }
    try {
      setStage('reserving');
      await botReleases({ action: 'startUpload', releaseId: r.id, fileName: f.name, size: f.size });
      setStage('storing');
      const { url } = await upload(f);
      setStage('verifying');
      const d = await botReleases({ action: 'completeUpload', releaseId: r.id, url, fileName: f.name, size: f.size });
      setStage('done');
      if (d.release) onChange(d.release);
      toast[d.release?.report?.ok ? 'success' : 'error'](d.release?.report?.ok ? 'Uploaded and validated' : 'Uploaded — validation found problems');
    } catch (e) {
      setErr(errorMessage(e, 'Upload failed')); setStage('error');
      botReleases({ action: 'get', releaseId: r.id }).then((d) => d.release && onChange(d.release)).catch(() => {});
    }
  };

  const attach = async (files: File[]) => {
    if (!files.length) return;
    setAttaching(true);
    try {
      const done: { url: string; name: string; size: number }[] = [];
      for (const f of files) { if (f.size > maxMB * 1048576) throw new Error(`${f.name} is over ${maxMB} MB`); done.push({ url: (await upload(f)).url, name: f.name, size: f.size }); }
      const d = await botReleases({ action: 'addFiles', releaseId: r.id, files: done });
      if (d.release) onChange(d.release);
      toast.success(`Attached ${done.length} file${done.length > 1 ? 's' : ''}`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t attach')); } finally { setAttaching(false); }
  };
  const remove = async (url: string) => { try { const d = await botReleases({ action: 'removeFile', releaseId: r.id, url }); if (d.release) onChange(d.release); } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove')); } };
  const busy = stage === 'reserving' || stage === 'storing' || stage === 'verifying';
  const idx = STAGES.findIndex((s) => s.k === stage);

  return (
    <div className="space-y-5">
      {r.hasArchive && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <FileArchive className="h-8 w-8 text-primary" />
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.archiveName}</p><p className="text-xs text-muted-foreground">{fmtBytes(r.archiveSize)} stored · {r.files.length} files indexed</p><p className="truncate font-mono text-[10px] text-muted-foreground">sha256 {r.archiveSha256}</p></div>
        </div>
      )}
      {!locked && (
        <Drop accept=".zip,application/zip" disabled={busy} onFiles={(f) => f[0] && send(f[0])}>
          <UploadCloud className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-2 font-medium">{r.hasArchive ? 'Replace the project archive' : 'Drop your project .zip here'}</p>
          <p className="text-xs text-muted-foreground">Whole project — source, manifest, package.json / requirements.txt, assets. Max {maxMB} MB, no node_modules or binaries.</p>
        </Drop>
      )}
      {stage !== 'idle' && (
        <div className="space-y-2 rounded-2xl border border-border p-4">
          {file && <p className="text-sm font-medium">{file.name} <span className="text-muted-foreground">· {fmtBytes(file.size)}</span></p>}
          {STAGES.map((s, i) => {
            const state = stage === 'done' || i < idx ? 'done' : i === idx ? 'now' : stage === 'error' ? 'skip' : 'todo';
            return <div key={s.k} className="flex items-center gap-2 text-sm">{state === 'done' ? <CheckCircle2 className="h-4 w-4 text-primary" /> : state === 'now' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <span className="h-4 w-4 rounded-full border border-border" />}<span className={state === 'todo' || state === 'skip' ? 'text-muted-foreground' : ''}>{s.l}</span></div>;
          })}
          {err && <p className="flex items-start gap-2 text-sm text-destructive"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}</p>}
        </div>
      )}
      <div>
        <p className="mb-2 text-sm font-semibold">Supporting files <span className="font-normal text-muted-foreground">— docs, config templates, assets</span></p>
        {r.supportingFiles.length > 0 && <ul className="mb-3 divide-y divide-border rounded-2xl border border-border">{r.supportingFiles.map((f) => (
          <li key={f.url} className="flex items-center gap-2 px-3 py-2 text-sm"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" /><a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{f.name}</a><span className="text-xs text-muted-foreground">{fmtBytes(f.size)}</span>{!locked && <button onClick={() => remove(f.url)} aria-label="Remove"><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button>}</li>
        ))}</ul>}
        {!locked && <Drop multiple disabled={attaching} onFiles={attach}>{attaching ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : <p className="text-sm text-muted-foreground">Drop files or click to attach (up to 20)</p>}</Drop>}
      </div>
    </div>
  );
}
