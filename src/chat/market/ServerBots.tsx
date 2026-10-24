import { useCallback, useEffect, useState } from 'react';
import { getCommunity } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { parseCommunity } from '../../lib/community';
import { useChat } from '../store';
import type { Data } from '../community/kit';
import BotsTab from '../community/BotsTab';

/** Add and manage bots in a server you run — moved here from server settings. */
export default function ServerBots({ initial }: { initial?: string | null }) {
  const { communities, can } = useChat();
  const mine = communities.filter((c) => can(c.id, 'manageCommunity'));
  const [cid, setCid] = useState<string | null>(initial ?? null);
  const [d, setD] = useState<Data | null>(null);
  const active = cid && mine.some((c) => c.id === cid) ? cid : mine[0]?.id ?? null;

  const load = useCallback(async () => {
    if (!active) return;
    const r = await getCommunity({ communityId: active });
    setD({ ...r, id: active, s: parseCommunity(r.settings) });
  }, [active]);
  useEffect(() => { setD(null); load().catch(() => {}); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Your servers</h1><p className="text-sm text-muted-foreground">Add ready-made bots to servers you manage, switch them on or off and configure them. No keys needed.</p></div>
        {mine.length > 0 && (
          <Select value={active ?? undefined} onValueChange={setCid}>
            <SelectTrigger className="w-60"><SelectValue placeholder="Pick a server" /></SelectTrigger>
            <SelectContent>{mine.map((c) => <SelectItem key={c.id} value={c.id}>{c.emoji ?? ''} {c.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>
      {!mine.length ? <p className="rounded-3xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">You don’t manage any servers yet. Create one to add bots.</p>
        : !d ? <Skeleton className="h-40 rounded-3xl" /> : <BotsTab key={d.id} d={d} reload={load} />}
    </div>
  );
}
