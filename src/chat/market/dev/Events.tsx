import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { devPortal, type DevPortalOutputType } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Switch } from '@project/components/ui/switch';
import { BOT_EVENTS } from '../../../lib/bots';
import { errorMessage } from '../../../lib/errors';
import { Code, PageHead, Panel, savePart, useApps, type Listing } from './kit';

type Ev = (typeof BOT_EVENTS)[number];
const WHEN: Record<string, string> = { MESSAGE_CREATE: 'A message is sent', MESSAGE_UPDATE: 'A message is edited', MESSAGE_DELETE: 'A message is deleted', MEMBER_JOIN: 'Someone joins', MEMBER_LEAVE: 'Someone leaves, is kicked or banned', REACTION_ADD: 'A reaction is added', REACTION_REMOVE: 'A reaction is removed', INTERACTION_CREATE: 'A button or menu on your message is used' };
const VERIFY = `import crypto from "node:crypto";

export function verify(req, rawBody, secret) {
  const ts = req.headers["x-chatting-timestamp"];
  const sig = req.headers["x-chatting-signature"];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay
  const want = "v1=" + crypto.createHmac("sha256", secret).update(ts + "." + rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}`;

export default function Events({ l }: { l: Listing }) {
  const { reload } = useApps();
  const [url, setUrl] = useState(l.eventsUrl ?? '');
  const [ev, setEv] = useState<Ev[]>(l.eventTypes as Ev[]);
  const [test, setTest] = useState<DevPortalOutputType['test']>(null);
  const [busy, setBusy] = useState(false);
  const validUrl = !url || /^https:\/\/\S+$/.test(url);
  const dirty = url !== (l.eventsUrl ?? '') || [...ev].sort().join() !== [...l.eventTypes].sort().join();
  const save = async () => { if (await savePart(l, { eventsUrl: url.trim() || null, eventTypes: ev }, 'Events saved')) reload(); };
  const run = async () => { setBusy(true); try { setTest((await devPortal({ action: 'testEvent', listingId: l.id })).test); } catch (e) { toast.error(errorMessage(e, 'Couldn’t send')); } finally { setBusy(false); } };
  return (
    <>
      <PageHead title="Events & Webhooks" desc="Choose what your bot hears about and where we send it. No events URL? Poll them with events.poll instead.">
        <button onClick={save} disabled={!dirty || !validUrl} className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save changes</button>
      </PageHead>
      <div className="space-y-6">
        <Panel title="Events URL" desc="We POST signed JSON here for every event, from every server your bot is in.">
          <div className="flex gap-2"><Input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://your-bot.example.com/events" className={validUrl ? '' : 'border-destructive'} />
            <button onClick={run} disabled={busy || !l.eventsUrl || dirty} title={dirty ? 'Save first' : 'Send a signed PING'} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send test</button></div>
          {!validUrl && <p className="mt-1 text-xs text-destructive">Must be an https:// URL.</p>}
          {test && <div className={`mt-3 rounded-xl p-3 text-sm ${test.ok ? 'bg-primary/10' : 'bg-destructive/10'}`}><p className="font-medium">{test.ok ? '✓ Delivered' : '✗ Failed'} · {test.status || 'no response'} · {test.ms} ms{test.error ? ` · ${test.error}` : ''}</p>{test.body && <pre className="mt-2 max-h-32 overflow-auto font-mono text-[11px]">{test.body}</pre>}</div>}
        </Panel>
        <Panel title="Subscriptions" right={<div className="flex gap-2 text-xs"><button onClick={() => setEv([...BOT_EVENTS])} className="text-primary">All</button><button onClick={() => setEv([])} className="text-muted-foreground">None</button></div>}>
          <div className="divide-y divide-border">{BOT_EVENTS.map((e) => <div key={e} className="flex items-center justify-between gap-3 py-2.5"><div><p className="font-mono text-sm">{e}</p><p className="text-xs text-muted-foreground">{WHEN[e]}</p></div><Switch checked={ev.includes(e)} onCheckedChange={(v) => setEv(v ? [...ev, e] : ev.filter((x) => x !== e))} /></div>)}</div>
        </Panel>
        <Panel title="Verify signatures (Node.js)" desc="Every request carries x-chatting-timestamp and x-chatting-signature. Use your signing secret from the Bot page."><Code code={VERIFY} /></Panel>
      </div>
    </>
  );
}
