import { useEffect, useRef, useState } from 'react';
import { Pipette } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { cn } from '@project/components/lib/utils';

const SWATCHES = ['#60E4C5', '#22C55E', '#0EA5E9', '#3B82F6', '#8B5CF6', '#EC4899', '#F43F5E', '#F97316', '#EAB308', '#A3A3A3', '#FFFFFF', '#111111'];

type HSV = { h: number; s: number; v: number };
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
function hexToHsv(hex: string): HSV {
  const m = hex.replace('#', '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return { h: 160, s: 0.6, v: 0.9 };
  const full = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvToHex({ h, s, v }: HSV) {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Drag helper: reports the pointer position inside `el` as 0–1 fractions. */
function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const start = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    el.setPointerCapture(e.pointerId);
    const go = (ev: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); onMove(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height)); };
    go(e);
    const mv = (ev: PointerEvent) => go(ev);
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  };
  return { ref, onPointerDown: start };
}

/** Chatting's own colour picker — saturation/brightness pad, hue slider, swatches, hex and eyedropper. */
export function ColorPanel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [hex, setHex] = useState(value.toUpperCase());
  useEffect(() => { if (value.toUpperCase() !== hsvToHex(hsv)) { setHsv(hexToHsv(value)); setHex(value.toUpperCase()); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (n: HSV) => { setHsv(n); const h = hsvToHex(n); setHex(h); onChange(h); };
  const pad = useDrag((x, y) => commit({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag((x) => commit({ ...hsv, h: x * 360 }));
  const Eye = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
  return (
    <div className="w-60 space-y-3">
      <div {...pad} className="relative h-36 cursor-crosshair touch-none rounded-xl" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}>
        <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.3)]" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div {...hue} className="relative h-3 cursor-pointer touch-none rounded-full" style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}>
        <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
      </div>
      <div className="grid grid-cols-6 gap-1.5">{SWATCHES.map((s) => (
        <button key={s} type="button" aria-label={s} onClick={() => commit(hexToHsv(s))} className={cn('h-7 rounded-lg border border-border transition hover:scale-110', hex === s && 'ring-2 ring-primary ring-offset-1 ring-offset-popover')} style={{ background: s }} />
      ))}</div>
      <div className="flex items-center gap-2">
        <span className="h-8 w-8 shrink-0 rounded-lg border border-border" style={{ background: hex }} />
        <input value={hex} onChange={(e) => { const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`; setHex(v.toUpperCase()); if (/^#[0-9a-f]{6}$/i.test(v)) { setHsv(hexToHsv(v)); onChange(v.toUpperCase()); } }}
          maxLength={7} spellCheck={false} className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 font-mono text-xs uppercase outline-none focus:ring-1 focus:ring-ring" />
        {Eye && <button type="button" aria-label="Pick from screen" onClick={() => new Eye().open().then((r) => commit(hexToHsv(r.sRGBHex))).catch(() => {})} className="grid h-8 w-8 place-items-center rounded-lg border border-border"><Pipette className="h-3.5 w-3.5" /></button>}
      </div>
    </div>
  );
}

/** A swatch button that opens the picker. Pass `children` to use a custom trigger. */
export default function ColorPicker({ value, onChange, onCommit, className, children, label = 'Pick a colour' }: { value: string; onChange: (hex: string) => void; onCommit?: (hex: string) => void; className?: string; children?: React.ReactNode; label?: string }) {
  const latest = useRef(value);
  latest.current = value;
  return (
    <Popover onOpenChange={(o) => { if (!o) onCommit?.(latest.current); }}>
      <PopoverTrigger asChild>{children ?? <button type="button" aria-label={label} className={cn('h-10 w-12 shrink-0 rounded-lg border border-border shadow-inner', className)} style={{ background: value }} />}</PopoverTrigger>
      <PopoverContent className="w-auto rounded-2xl p-3" align="start"><ColorPanel value={value || '#60E4C5'} onChange={onChange} /></PopoverContent>
    </Popover>
  );
}
