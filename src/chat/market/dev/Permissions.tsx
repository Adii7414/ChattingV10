import { useState } from 'react';
import { Checkbox } from '@project/components/ui/checkbox';
import { BOT_PERMS } from '../../../lib/bots';
import { PERM_INFO, RISK_CLASS, RISK_LABEL, riskOf } from '../../../lib/marketLocal';
import { CopyRow, PageHead, Panel, savePart, useApps, type Listing } from './kit';

type Perm = (typeof BOT_PERMS)[number];
const OPS_FOR: Record<string, string[]> = {
  'Read Messages': ['messages.list', 'messages.get', 'messages.search', 'reactions.list'], 'Send Messages': ['messages.send', 'giveaways.create', 'reminders.create'],
  'Add Reactions': ['reactions.add'], 'Manage Messages': ['messages.delete (others)', 'messages.pin', 'messages.bulkDelete'], 'Manage Roles': ['roles.add', 'roles.remove', 'roles.create', 'roles.update', 'roles.delete'],
  'Moderate Members': ['members.timeout', 'members.kick', 'members.ban', 'members.warn', 'members.setNickname'], 'Manage Channels': ['channels.rename', 'channels.setTopic', 'channels.setSlowmode'], 'View Members': ['members.list', 'members.get', 'roles.members'],
};

export default function Permissions({ l }: { l: Listing }) {
  const { reload } = useApps();
  const [p, setP] = useState<Perm[]>(l.permissions as Perm[]);
  const mask = BOT_PERMS.reduce((m, x, i) => (p.includes(x) ? m | (1 << i) : m), 0);
  const risk = riskOf(p);
  const dirty = [...p].sort().join() !== [...l.permissions].sort().join();
  const save = async () => { if (await savePart(l, { permissions: p }, 'Permissions saved')) reload(); };
  return (
    <>
      <PageHead title="Permissions" desc="Ask only for what your bot needs — owners see this list before adding it, and fewer permissions means more installs.">
        <button onClick={save} disabled={!dirty} className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save changes</button>
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Panel title="Permissions calculator">
          <div className="grid gap-2 sm:grid-cols-2">{BOT_PERMS.map((x) => (
            <label key={x} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${p.includes(x) ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <Checkbox checked={p.includes(x)} onCheckedChange={(v) => setP(v ? [...p, x] : p.filter((y) => y !== x))} className="mt-0.5" />
              <span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-medium">{x}<span className={`rounded-full px-1.5 text-[10px] ${RISK_CLASS[PERM_INFO[x]?.risk ?? 0]}`}>{['low', 'medium', 'high'][PERM_INFO[x]?.risk ?? 0]}</span></span>
                <span className="block text-xs text-muted-foreground">{PERM_INFO[x]?.text}</span>
                <span className="mt-1 block font-mono text-[10px] text-muted-foreground">{OPS_FOR[x]?.join(' · ')}</span></span>
            </label>
          ))}</div>
        </Panel>
        <div className="space-y-6">
          <Panel title="Summary">
            <p className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${RISK_CLASS[risk]}`}>{RISK_LABEL[risk]}</p>
            <div className="mt-3 h-2 rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(p.length / BOT_PERMS.length) * 100}%` }} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{p.length} of {BOT_PERMS.length} permissions</p>
            <div className="mt-4"><CopyRow label="Permission integer" value={String(mask)} /></div>
          </Panel>
          <Panel title="Quick presets"><div className="flex flex-wrap gap-1.5 text-xs">{([['Read-only', ['Read Messages', 'View Members']], ['Chat bot', ['Read Messages', 'Send Messages', 'Add Reactions']], ['Moderator', ['Read Messages', 'Send Messages', 'Manage Messages', 'Moderate Members']], ['Everything', [...BOT_PERMS]]] as [string, Perm[]][]).map(([t, v]) => <button key={t} onClick={() => setP(v)} className="rounded-full border border-border px-2.5 py-1">{t}</button>)}</div></Panel>
        </div>
      </div>
    </>
  );
}
