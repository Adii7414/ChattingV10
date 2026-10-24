import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CopyPlus, ExternalLink } from 'lucide-react';
import { marketplace } from 'zitejs/api';
import { listingUrl } from '../../../lib/marketLocal';
import { errorMessage } from '../../../lib/errors';
import { Editor, toPatch } from './Editor';
import { CopyRow, PageHead, Panel, useApps, type Listing } from './kit';

export default function General({ l }: { l: Listing }) {
  const { reload } = useApps();
  const nav = useNavigate();
  const dup = async () => { try { const r = await marketplace({ action: 'save', patch: { ...toPatch(l), name: `${l.name} copy`.slice(0, 40), status: 'Draft' } }); await reload(); toast.success('Duplicated'); if (r.listing) nav(`/app/bots/dev/${r.listing.id}/information`); } catch (e) { toast.error(errorMessage(e, 'Couldn’t duplicate')); } };
  return (
    <>
      <PageHead title="General Information" desc="What people see on your bot’s marketplace page.">
        <a href={`/app/bots/${l.id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"><ExternalLink className="h-4 w-4" />View listing</a>
        <button onClick={dup} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"><CopyPlus className="h-4 w-4" />Duplicate</button>
      </PageHead>
      {l.status === 'Removed' && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">Removed by Chatting staff{l.removalReason ? `: ${l.removalReason}` : ''}. Contact support to appeal.</p>}
      <Panel className="mb-6"><div className="grid gap-4 sm:grid-cols-3"><CopyRow label="Application ID" value={l.id} /><CopyRow label="Public link" value={listingUrl(l.id)} /><CopyRow label="Created" value={l.createdAt ? new Date(l.createdAt).toLocaleString() : '—'} mono={false} /></div></Panel>
      <Editor listing={l} onSaved={() => reload()} onClose={() => nav('/app/bots/dev')} />
    </>
  );
}
