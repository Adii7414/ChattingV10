import { useEffect, useState } from 'react';
import { marketplace, type MarketplaceOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { Verify } from './Editor';
import { PageHead, useApps, type Listing } from './kit';

export default function Verification({ l }: { l: Listing }) {
  const { reload } = useApps();
  const [checks, setChecks] = useState<MarketplaceOutputType['checks'] | null>(null);
  useEffect(() => { marketplace({ action: 'get', listingId: l.id }).then((r) => setChecks(r.checks)).catch(() => setChecks([])); }, [l.id]);
  return (
    <>
      <PageHead title="Verification" desc="Verified bots get a ✓ APP badge, rank higher in the marketplace and earn owners’ trust." />
      {!checks ? <Skeleton className="h-40 rounded-2xl" /> : <Verify l={l} checks={checks} onDone={(r) => { setChecks(r.checks); reload(); }} />}
      <div className="mt-6 grid gap-3 sm:grid-cols-3 text-sm">{[['✓ APP badge', 'Shown next to your bot’s name everywhere.'], ['Better ranking', 'Verified bots appear in the Verified filter and sort.'], ['Owner trust', 'Owners see it’s been reviewed by Chatting staff.']].map(([t, d]) => <div key={t} className="rounded-xl border border-border p-3"><p className="font-semibold">{t}</p><p className="text-xs text-muted-foreground">{d}</p></div>)}</div>
    </>
  );
}
