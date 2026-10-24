import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { Copy, Pause, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';

const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success('Copied'); };
export function Box({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return <div className="rounded-3xl border border-border bg-card p-5"><p className="mb-3 flex items-center gap-2 font-semibold"><span>{emoji}</span>{title}</p>{children}</div>;
}
function useLocal<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : init; } catch { return init; } });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(v)); }, [key, v]);
  return [v, setV] as const;
}

export function FocusTimer() {
  const [mins, setMins] = useLocal('labs:focus-mins', 25);
  const [left, setLeft] = useState(mins * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => { if (!running) return; const t = setInterval(() => setLeft((s) => s - 1), 1000); return () => clearInterval(t); }, [running]);
  useEffect(() => {
    if (left > 0 || !running) return;
    setRunning(false); setLeft(mins * 60);
    toast.success('Focus session done — take a break ☕');
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Focus session done', { body: 'Take a short break ☕' });
  }, [left, running, mins]);
  const start = () => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); setRunning(!running); };
  const pct = 1 - left / (mins * 60);
  return (
    <Box title="Focus timer" emoji="🎯">
      <div className="flex items-center gap-5">
        <div className="relative grid h-24 w-24 place-items-center rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${pct * 360}deg, hsl(var(--secondary)) 0)` }}><span className="grid h-20 w-20 place-items-center rounded-full bg-card font-mono text-lg">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</span></div>
        <div className="space-y-2">
          <div className="flex gap-1">{[15, 25, 50].map((m) => <button key={m} disabled={running} onClick={() => { setMins(m); setLeft(m * 60); }} className={`rounded-full border px-2.5 py-1 text-xs ${mins === m ? 'border-primary text-primary' : 'border-border'}`}>{m}m</button>)}</div>
          <div className="flex gap-2"><button onClick={start} className="inline-flex h-9 items-center gap-1 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">{running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{running ? 'Pause' : 'Start'}</button><button onClick={() => { setRunning(false); setLeft(mins * 60); }} aria-label="Reset" className="grid h-9 w-9 place-items-center rounded-full border border-border"><RotateCcw className="h-4 w-4" /></button></div>
        </div>
      </div>
    </Box>
  );
}

const ZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];
export function WorldClock() {
  const [zones, setZones] = useLocal<string[]>('labs:zones', ['Asia/Kolkata', 'Europe/London', 'America/New_York']);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const add = ZONES.filter((z) => !zones.includes(z));
  return (
    <Box title="World clock" emoji="🌍">
      <div className="space-y-2">{zones.map((z) => { const d = new Date(); const t = d.toLocaleTimeString([], { timeZone: z, hour: 'numeric', minute: '2-digit' }); const h = Number(d.toLocaleString('en-GB', { timeZone: z, hour: '2-digit', hour12: false })); return <div key={z} className="flex items-center gap-2 text-sm"><span>{h >= 7 && h < 19 ? '☀️' : '🌙'}</span><span className="flex-1">{z.split('/').pop()!.replace('_', ' ')}</span><b className="font-mono">{t}</b><button onClick={() => setZones(zones.filter((x) => x !== z))} aria-label="Remove"><X className="h-3.5 w-3.5 text-muted-foreground" /></button></div>; })}</div>
      {add.length > 0 && <select value="" onChange={(e) => e.target.value && setZones([...zones, e.target.value])} className="mt-3 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"><option value="">+ Add a city</option>{add.map((z) => <option key={z} value={z}>{z.split('/').pop()!.replace('_', ' ')}</option>)}</select>}
    </Box>
  );
}

export function InviteQR() {
  const ref = useRef<HTMLCanvasElement>(null);
  const url = `${window.location.origin}/app`;
  useEffect(() => { if (ref.current) QRCode.toCanvas(ref.current, url, { width: 140, margin: 1 }); }, [url]);
  return (
    <Box title="Invite friends" emoji="📲">
      <div className="flex items-center gap-4"><canvas ref={ref} className="rounded-xl bg-white" /><div className="space-y-2 text-sm"><p className="text-muted-foreground">Friends scan this to join Chatting.</p><button onClick={() => copy(url)} className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs"><Copy className="h-3 w-3" />Copy link</button>{'share' in navigator && <button onClick={() => navigator.share({ title: 'Join me on Chatting', url }).catch(() => {})} className="ml-2 h-8 rounded-full bg-primary px-3 text-xs text-primary-foreground">Share</button>}</div></div>
    </Box>
  );
}

const SHORTCUTS: [string, string][] = [['⌘/Ctrl + K', 'Command palette'], ['Alt + ↑ / ↓', 'Previous / next chat'], ['Alt + Shift + ↑ / ↓', 'Previous / next unread'], ['Enter', 'Send'], ['Shift + Enter', 'New line'], [':name', 'Emoji shortcode'], ['/', 'Slash commands']];
export function Shortcuts() {
  return <Box title="Keyboard shortcuts" emoji="⌨️"><div className="space-y-1.5">{SHORTCUTS.map(([k, v]) => <div key={k} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{v}</span><kbd className="rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd></div>)}</div></Box>;
}

const KAOMOJI = ['(◕‿◕)', '(╯°□°)╯︵ ┻━┻', '¯\\_(ツ)_/¯', '(づ｡◕‿‿◕｡)づ', '(ಥ﹏ಥ)', 'ʕ•ᴥ•ʔ', '(ᵔᴥᵔ)', '٩(◕‿◕｡)۶', '(¬‿¬)', '(✿◠‿◠)', '(•_•) ( •_•)>⌐■-■ (⌐■_■)', '༼ つ ◕_◕ ༽つ', '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '(⊙_☉)', '♪(´▽｀)', '(´• ω •`)'];
export function Kaomoji() {
  return <Box title="Kaomoji" emoji="ʕ•ᴥ•ʔ"><div className="flex flex-wrap gap-1.5">{KAOMOJI.map((k) => <button key={k} onClick={() => copy(k)} className="rounded-lg bg-secondary px-2 py-1 text-xs hover:bg-secondary/70">{k}</button>)}</div></Box>;
}

const map = (s: string, upper: number, lower: number, digit?: number) => [...s].map((c) => { const p = c.codePointAt(0)!; if (p >= 65 && p <= 90) return String.fromCodePoint(upper + p - 65); if (p >= 97 && p <= 122) return String.fromCodePoint(lower + p - 97); if (digit && p >= 48 && p <= 57) return String.fromCodePoint(digit + p - 48); return c; }).join('');
const STYLES: [string, (s: string) => string][] = [
  ['Bold', (s) => map(s, 0x1d400, 0x1d41a, 0x1d7ce)], ['Italic', (s) => map(s, 0x1d434, 0x1d44e)], ['Script', (s) => map(s, 0x1d4d0, 0x1d4ea)], ['Double', (s) => map(s, 0x1d538, 0x1d552, 0x1d7d8)],
  ['Mono', (s) => map(s, 0x1d670, 0x1d68a, 0x1d7f6)], ['Sans bold', (s) => map(s, 0x1d5d4, 0x1d5ee, 0x1d7ec)], ['Bubble', (s) => [...s].map((c) => (/[a-z]/i.test(c) ? String.fromCodePoint((c === c.toUpperCase() ? 0x24b6 : 0x24d0) + c.toLowerCase().charCodeAt(0) - 97) : c)).join('')], ['Wide', (s) => [...s].map((c) => (c >= '!' && c <= '~' ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c === ' ' ? '　' : c)).join('')],
];
export function FancyText() {
  const [t, setT] = useState('Hello Chatting');
  return <Box title="Fancy text" emoji="𝓐"><Input value={t} onChange={(e) => setT(e.target.value)} maxLength={80} /><div className="mt-3 space-y-1">{STYLES.map(([n, f]) => <button key={n} onClick={() => copy(f(t))} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary"><span className="truncate">{f(t)}</span><span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{n}</span></button>)}</div></Box>;
}

export function Templates() {
  const [list, setList] = useLocal<{ name: string; body: string }[]>('labs:templates', [{ name: 'On my way', body: 'On my way! 🚗 Be there in 10.' }]);
  const [name, setName] = useState(''); const [body, setBody] = useState('');
  return (
    <Box title="Message templates" emoji="📝">
      <div className="space-y-1.5">{list.map((x, i) => <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-sm"><button onClick={() => copy(x.body)} className="min-w-0 flex-1 text-left"><p className="font-medium">{x.name}</p><p className="truncate text-xs text-muted-foreground">{x.body}</p></button><button onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Delete"><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button></div>)}</div>
      <div className="mt-3 space-y-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={30} /><Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={2} maxLength={1000} />
        <button disabled={!name.trim() || !body.trim()} onClick={() => { setList([...list, { name: name.trim(), body: body.trim() }]); setName(''); setBody(''); }} className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-xs text-background disabled:opacity-40"><Plus className="h-3 w-3" />Save template</button></div>
      <p className="mt-2 text-xs text-muted-foreground">Tap a template to copy it, then paste into any chat.</p>
    </Box>
  );
}
