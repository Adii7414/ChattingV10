import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Bot, Gift, BarChart3, MessageSquareReply } from 'lucide-react';
import { Avatar } from '../ui';
import Confetti from './MiniConfetti';

const TABS = [['poll', BarChart3, 'Poll'], ['giveaway', Gift, 'Giveaway'], ['quick', MessageSquareReply, 'Quick replies']] as const;
type Tab = (typeof TABS)[number][0];

function Poll() {
  const [votes, setVotes] = useState({ Tacos: 4, Sushi: 3, Pizza: 2 });
  const [mine, setMine] = useState<string | null>(null);
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  return (
    <div><p className="font-semibold">🍽️ Where are we eating Friday?</p>
      <div className="mt-3 space-y-2">{Object.entries(votes).map(([k, v]) => (
        <button key={k} disabled={!!mine} onClick={() => { setMine(k); setVotes((x) => ({ ...x, [k]: v + 1 })); }} className={`relative block w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition ${mine === k ? 'border-primary' : 'border-border hover:border-foreground/30'}`}>
          {mine && <motion.span initial={{ width: 0 }} animate={{ width: `${(v / total) * 100}%` }} className="absolute inset-y-0 left-0 bg-primary/15" />}
          <span className="relative flex justify-between"><span>{k}</span>{mine && <span className="font-mono text-xs">{Math.round((v / total) * 100)}%</span>}</span>
        </button>))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{mine ? `You voted ${mine} · ${total} votes` : 'Tap an option to vote'}</p>
    </div>
  );
}

function Giveaway() {
  const [state, setState] = useState<'open' | 'in' | 'won'>('open');
  return (
    <div className="relative"><p className="font-semibold">🎁 Giveaway: Concert tickets for two</p>
      <p className="mt-1 text-sm text-muted-foreground">{state === 'won' ? 'Ended' : 'Ends in 2 hours'} · {state === 'open' ? 37 : 38} entries</p>
      {state === 'won' && <><Confetti /><p className="mt-3 text-sm font-semibold text-primary">🎉 And the winner is… you!</p></>}
      <button onClick={() => setState(state === 'open' ? 'in' : 'won')} disabled={state === 'won'} className="mt-3 h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition active:scale-95 disabled:opacity-50">
        {state === 'open' ? '🎉 Enter giveaway' : state === 'in' ? "You're in! Draw winner" : 'Winner drawn'}</button>
    </div>
  );
}

function Quick() {
  const [pick, setPick] = useState<string | null>(null);
  const replies = { 'Show me the rules': '📜 Be kind, no spam, keep it on-topic. Have fun!', 'Pick a role': '🎨 Done! You now have the Artist role.', 'Say hi': '👋 Hi back! Glad you\'re here.' };
  return (
    <div><p className="font-semibold">Welcome to Trail Club! What would you like to do?</p>
      <div className="mt-3 flex flex-wrap gap-2">{Object.keys(replies).map((k) => <button key={k} onClick={() => setPick(k)} className={`rounded-full border px-3 py-1.5 text-sm transition ${pick === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-foreground/30'}`}>{k}</button>)}</div>
      <AnimatePresence mode="wait">{pick && <motion.p key={pick} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 text-sm">{replies[pick as keyof typeof replies]}</motion.p>}</AnimatePresence>
    </div>
  );
}

/** Clickable sample bot message showing polls, giveaways and quick replies. */
export default function BotPlayground() {
  const [tab, setTab] = useState<Tab>('poll');
  return (
    <section id="bots" className="section-y px-5">
      <div className="mx-auto max-w-3xl text-center">
        <p className="eyebrow">Bots</p>
        <h2 className="display mt-4 text-4xl sm:text-6xl">Bots that <span className="text-muted-foreground">actually help.</span></h2>
        <div className="mt-10 inline-flex gap-1 rounded-full bg-secondary p-1">{TABS.map(([id, I, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${tab === id ? 'text-background' : 'text-muted-foreground'}`}>
            {tab === id && <motion.span layoutId="bot-tab" className="absolute inset-0 rounded-full bg-foreground" />}<I className="relative h-4 w-4" /><span className="relative">{l}</span></button>))}
        </div>
        <div className="glass mx-auto mt-8 max-w-lg rounded-[28px] p-5 text-left">
          <div className="flex gap-3"><Avatar name="Helper" hue={168} size={36} />
            <div className="min-w-0 flex-1"><p className="mb-2 flex items-center gap-2 text-sm font-semibold">Helper <span className="flex items-center gap-1 rounded bg-primary/15 px-1.5 text-[10px] font-semibold text-primary"><Bot className="h-3 w-3" />BOT</span></p>
              <AnimatePresence mode="wait"><motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-2xl border-l-4 border-primary bg-secondary/60 p-4">
                {tab === 'poll' ? <Poll /> : tab === 'giveaway' ? <Giveaway /> : <Quick />}
              </motion.div></AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
