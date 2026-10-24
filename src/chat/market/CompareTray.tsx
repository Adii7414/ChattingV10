import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { BOT_PERMS } from '../../lib/bots';
import { RISK_LABEL, riskOf, useCompare } from '../../lib/marketLocal';
import { BotAvatar } from '../BotMessage';
import type { Listing } from './BotCard';

/** Floating tray + side-by-side comparison of up to 3 bots. */
export default function CompareTray({ pool, open, setOpen }: { pool: Listing[]; open: boolean; setOpen: (o: boolean) => void }) {
  const { compare, toggle, clear } = useCompare();
  const navigate = useNavigate();
  const items = compare.map((id) => pool.find((l) => l.id === id)).filter(Boolean) as Listing[];
  if (!items.length) return null;
  const rows: [string, (l: Listing) => React.ReactNode][] = [
    ['Category', (l) => l.category], ['Rating', (l) => (l.rating != null ? `${l.rating}★ (${l.ratingCount})` : '—')], ['Servers', (l) => l.installs],
    ['Verified', (l) => (l.verified ? '✓' : '—')], ['Access level', (l) => RISK_LABEL[riskOf(l.permissions)]], ['Commands', (l) => l.commands.length], ['Version', (l) => `v${l.version}`],
    ...BOT_PERMS.map((p) => [p, (l: Listing) => (l.permissions.includes(p) ? '✓' : '')] as [string, (l: Listing) => React.ReactNode]),
  ];
  return (
    <>
      <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card p-2 pl-3 shadow-xl">
        {items.map((l) => <span key={l.id} className="relative"><BotAvatar name={l.name} avatar={l.avatar} size={32} /><button onClick={() => toggle(l.id)} aria-label="Remove" className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-foreground text-background"><X className="h-3 w-3" /></button></span>)}
        <button onClick={() => setOpen(true)} disabled={items.length < 2} className="h-9 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Compare {items.length}</button>
        <button onClick={clear} className="h-9 rounded-full px-3 text-sm text-muted-foreground">Clear</button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Compare bots</DialogTitle></DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead><tr><th />{items.map((l) => <th key={l.id} className="p-2"><button onClick={() => { setOpen(false); navigate(`/app/bots/${l.id}`); }} className="flex flex-col items-center gap-1"><BotAvatar name={l.name} avatar={l.avatar} size={40} /><span className="font-semibold">{l.name}</span></button></th>)}</tr></thead>
              <tbody>{rows.map(([k, f]) => <tr key={k} className="border-t border-border"><td className="py-2 pr-3 text-muted-foreground">{k}</td>{items.map((l) => <td key={l.id} className="py-2 text-center">{f(l)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
