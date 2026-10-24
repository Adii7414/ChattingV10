import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { marketplace } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { errorMessage } from '../../../lib/errors';
import ApiKeyCard from '../ApiKeyCard';
import { BotAvatar } from '../../BotMessage';
import { CopyRow, PageHead, Panel, useApps, type Listing } from './kit';

export default function BotPage({ l }: { l: Listing }) {
  const { reload } = useApps();
  const [key, setKey] = useState(l.apiKey);
  const [ask, setAsk] = useState(false);
  const [check, setCheck] = useState('');
  const rotate = async () => { try { await marketplace({ action: 'rotateSecret', listingId: l.id }); await reload(); toast.success('New signing secret created'); } catch (e) { toast.error(errorMessage(e, 'Couldn’t reset')); } };
  const c = check.trim();
  const verdict = !c ? null : c === key ? 'This is your current key ✓' : /^cbk_[0-9a-f]{32}\.[A-Za-z0-9]{40}$/.test(c) ? 'Valid format, but not this bot’s current key (maybe an old one).' : /^cb_/.test(c) ? 'That’s an old per-server key. Use the key above instead.' : 'Not a complete key — copy it again.';
  return (
    <>
      <PageHead title="Bot" desc="Your bot’s identity and the secrets your code uses." />
      <div className="space-y-6">
        <Panel><div className="flex items-center gap-4"><BotAvatar name={l.name} avatar={l.avatar} size={64} /><div><p className="text-lg font-semibold">{l.name}<span className="ml-2 rounded bg-primary px-1.5 py-0.5 align-middle text-[10px] font-bold text-primary-foreground">BOT</span></p><p className="text-sm text-muted-foreground">{l.tagline}</p></div></div></Panel>
        <ApiKeyCard listingId={l.id} apiKey={key} name={l.name} onRotated={setKey} />
        <Panel title="Signing secret" desc="Verifies that events sent to your events URL really came from Chatting." right={<button onClick={() => setAsk(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs"><RefreshCw className="h-3 w-3" />Reset</button>}>
          <CopyRow label="Signing secret" value={l.signingSecret ?? ''} />
        </Panel>
        <Panel title="Key checker" desc="Paste a key from your code to see if it’s the right one. Checked in your browser only.">
          <Input value={check} onChange={(e) => setCheck(e.target.value)} placeholder="cbk_…" className="font-mono text-xs" />
          {verdict && <p className={`mt-2 text-sm font-medium ${c === key ? 'text-primary' : 'text-destructive'}`}>{verdict}</p>}
        </Panel>
      </div>
      <AlertDialog open={ask} onOpenChange={setAsk}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reset signing secret?</AlertDialogTitle><AlertDialogDescription>Your server must use the new secret to check signatures from now on.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={rotate}>Reset</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>
  );
}
