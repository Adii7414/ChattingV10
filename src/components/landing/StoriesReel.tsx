import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { Eye } from 'lucide-react';
import { Avatar } from '../ui';

const STORIES = [
  { n: 'Ava', h: 200, t: 'Lisbon sunsets hit different', bg: 'from-accent/80 to-chart-3/60', e: '🌅' },
  { n: 'Kai', h: 30, t: 'New studio, who dis', bg: 'from-primary/70 to-chart-4/60', e: '🎛️' },
  { n: 'Noor', h: 330, t: 'Sunday pancakes ritual', bg: 'from-chart-3/80 to-accent/50', e: '🥞' },
  { n: 'Theo', h: 100, t: '10k done. Legs: gone.', bg: 'from-chart-4/70 to-primary/50', e: '🏃' },
  { n: 'Jun', h: 160, t: 'Film roll #12 is back', bg: 'from-foreground/70 to-chart-5/60', e: '🎞️' },
  { n: 'Rae', h: 260, t: 'Gig tonight, come thru', bg: 'from-accent/70 to-primary/60', e: '🎸' },
];

/** Scroll-jacked horizontal carousel of story cards. */
export default function StoriesReel() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], ['0%', '-62%']);

  return (
    <section id="stories" ref={ref} className="relative h-[300vh]">
      <div className="sticky top-0 flex min-h-[100svh] flex-col justify-center overflow-hidden py-20">
        <div className="mx-auto w-full max-w-6xl px-5">
          <p className="eyebrow">Stories</p>
          <h2 className="display mt-4 text-4xl sm:text-6xl">Moments that <span className="text-muted-foreground">fade in 24 hours.</span></h2>
        </div>
        <motion.div style={{ x }} className="mt-12 flex gap-5 pl-[max(1.25rem,calc((100vw-72rem)/2))]">
          {STORIES.map((s, i) => (
            <motion.div key={s.n} whileHover={{ y: -8, rotate: i % 2 ? 1.5 : -1.5 }}
              className={`relative flex aspect-[9/16] w-[220px] shrink-0 flex-col justify-between overflow-hidden rounded-[28px] bg-gradient-to-br p-4 text-white shadow-xl sm:w-[260px] ${s.bg}`}>
              <div className="flex gap-1">{[0, 1, 2].map((k) => <span key={k} className={`h-0.5 flex-1 rounded-full ${k === 0 ? 'bg-white' : 'bg-white/40'}`} />)}</div>
              <div className="flex items-center gap-2"><Avatar name={s.n} hue={s.h} size={30} /><span className="text-sm font-semibold drop-shadow">{s.n}</span><span className="text-xs opacity-80">{i + 1}h</span></div>
              <span className="self-center text-7xl drop-shadow-lg">{s.e}</span>
              <div><p className="text-lg font-semibold leading-tight drop-shadow">{s.t}</p><p className="mt-2 flex items-center gap-1 text-xs opacity-80"><Eye className="h-3 w-3" /> Seen by {12 + i * 7}</p></div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
