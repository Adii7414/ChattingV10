import { useState } from 'react';
import { toast } from 'sonner';
import { marketplace } from 'zitejs/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { listingUrl } from '../../../lib/marketLocal';
import { errorMessage } from '../../../lib/errors';
import { useChat } from '../../store';
import { Code, CopyRow, PageHead, Panel, useApps, type Listing } from './kit';

export default function Installation({ l }: { l: Listing }) {
  const { communities, can } = useChat();
  const { reload } = useApps();
  const servers = communities.filter((c) => can(c.id, 'manageCommunity'));
  const [cid, setCid] = useState('');
  const [busy, setBusy] = useState(false);
  const link = `${listingUrl(l.id)}?add=1`;
  const add = async () => { setBusy(true); try { await marketplace({ action: 'install', listingId: l.id, communityId: cid }); toast.success('Added — your API key works there now'); setCid(''); reload(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t add')); } finally { setBusy(false); } };
  const badge = `[![Add to Chatting](https://img.shields.io/badge/Add%20to-Chatting-60E4C5?style=for-the-badge)](${link})`;
  const html = `<a href="${link}"><img alt="Add to Chatting" src="https://img.shields.io/badge/Add%20to-Chatting-60E4C5?style=for-the-badge"></a>`;
  return (
    <>
      <PageHead title="Installation" desc="How server owners add your bot. They never need a key — they just click Add." />
      <div className="space-y-6">
        {l.status === 'Draft' && <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-600 dark:text-amber-300">This bot is a draft, so only you can add it. Make it Unlisted or publish a release to share it.</p>}
        <Panel title="Install link" desc="Share this link anywhere. It opens your bot’s page with the Add button ready."><CopyRow label="Install link" value={link} /></Panel>
        <Panel title="Add to one of your servers" desc="Great for testing. Your API key starts working there straight away.">
          {!servers.length ? <p className="text-sm text-muted-foreground">You don’t manage any servers yet.</p> : (
            <div className="flex gap-2"><Select value={cid} onValueChange={setCid}><SelectTrigger className="flex-1"><SelectValue placeholder="Pick a server" /></SelectTrigger><SelectContent>{servers.map((c) => <SelectItem key={c.id} value={c.id}>{c.emoji ?? ''} {c.name}</SelectItem>)}</SelectContent></Select>
              <button onClick={add} disabled={!cid || busy} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add</button></div>
          )}
        </Panel>
        <Panel title="“Add to Chatting” badge" desc="Paste into your README or website.">
          <div className="mb-3"><img alt="Add to Chatting" src="https://img.shields.io/badge/Add%20to-Chatting-60E4C5?style=for-the-badge" /></div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Markdown</p><Code code={badge} />
          <p className="mb-1 mt-3 text-xs font-medium text-muted-foreground">HTML</p><Code code={html} />
        </Panel>
        <Panel title="What owners will be asked to allow"><ul className="flex flex-wrap gap-1.5">{l.permissions.map((p) => <li key={p} className="rounded-full bg-secondary px-2.5 py-1 text-xs">{p}</li>)}</ul></Panel>
      </div>
    </>
  );
}
