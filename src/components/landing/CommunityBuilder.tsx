import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { useRef, useState } from 'react';
import { Hash, Volume2, Bot, Crown, Shield, Megaphone } from 'lucide-react';

const STEPS = [
  { t: 'Start a community.', d: 'Give it a name, an emoji and a vibe.' },
  { t: 'Add channels.', d: 'Text for chatting, voice for hanging out.' },
  { t: 'Hand out roles.', d: 'Owners, mods and members — each with their own powers.' },
  { t: 'Invite the bots.', d: 'Welcome new faces, run giveaways, keep things tidy.' },
];
const CHANNELS = [[Megaphone, 'announcements'], [Hash, 'general'], [Hash, 'photos'], [Volume2, 'Lounge']] as const;
const ROLES = [[Crown, 'Owner', 'text-accent'], [Shield, 'Moderator', 'text-primary'], [null, 'Member', 'text-muted-foreground']] as const;
const BOTS = ['Welcome', 'Giveaway', 'Moderator'];

const pop = { initial: { opacity: 0, x: -12, scale: 0.95 }, animate: { opacity: 1, x: 0, scale: 1 }, transition: { type: 'spring' as const, stiffness: 300, damping: 26 } };

/** Pinned section: a community sidebar that assembles itself as you scroll. */
export default function CommunityBuilder() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [n, setN] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setN(Math.min(3, Math.floor(v * 4))));

  return (
    <section id="communities" ref={ref} className="relative h-[400vh]">
      <div className="sticky top-0 flex min-h-[100svh] items-center px-5 py-20">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="eyebrow">Communities</p>
            <h2 className="display mt-4 text-4xl sm:text-6xl">Build a home for <span className="text-muted-foreground">your people.</span></h2>
            <ol className="mt-10 space-y-5">
              {STEPS.map((s, i) => (
                <li key={s.t} className={`flex gap-4 transition-opacity duration-500 ${i <= n ? 'opacity-100' : 'opacity-30'}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors ${i <= n ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>{i + 1}</span>
                  <div><p className="font-semibold">{s.t}</p><p className="text-sm text-muted-foreground">{s.d}</p></div>
                </li>
              ))}
            </ol>
          </div>
          <div className="glass mx-auto min-h-[460px] w-full max-w-[340px] rounded-[28px] p-4">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-2xl">🏔️</span>
              <div><p className="font-semibold">Trail Club</p><p className="text-xs text-muted-foreground">{[1, 12, 148, 1204][n]} members</p></div>
            </div>
            {n >= 1 && <Group label="Channels">{CHANNELS.map(([I, c], k) => <motion.div key={c} {...pop} transition={{ ...pop.transition, delay: k * 0.08 }} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground"><I className="h-4 w-4" />{c}</motion.div>)}</Group>}
            {n >= 2 && <Group label="Roles">{ROLES.map(([I, r, c], k) => <motion.div key={r} {...pop} transition={{ ...pop.transition, delay: k * 0.08 }} className={`flex items-center gap-2 px-2 py-1.5 text-sm font-medium ${c}`}>{I ? <I className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full bg-secondary" />}{r}</motion.div>)}</Group>}
            {n >= 3 && <Group label="Bots">{BOTS.map((b, k) => <motion.div key={b} {...pop} transition={{ ...pop.transition, delay: k * 0.08 }} className="flex items-center gap-2 px-2 py-1.5 text-sm"><span className="grid h-6 w-6 place-items-center rounded-md bg-primary/15 text-primary"><Bot className="h-3.5 w-3.5" /></span>{b}<span className="ml-auto rounded bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">BOT</span></motion.div>)}</Group>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mt-4"><p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>{children}</div>;
}
