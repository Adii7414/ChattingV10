import { AnimatePresence, motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { useRef, useState } from 'react';
import { Mic, MicOff, Video, PhoneOff, MonitorUp } from 'lucide-react';
import { Avatar } from '../ui';

const PEOPLE = [
  { n: 'You', h: 168 }, { n: 'Ava', h: 200 }, { n: 'Kai', h: 30 },
  { n: 'Noor', h: 330 }, { n: 'Theo', h: 100 }, { n: 'Jun', h: 260 },
];

/** Pinned section: participants join a group call one by one as you scroll. */
export default function CallScene() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [n, setN] = useState(1);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setN(Math.max(1, Math.min(PEOPLE.length, Math.ceil(v * PEOPLE.length + 0.2)))));
  const speaking = n > 1 ? (n - 1) % n : 0;

  return (
    <section id="calls" ref={ref} className="relative h-[300vh]">
      <div className="sticky top-0 flex min-h-[100svh] items-center px-5 py-20">
        <div className="mx-auto w-full max-w-5xl text-center">
          <p className="eyebrow">Voice & video</p>
          <h2 className="display mt-4 text-4xl sm:text-6xl">Jump on a call. <span className="text-muted-foreground">Everyone's here.</span></h2>
          <div className="glass mx-auto mt-12 max-w-3xl rounded-[32px] p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between text-sm"><span className="font-semibold">Weekend crew</span><span className="flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />{n} in call</span></div>
            <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <AnimatePresence>
                {PEOPLE.slice(0, n).map((p, i) => (
                  <motion.div key={p.n} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                    className={`relative grid aspect-video place-items-center rounded-2xl bg-secondary transition-shadow ${i === speaking ? 'ring-2 ring-primary' : ''}`}>
                    <Avatar name={p.n} hue={p.h} size={52} />
                    <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium">
                      {i % 3 === 2 ? <MicOff className="h-3 w-3 text-destructive" /> : <Mic className="h-3 w-3" />}{p.n}
                    </span>
                    {p.n === 'Kai' && <span className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium">Sharing screen</span>}
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
            <div className="mt-5 flex justify-center gap-3">
              {[Mic, Video, MonitorUp].map((I, k) => <span key={k} className="grid h-11 w-11 place-items-center rounded-full bg-secondary"><I className="h-4 w-4" /></span>)}
              <span className="grid h-11 w-11 place-items-center rounded-full bg-destructive text-destructive-foreground"><PhoneOff className="h-4 w-4" /></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
