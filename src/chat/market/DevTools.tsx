import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, X } from 'lucide-react';
import { developerInfo } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { BOT_EVENTS } from '../../lib/bots';

const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success('Copied'); };
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function hmac(secret: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return <div className="rounded-3xl border border-border bg-card p-5"><h3 className="font-semibold">{title}</h3><p className="mt-0.5 text-sm text-muted-foreground">{desc}</p><div className="mt-4 space-y-3">{children}</div></div>;
}
function CodeBox({ code }: { code: string }) {
  return <div className="relative"><pre className="max-h-72 overflow-auto rounded-xl bg-secondary p-3 text-xs"><code>{code}</code></pre><button onClick={() => copy(code)} aria-label="Copy" className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-background"><Copy className="h-3.5 w-3.5" /></button></div>;
}

const SAMPLE: Record<string, unknown> = {
  MESSAGE_CREATE: { messageId: 'msg_123', channelId: 'ch_1', communityId: 'c_1', authorId: 'u_1', content: '!ping' },
  MESSAGE_UPDATE: { messageId: 'msg_123', channelId: 'ch_1', content: 'edited text' },
  MESSAGE_DELETE: { messageId: 'msg_123', channelId: 'ch_1' },
  MEMBER_JOIN: { communityId: 'c_1', userId: 'u_2' }, MEMBER_LEAVE: { communityId: 'c_1', userId: 'u_2' },
  REACTION_ADD: { messageId: 'msg_123', userId: 'u_1', emoji: '👍' }, REACTION_REMOVE: { messageId: 'msg_123', userId: 'u_1', emoji: '👍' },
  INTERACTION_CREATE: { messageId: 'msg_123', userId: 'u_1', customId: 'role:gamer', values: [] },
};

function SignatureTester() {
  const [secret, setSecret] = useState(''); const [ts, setTs] = useState(String(Math.floor(Date.now() / 1000)));
  const [body, setBody] = useState('{"type":"MESSAGE_CREATE"}'); const [sig, setSig] = useState(''); const [want, setWant] = useState('');
  useEffect(() => { if (secret) hmac(secret, `${ts}.${body}`).then((h) => setWant(`v1=${h}`)); else setWant(''); }, [secret, ts, body]);
  const ok = sig && want ? sig.trim() === want : null;
  return (
    <Card title="Signature tester" desc="Check a webhook you received. We sign `timestamp.body` with your signing secret (HMAC-SHA256). Runs in your browser only.">
      <Input placeholder="Signing secret (whsec_…)" value={secret} onChange={(e) => setSecret(e.target.value)} />
      <Input placeholder="x-chatting-timestamp" value={ts} onChange={(e) => setTs(e.target.value)} />
      <Textarea rows={3} placeholder="Raw request body" value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
      <Input placeholder="x-chatting-signature you received (optional)" value={sig} onChange={(e) => setSig(e.target.value)} />
      {want && <div className="flex items-center gap-2 text-xs"><code className="flex-1 truncate rounded-lg bg-secondary px-2 py-1.5">{want}</code><button onClick={() => copy(want)}><Copy className="h-3.5 w-3.5" /></button></div>}
      {ok !== null && <p className={`flex items-center gap-1 text-sm font-medium ${ok ? 'text-primary' : 'text-destructive'}`}>{ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}{ok ? 'Signature matches' : 'Signature does not match'}</p>}
    </Card>
  );
}

function RequestBuilder({ url }: { url: string }) {
  const [token, setToken] = useState(''); const [op, setOp] = useState('messages.send'); const [params, setParams] = useState('{ "channelId": "CHANNEL_ID", "content": "Hello 👋" }');
  const body = `{ "token": "${token || 'cb_YOUR_KEY'}", "op": "${op}", "params": ${params} }`;
  const [lang, setLang] = useState<'curl' | 'js' | 'py'>('curl');
  const code = lang === 'curl' ? `curl -X POST '${url}' \\\n  -H 'content-type: application/json' \\\n  -d '${body}'`
    : lang === 'js' ? `const res = await fetch('${url}', {\n  method: 'POST',\n  headers: { 'content-type': 'application/json' },\n  body: JSON.stringify(${body}),\n});\nconsole.log(await res.json());`
    : `import requests\nr = requests.post('${url}', json=${body.replace(/true/g, 'True').replace(/false/g, 'False')})\nprint(r.json())`;
  return (
    <Card title="Request builder" desc="Fill in a key and an operation to get a ready-to-run snippet.">
      <div className="grid gap-2 sm:grid-cols-2"><Input placeholder="API key (cbk_…)" value={token} onChange={(e) => setToken(e.target.value)} /><Input placeholder="op" value={op} onChange={(e) => setOp(e.target.value)} /></div>
      <Textarea rows={2} value={params} onChange={(e) => setParams(e.target.value)} className="font-mono text-xs" />
      <div className="flex gap-1 text-xs">{(['curl', 'js', 'py'] as const).map((l) => <button key={l} onClick={() => setLang(l)} className={`rounded-full px-3 py-1 ${lang === l ? 'bg-foreground text-background' : 'bg-secondary'}`}>{l === 'js' ? 'JavaScript' : l === 'py' ? 'Python' : 'curl'}</button>)}</div>
      <CodeBox code={code} />
    </Card>
  );
}

function Payloads() {
  const [ev, setEv] = useState<string>('MESSAGE_CREATE');
  return (
    <Card title="Event payload samples" desc="What your events URL receives for each event type.">
      <div className="flex flex-wrap gap-1">{BOT_EVENTS.map((e) => <button key={e} onClick={() => setEv(e)} className={`rounded-full px-2.5 py-1 font-mono text-[10px] ${ev === e ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>{e}</button>)}</div>
      <CodeBox code={JSON.stringify({ type: ev, timestamp: new Date().toISOString(), data: SAMPLE[ev] }, null, 2)} />
    </Card>
  );
}

function KeyChecker() {
  const [k, setK] = useState('');
  const valid = /^cb_[0-9a-f]{32}\.[A-Za-z0-9]{40}$/.test(k.trim());
  return (
    <Card title="API key format check" desc="Paste a key to make sure it was copied whole — no spaces or missing characters. Nothing is sent anywhere.">
      <Input value={k} onChange={(e) => setK(e.target.value)} placeholder="cb_…" className="font-mono text-xs" />
      {k && <p className={`text-sm font-medium ${valid ? 'text-primary' : 'text-destructive'}`}>{valid ? '✓ Looks like a complete key' : '✗ Not a complete key — copy it again'}</p>}
    </Card>
  );
}

export default function DevTools() {
  const [url, setUrl] = useState('https://YOUR_BOT_API_URL');
  useEffect(() => { developerInfo({}).then((r) => r.apiUrl && setUrl(r.apiUrl)).catch(() => {}); }, []);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2 flex flex-wrap items-center gap-2 rounded-2xl bg-secondary/60 p-3 text-sm"><span className="font-medium">Bot API endpoint</span><code className="flex-1 truncate text-xs">{url}</code><button onClick={() => copy(url)} aria-label="Copy"><Copy className="h-4 w-4" /></button></div>
      <RequestBuilder url={url} /><SignatureTester /><Payloads /><KeyChecker />
    </div>
  );
}
