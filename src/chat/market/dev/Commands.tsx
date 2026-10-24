import { useState } from 'react';
import { GripVertical, Plus, Trash2, Upload } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { PageHead, Panel, savePart, useApps, type Listing } from './kit';

type Cmd = { name: string; description: string };

export default function Commands({ l }: { l: Listing }) {
  const { reload } = useApps();
  const [cmds, setCmds] = useState<Cmd[]>(l.commands);
  const [bulk, setBulk] = useState('');
  const [try_, setTry] = useState('/');
  const names = cmds.map((c) => c.name);
  const dupes = new Set(names.filter((n, i) => n && names.indexOf(n) !== i));
  const bad = cmds.some((c) => !/^[a-z0-9_-]{1,32}$/.test(c.name)) || dupes.size > 0;
  const dirty = JSON.stringify(cmds) !== JSON.stringify(l.commands);
  const set = (i: number, p: Partial<Cmd>) => setCmds(cmds.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= cmds.length) return; const x = [...cmds]; [x[i], x[j]] = [x[j], x[i]]; setCmds(x); };
  const importBulk = () => { const add = bulk.split('\n').map((r) => r.trim().replace(/^\//, '')).filter(Boolean).map((r) => { const [n, ...d] = r.split(/\s+[-–—:]\s+|\s+/); return { name: n.toLowerCase().slice(0, 32), description: d.join(' ').slice(0, 120) }; }); setCmds([...cmds, ...add].slice(0, 40)); setBulk(''); };
  const save = async () => { if (await savePart(l, { commands: cmds }, 'Commands saved')) reload(); };
  const q = try_.replace(/^\//, '').toLowerCase();
  const matches = cmds.filter((c) => c.name.startsWith(q)).slice(0, 6);
  return (
    <>
      <PageHead title="Commands" desc="Slash commands shown on your listing and in the composer preview. Your code handles them via MESSAGE_CREATE.">
        <button onClick={save} disabled={!dirty || bad} className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save changes</button>
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Panel title={`${cmds.length}/40 commands`} right={<button onClick={() => setCmds([...cmds, { name: '', description: '' }])} disabled={cmds.length >= 40} className="inline-flex items-center gap-1 text-sm text-primary"><Plus className="h-4 w-4" />Add</button>}>
          <div className="space-y-2">{cmds.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col"><button onClick={() => move(i, -1)} aria-label="Up" className="text-muted-foreground"><GripVertical className="h-3 w-3" /></button></div>
              <div className="flex w-40 items-center rounded-md border border-input px-2"><span className="text-muted-foreground">/</span><input value={c.name} onChange={(e) => set(i, { name: e.target.value.toLowerCase().replace(/\s/g, '').slice(0, 32) })} placeholder="help" className={`h-9 w-full bg-transparent font-mono text-sm outline-none ${dupes.has(c.name) || (c.name && !/^[a-z0-9_-]+$/.test(c.name)) ? 'text-destructive' : ''}`} /></div>
              <Input value={c.description} maxLength={120} placeholder="What it does" onChange={(e) => set(i, { description: e.target.value })} />
              <button onClick={() => setCmds(cmds.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
            </div>
          ))}{!cmds.length && <p className="text-sm text-muted-foreground">No commands yet.</p>}</div>
          {bad && <p className="mt-3 text-xs text-destructive">Names must be unique, lowercase letters, numbers, - or _.</p>}
        </Panel>
        <div className="space-y-6">
          <Panel title="Preview" desc="How the command picker looks to members.">
            <input value={try_} onChange={(e) => setTry(e.target.value.startsWith('/') ? e.target.value : `/${e.target.value}`)} className="h-9 w-full rounded-lg bg-secondary px-3 font-mono text-sm outline-none" />
            <div className="mt-2 overflow-hidden rounded-lg border border-border">{matches.map((c) => <div key={c.name} className="border-b border-border px-3 py-2 last:border-0"><p className="font-mono text-sm">/{c.name}</p><p className="text-xs text-muted-foreground">{c.description || '—'} · {l.name}</p></div>)}{!matches.length && <p className="p-3 text-xs text-muted-foreground">No match</p>}</div>
          </Panel>
          <Panel title="Bulk import" desc="One per line: /name - description">
            <Textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'/ping - Check I’m alive\n/roll - Roll a dice'} className="font-mono text-xs" />
            <button onClick={importBulk} disabled={!bulk.trim()} className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs disabled:opacity-50"><Upload className="h-3 w-3" />Import</button>
          </Panel>
        </div>
      </div>
    </>
  );
}
