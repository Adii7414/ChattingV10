import { motion, useScroll, useTransform, useMotionValueEvent, useReducedMotion } from 'framer-motion';
import { useRef, useState } from 'react';
import { Sun, Sunrise, Sunset, Moon } from 'lucide-react';
import { Avatar, Bubble } from '../ui';

const SCENES = [
  { Icon: Sunrise, time: '7:42 AM', label: 'Morning', title: 'Wake up to what matters.', msgs: [['Mum', 30, 'Morning love ☀️ call later?'], ['me', 0, 'Yes! After my run 🏃']] },
  { Icon: Sun, time: '1:15 PM', label: 'Afternoon', title: 'Get things done together.', msgs: [['Studio', 200, 'Kai: v3 of the deck is up'], ['me', 0, 'Looks great — shipping it 🚀']] },
  { Icon: Sunset, time: '6:58 PM', label: 'Evening', title: 'Make plans that happen.', msgs: [['Weekend crew', 330, 'Noor: tacos at 8?'], ['me', 0, 'Already booked a table 🌮']] },
  { Icon: Moon, time: '11:30 PM', label: 'Night', title: 'Wind down, quietly.', msgs: [['Ava', 260, 'Night night 🌙'], ['me', 0, 'Sleep well ✨']] },
] as const;

const SKIES = ['hsl(35 90% 60%)', 'hsl(200 80% 60%)', 'hsl(18 85% 58%)', 'hsl(235 60% 55%)'];

/** Pinned scroll story: a single day in Chatting, from sunrise to night. */
export default function DayStory() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [i, setI] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setI(Math.min(3, Math.floor(v * 4))));
  const sky = useTransform(scrollYProgress, [0, 0.33, 0.66, 1], SKIES);
  // Fade the tint in and out so it blends into the page instead of popping.
  const skyOpacity = useTransform(scrollYProgress, [0, 0.12, 0.88, 1], [0, 0.22, 0.22, 0]);
  const sunY = useTransform(scrollYProgress, [0, 0.4, 1], ['70%', '5%', '110%']);
  const s = SCENES[i];

  return (
    <section id="day" ref={ref} className="relative h-[280vh] sm:h-[400vh]">
      <div className="sticky top-0 flex min-h-[100svh] items-center overflow-hidden px-5 py-20">
        <motion.div aria-hidden className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" style={{ backgroundColor: sky, opacity: skyOpacity }} />
        <motion.div aria-hidden className="absolute right-[8%] opacity-50 h-24 w-24 sm:right-[12%] sm:h-40 sm:w-40 rounded-full bg-[radial-gradient(circle,hsl(45_100%_70%),transparent_70%)] blur-sm" style={{ top: reduce ? '10%' : sunY }} />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">A day in Chatting</p>
            <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p className="mt-6 flex items-center gap-2 font-mono text-sm text-muted-foreground"><s.Icon className="h-4 w-4" /> {s.time} · {s.label}</p>
              <h2 className="display mt-3 text-3xl sm:text-6xl">{s.title}</h2>
            </motion.div>
            <div className="mt-8 flex gap-1.5">{SCENES.map((x, k) => <span key={x.label} className={`h-1 rounded-full transition-all duration-500 ${k === i ? 'w-10 bg-foreground' : 'w-4 bg-foreground/20'}`} />)}</div>
          </div>
          <div className={`glass mx-auto w-full max-w-[420px] rounded-[32px] p-5 transition-colors duration-700`}>
            <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground"><span>{s.time}</span><span>Chatting</span></div>
            <motion.div key={i} className="space-y-3" initial="h" animate="v" variants={{ v: { transition: { staggerChildren: 0.25 } } }}>
              {s.msgs.map(([who, hue, text]) => (
                <motion.div key={text} variants={{ h: { opacity: 0, y: 14 }, v: { opacity: 1, y: 0 } }}>
                  {who === 'me' ? <Bubble me>{text}</Bubble> : (
                    <div className="flex items-end gap-2"><Avatar name={who} hue={hue} size={28} /><div><p className="mb-1 text-xs text-muted-foreground">{who}</p><Bubble className="max-w-full">{text}</Bubble></div></div>
                  )}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
