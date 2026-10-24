import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';

type Cfg = { greeting?: string; commands: { name: string; reply: string }[]; keywords: { match: string; reply: string }[] };
const parse = (s: string | null): Cfg => { try { const v = JSON.parse(s || '{}'); return { greeting: v.greeting ?? '', commands: v.commands ?? [], keywords: v.keywords ?? [] }; } catch { return { greeting: '', commands: [], keywords: [] }; } };

/** Editor for a prompt/configuration bot: what it says on join, on /commands and on keywords. No code. */
export default function PromptStep({ value, locked, onSave }: { value: string | null; locked: boolean; onSave: (json: string) => void }) {
  const [c, setC] = useState<Cfg>(() => parse(value));
  const set = (n: Cfg) => setC(n);
  const save = () => onSave(JSON.stringify({ ...c, greeting: c.greeting || undefined }));
  return (
    <fieldset disabled={locked} className="space-y-5">
      <label className="block"><span className="text-sm font-medium">Greeting for new members</span><span className="ml-2 text-xs text-muted-foreground">use {'{user}'} to mention them</span>
        <Textarea className="mt-1.5" rows={2} maxLength={1000} value={c.greeting ?? ''} onChange={(e) => set({ ...c, greeting: e.target.value })} placeholder="Welcome {user}! Type /help to see what I can do." /></label>
      <div>
        <p className="text-sm font-medium">Slash commands</p>
        <div className="mt-2 space-y-2">{c.commands.map((x, i) => (
          <div key={i} className="flex flex-col gap-2 sm:flex-row"><Input className="font-mono sm:w-40" placeholder="help" value={x.name} onChange={(e) => set({ ...c, commands: c.commands.map((y, j) => (j === i ? { ...y, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) } : y)) })} />
            <Input placeholder="Reply" value={x.reply} maxLength={2000} onChange={(e) => set({ ...c, commands: c.commands.map((y, j) => (j === i ? { ...y, reply: e.target.value } : y)) })} />
            <button type="button" onClick={() => set({ ...c, commands: c.commands.filter((_, j) => j !== i) })} aria-label="Remove" className="self-end sm:self-center"><Trash2 className="h-4 w-4 text-muted-foreground" /></button></div>
        ))}<button type="button" onClick={() => set({ ...c, commands: [...c.commands, { name: '', reply: '' }] })} className="inline-flex items-center gap-1 text-sm text-primary"><Plus className="h-4 w-4" />Add command</button></div>
      </div>
      <div>
        <p className="text-sm font-medium">Keyword replies</p>
        <div className="mt-2 space-y-2">{c.keywords.map((x, i) => (
          <div key={i} className="flex flex-col gap-2 sm:flex-row"><Input className="sm:w-40" placeholder="when someone says…" value={x.match} onChange={(e) => set({ ...c, keywords: c.keywords.map((y, j) => (j === i ? { ...y, match: e.target.value } : y)) })} />
            <Input placeholder="Reply" value={x.reply} maxLength={2000} onChange={(e) => set({ ...c, keywords: c.keywords.map((y, j) => (j === i ? { ...y, reply: e.target.value } : y)) })} />
            <button type="button" onClick={() => set({ ...c, keywords: c.keywords.filter((_, j) => j !== i) })} aria-label="Remove" className="self-end sm:self-center"><Trash2 className="h-4 w-4 text-muted-foreground" /></button></div>
        ))}<button type="button" onClick={() => set({ ...c, keywords: [...c.keywords, { match: '', reply: '' }] })} className="inline-flex items-center gap-1 text-sm text-primary"><Plus className="h-4 w-4" />Add keyword</button></div>
      </div>
      {!locked && <button type="button" onClick={save} className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">Save configuration</button>}
    </fieldset>
  );
}
