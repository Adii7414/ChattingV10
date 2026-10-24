import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { marketplace } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { errorMessage } from '../../../lib/errors';
import { toPatch, type Patch } from './Editor';
import { PageHead, Panel, savePart, useApps, type Listing } from './kit';

export default function Danger({ l }: { l: Listing }) {
  const { reload } = useApps();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState('');
  const setStatus = async (status: Patch['status']) => { if (await savePart(l, { status }, `Now ${status.toLowerCase()}`)) reload(); };
  const remove = async () => { try { await marketplace({ action: 'delete', listingId: l.id }); await reload(); toast.success('Application deleted'); nav('/app/bots/dev'); } catch (e) { toast.error(errorMessage(e, 'Couldn’t delete')); } };
  const backup = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...toPatch(l), id: l.id, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })); a.download = `${l.name}-backup.json`; a.click(); };
  return (
    <>
      <PageHead title="Danger Zone" desc="Visibility, backups and deleting your application." />
      <div className="space-y-6">
        <Panel title="Visibility">
          <div className="grid gap-2 sm:grid-cols-3">{([['Draft', 'Only you can see and add it'], ['Unlisted', 'Anyone with the link can add it'], ['Published', 'Listed in the marketplace (needs an approved release)']] as const).map(([s, d]) => (
            <button key={s} onClick={() => s !== l.status && setStatus(s)} className={`rounded-xl border p-3 text-left ${l.status === s ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}><p className="text-sm font-semibold">{s}</p><p className="text-xs text-muted-foreground">{d}</p></button>
          ))}</div>
        </Panel>
        <Panel title="Backup" desc="Download every listing setting as JSON. You can import it from General Information."><button onClick={backup} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"><Download className="h-4 w-4" />Download backup</button></Panel>
        <section className="rounded-2xl border border-destructive/40 p-5">
          <h2 className="font-semibold text-destructive">Delete application</h2>
          <p className="mt-1 text-sm text-muted-foreground">Removes {l.name} from the marketplace and from all {l.installs} servers, and its API key stops working. This can’t be undone.</p>
          <p className="mt-3 text-xs">Type <b>{l.name}</b> to confirm</p>
          <div className="mt-1 flex gap-2"><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} /><button onClick={remove} disabled={confirm !== l.name} className="h-10 shrink-0 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-40">Delete</button></div>
        </section>
      </div>
    </>
  );
}
