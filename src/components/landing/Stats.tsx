import { animate, motion, useInView, useScroll, useVelocity, useTransform, useSpring, useAnimationFrame, useMotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

const STATS = [
  { v: 0, suffix: '', l: 'Ads, ever' },
  { v: 24, suffix: 'h', l: 'Stories, then gone' },
  { v: 6, suffix: '', l: 'Ready-made bot types' },
  { v: 100, suffix: '%', l: 'Free to start' },
];

function Count({ to, suffix }: { to: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => { if (inView) { const c = animate(0, to, { duration: 1.6, ease: [0.22, 1, 0.36, 1], onUpdate: (x) => setN(Math.round(x)) }); return () => c.stop(); } }, [inView, to]);
  return <span ref={ref}>{n}{suffix}</span>;
}

/** Count-up stat band. */
export function StatsBand() {
  return (
    <section className="border-y border-border px-5 py-16">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 text-center md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.l}><p className="display text-5xl text-primary sm:text-6xl"><Count to={s.v} suffix={s.suffix} /></p><p className="mt-2 text-sm text-muted-foreground">{s.l}</p></div>
        ))}
      </div>
    </section>
  );
}

const ROW_A = ['Voice notes', 'GIFs', 'Polls', 'Threads', 'Reactions', 'Stories', 'Read receipts', 'Scheduled sends', 'Disappearing messages', 'Stickers'];
const ROW_B = ['Communities', 'Bots', 'Video calls', 'Screen share', 'Encryption', 'Custom themes', 'Folders', 'Saved messages', 'Translate', 'Message search'];

function Row({ items, dir }: { items: string[]; dir: 1 | -1 }) {
  const base = useMotionValue(0);
  const { scrollY } = useScroll();
  const vel = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const boost = useTransform(vel, [-2000, 0, 2000], [5, 0, 5], { clamp: false });
  useAnimationFrame((_, delta) => {
    const step = dir * (delta / 1000) * (2 + Math.abs(boost.get()));
    base.set((((base.get() + step) % 50) + 50) % 50);
  });
  const x = useTransform(base, (v) => `${-v}%`);
  return (
    <div className="flex overflow-hidden">
      <motion.div style={{ x }} className="flex shrink-0 gap-3 pr-3">
        {[...items, ...items].map((t, i) => <span key={i} className="whitespace-nowrap rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium">{t}</span>)}
      </motion.div>
    </div>
  );
}

/** Two infinite rows of feature chips that speed up as you scroll. */
export function FeatureMarquee() {
  return (
    <section className="space-y-3 py-16 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
      <Row items={ROW_A} dir={1} />
      <Row items={ROW_B} dir={-1} />
    </section>
  );
}
