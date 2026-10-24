import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download, LogOut, Search } from 'lucide-react';
import { marketplace, devPortal, type MarketplaceOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { errorMessage } from '../../../lib/errors';
import { PageHead, Stat, ago, copyText, useApps, type Listing } from './kit';

type Inst = MarketplaceOutputType['installations'][number];

export default function Servers({ l }: { l: Listing }) {
  const { reload } = useApps();
  const [rows, setRows] = useState<Inst[] | null>(null);
  const [q, setQ] = useState(''); const [sort, setSort] = useState<'recent' | 'calls' | 'name'>('recent');
  const [leave, setLeave] = useState<Inst | null>(null);
  const load = () => marketplace({ action: 'installations', listingId: l.id }).then((r) => setRows(r.installations)).catch(() => setRows([]));
  useEffect(() => { load(); }, [l.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = (rows ?? []).filter((r) => r.communityName.toLowerCase().includes(q.toLowerCase())).sort((a, b) => sort === 'calls' ? b.apiCalls - a.apiCalls : sort === 'name' ? a.communityName.localeCompare(b.communityName) : b.installedAt.localeCompare(a.installedAt));
  const active = (rows ?? []).filter((r) => r.lastActiveAt && Date.now() - new Date(r.lastActiveAt).getTime() < 7 * 864e5).length;
  const csv = () => { const data = [['Server', 'Server ID', 'Installed', 'Last active', 'API calls'], ...(rows ?? []).map((i) => [i.communityName, i.communityId, i.installedAt, i.lastActiveAt ?? '', String(i.apiCalls)])]; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })); a.download = `${l.name}-servers.csv`; a.click(); };
  const doLeave = async () => { if (!leave) return; try { await devPortal({ action: 'removeInstall', listingId: l.id, botId: leave.botId }); toast.success(`Left ${leave.communityName}`); load(); reload(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove')); } };
  return (
    <>
      <PageHead title="Servers" desc="Every server your bot is in. Use a server ID as params.serverId in API calls.">
        <button onClick={csv} disabled={!rows?.length} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button>
      </PageHead>
      <div className="mb-6 grid grid-cols-3 gap-3"><Stat label="Servers" value={rows?.length ?? '—'} /><Stat label="Active this week" value={rows ? active : '—'} /><Stat label="API calls" value={rows ? rows.reduce((s, r) => s + r.apiCalls, 0) : '—'} /></div>
      <div className="mb-3 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search servers" className="h-9 w-full rounded-lg border border-border bg-background pl-9 text-sm" /></div>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm"><option value="recent">Newest</option><option value="calls">Most API calls</option><option value="name">Name</option></select></div>
      {!rows ? <Skeleton className="h-32 rounded-2xl" /> : !rows.length ? <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">Not in any server yet — add it from the Installation page.</p> : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm"><thead className="bg-secondary/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2">Server</th><th className="hidden px-4 py-2 sm:table-cell">Added</th><th className="px-4 py-2">Last active</th><th className="px-4 py-2 text-right">Calls</th><th /></tr></thead>
            <tbody className="divide-y divide-border">{list.map((r) => (
              <tr key={r.botId}><td className="px-4 py-2.5 font-medium">{r.communityName}</td><td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{new Date(r.installedAt).toLocaleDateString()}</td><td className="px-4 py-2.5 text-muted-foreground"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${r.lastActiveAt && Date.now() - new Date(r.lastActiveAt).getTime() < 864e5 ? 'bg-primary' : 'bg-muted-foreground/40'}`} />{ago(r.lastActiveAt)}</td><td className="px-4 py-2.5 text-right tabular-nums">{r.apiCalls}</td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap"><button onClick={() => copyText(r.communityId, 'Server ID copied')} title="Copy server ID" className="rounded-md p-1.5 hover:bg-secondary"><Copy className="h-4 w-4" /></button><button onClick={() => setLeave(r)} title="Leave server" className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"><LogOut className="h-4 w-4" /></button></td></tr>
            ))}</tbody></table>
        </div>
      )}
      <AlertDialog open={!!leave} onOpenChange={(o) => !o && setLeave(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Leave {leave?.communityName}?</AlertDialogTitle><AlertDialogDescription>Your bot is removed from this server and stops receiving its events. The owner can add it again later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doLeave} className="bg-destructive text-destructive-foreground">Leave</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>
  );
}
