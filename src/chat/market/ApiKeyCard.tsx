import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Eye, EyeOff, KeyRound, Loader2, RefreshCw, Terminal } from 'lucide-react';
import { marketplace, developerInfo } from 'zitejs/api';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { errorMessage } from '../../lib/errors';

const copy = (s: string, what = 'Copied') => { navigator.clipboard.writeText(s); toast.success(what); };
const mask = (k: string) => `${k.slice(0, 8)}${'•'.repeat(24)}${k.slice(-4)}`;

/** The bot's one developer API key: works in every server the bot is in, viewable any time by its developer. */
export default function ApiKeyCard({ listingId, apiKey, name, onRotated }: { listingId: string; apiKey: string | null; name: string; onRotated: (k: string) => void }) {
  const [show, setShow] = useState(false);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snip, setSnip] = useState<'curl' | 'js' | 'py'>('curl');
  const [api, setApi] = useState('https://YOUR_BOT_API_URL');
  useEffect(() => { developerInfo({}).then((r) => r.apiUrl && setApi(r.apiUrl)).catch(() => {}); }, []);
  const rotate = async () => {
    setBusy(true);
    try { const r = await marketplace({ action: 'rotateKey', listingId }); if (r.token) { onRotated(r.token); setShow(true); } toast.success('New key created. The old one stopped working.'); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t regenerate')); } finally { setBusy(false); }
  };
  const k = apiKey ?? '';
  const snippets = {
    curl: `curl -X POST ${api} \\\n  -H "content-type: application/json" \\\n  -d '{"token":"${k}","op":"servers.list"}'`,
    js: `const call = (op, params = {}) => fetch("${api}", {\n  method: "POST", headers: { "content-type": "application/json" },\n  body: JSON.stringify({ token: process.env.CHATTING_KEY, op, params }),\n}).then((r) => r.json());\n\nconst { data } = await call("servers.list");\nfor (const s of data.servers)\n  await call("channels.list", { serverId: s.id });`,
    py: `import os, requests\n\ndef call(op, **params):\n    return requests.post("${api}", json={"token": os.environ["CHATTING_KEY"], "op": op, "params": params}).json()\n\nfor s in call("servers.list")["data"]["servers"]:\n    print(s["name"], call("channels.list", serverId=s["id"]))`,
  };
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-primary" />API key</p>
        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">Works in every server {name} is in</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Only you can see this. Use it in your bot’s code; to act in one server, pass <code>params.serverId</code> (skip it if the bot is in just one server). Server owners never need a key.</p>
      {!k ? <p className="mt-2 text-xs text-muted-foreground">Generating…</p> : (
        <div className="mt-2 flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-3 py-2 font-mono text-xs">{show ? k : mask(k)}</code>
          <button onClick={() => setShow(!show)} aria-label={show ? 'Hide' : 'Show'} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-background">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          <button onClick={() => copy(k, 'API key copied')} aria-label="Copy" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-background"><Copy className="h-4 w-4" /></button>
          <button onClick={() => setAsk(true)} disabled={busy} aria-label="Regenerate" title="Regenerate" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-background">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <button onClick={() => copy(`CHATTING_KEY=${k}`, 'Copied as .env line')} className="rounded-full border border-border bg-background px-2.5 py-1">Copy as .env</button>
        <button onClick={() => copy(api, 'API URL copied')} className="rounded-full border border-border bg-background px-2.5 py-1">Copy API URL</button>
      </div>
      <details className="mt-3 rounded-xl border border-border bg-background">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium"><Terminal className="h-3.5 w-3.5" />Quick start</summary>
        <div className="border-t border-border p-3">
          <div className="mb-2 flex gap-1 text-xs">{(['curl', 'js', 'py'] as const).map((x) => <button key={x} onClick={() => setSnip(x)} className={`rounded-full px-2.5 py-0.5 ${snip === x ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>{{ curl: 'cURL', js: 'Node', py: 'Python' }[x]}</button>)}
            <button onClick={() => copy(snippets[snip])} className="ml-auto inline-flex items-center gap-1 text-muted-foreground"><Copy className="h-3 w-3" />Copy</button></div>
          <pre className="overflow-x-auto rounded-lg bg-secondary p-3 font-mono text-[11px] leading-relaxed">{snip === 'curl' ? snippets.curl.replace(k, show ? k : mask(k)) : snippets[snip]}</pre>
        </div>
      </details>
      <AlertDialog open={ask} onOpenChange={setAsk}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Regenerate API key?</AlertDialogTitle><AlertDialogDescription>The current key stops working straight away in every server. Update your bot’s code with the new one.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={rotate}>Regenerate</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
