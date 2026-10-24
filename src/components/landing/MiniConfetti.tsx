import { motion } from 'framer-motion';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

/** Small one-shot confetti burst for celebratory moments. */
export default function MiniConfetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const d = 60 + (i % 5) * 18;
        return (
          <motion.span key={i} className="absolute h-2 w-1.5 rounded-sm" style={{ background: COLORS[i % 4] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d + 40, opacity: 0, rotate: 360 }}
            transition={{ duration: 1.2, ease: 'easeOut' }} />
        );
      })}
    </div>
  );
}
