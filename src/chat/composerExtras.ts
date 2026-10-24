export const SHORTCODES: Record<string, string> = {
  smile: '😄', grin: '😁', joy: '😂', rofl: '🤣', wink: '😉', blush: '😊', heart_eyes: '😍', kiss: '😘', thinking: '🤔', neutral: '😐',
  eyeroll: '🙄', sleepy: '😴', cool: '😎', cry: '😢', sob: '😭', angry: '😠', scream: '😱', party: '🥳', skull: '💀', clown: '🤡',
  heart: '❤️', fire: '🔥', thumbsup: '👍', '+1': '👍', thumbsdown: '👎', clap: '👏', pray: '🙏', wave: '👋', muscle: '💪', eyes: '👀',
  tada: '🎉', star: '⭐', sparkles: '✨', check: '✅', x: '❌', warning: '⚠️', rocket: '🚀', '100': '💯', ok: '👌', shrug: '🤷',
  coffee: '☕', tea: '🍵', beer: '🍺', wine: '🍷', burger: '🍔', taco: '🌮', sushi: '🍣', donut: '🍩', icecream: '🍦', apple: '🍎',
  soccer: '⚽', basketball: '🏀', trophy: '🏆', medal: '🥇', game: '🎮', music: '🎵', guitar: '🎸', art: '🎨', book: '📚', bulb: '💡',
  money: '💰', gift: '🎁', balloon: '🎈', crown: '👑', gem: '💎', zap: '⚡', snow: '❄️', flower: '🌸', tree: '🌳', earth: '🌍',
  salute: '🫡', melt: '🫠', hug: '🤗', nerd: '🤓', facepalm: '🤦', mindblown: '🤯', sweat: '😅', upside: '🙃', hearthands: '🫶', handshake: '🤝',
  coffee2: '☕', pizza: '🍕', cake: '🎂', sun: '☀️', moon: '🌙', rainbow: '🌈', poop: '💩', ghost: '👻', robot: '🤖', cat: '🐱', dog: '🐶',
};

export const SLASH: { cmd: string; desc: string; run: (rest: string) => string; confetti?: boolean }[] = [
  { cmd: '/shrug', desc: 'Append ¯\\_(ツ)_/¯', run: (r) => `${r} ¯\\_(ツ)_/¯`.trim() },
  { cmd: '/tableflip', desc: '(╯°□°)╯︵ ┻━┻', run: (r) => `${r} (╯°□°)╯︵ ┻━┻`.trim() },
  { cmd: '/unflip', desc: '┬─┬ノ( º _ ºノ)', run: (r) => `${r} ┬─┬ノ( º _ ºノ)`.trim() },
  { cmd: '/lenny', desc: '( ͡° ͜ʖ ͡°)', run: (r) => `${r} ( ͡° ͜ʖ ͡°)`.trim() },
  { cmd: '/confetti', desc: 'Send with a confetti burst 🎉', run: (r) => r || '🎉', confetti: true },
  { cmd: '/spoiler', desc: 'Hide text until tapped', run: (r) => `||${r || 'spoiler'}||` },
  { cmd: '/code', desc: 'Send as a code block', run: (r) => `\`\`\`\n${r}\n\`\`\`` },
  { cmd: '/roll', desc: 'Roll a die (e.g. /roll 20)', run: (r) => { const n = Math.max(2, Math.min(1000, parseInt(r) || 6)); return `🎲 rolled ${1 + Math.floor(Math.random() * n)} (d${n})`; } },
  { cmd: '/flip', desc: 'Flip a coin', run: () => `🪙 ${Math.random() < 0.5 ? 'Heads' : 'Tails'}!` },
  { cmd: '/8ball', desc: 'Ask the magic 8-ball', run: (r) => `🎱 ${r ? `“${r}” — ` : ''}${EIGHT[Math.floor(Math.random() * EIGHT.length)]}` },
  { cmd: '/pick', desc: 'Pick one: /pick pizza, tacos, sushi', run: (r) => { const o = r.split(',').map((x) => x.trim()).filter(Boolean); return o.length ? `🤔 I pick… **${o[Math.floor(Math.random() * o.length)]}**` : '🤔 Give me some options!'; } },
  { cmd: '/mock', desc: 'sPoNgEbOb TeXt', run: (r) => r.split('').map((ch, i) => (i % 2 ? ch.toUpperCase() : ch.toLowerCase())).join('') },
  { cmd: '/reverse', desc: 'Send text backwards', run: (r) => [...r].reverse().join('') },
  { cmd: '/time', desc: 'Share your local time', run: (r) => `🕒 It’s ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} for me ${r}`.trim() },
  { cmd: '/me', desc: 'Describe an action in italics', run: (r) => `_${r || 'waves'}_` },
  { cmd: '/calc', desc: 'Calculate: /calc (12+8)*3', run: calc },
  { cmd: '/rps', desc: 'Rock, paper, scissors: /rps rock', run: rps },
  { cmd: '/hug', desc: 'Send a hug 🤗', run: (r) => `🤗 *hugs ${r || 'everyone'}*` },
  { cmd: '/highfive', desc: 'High five ✋', run: (r) => `✋ High five${r ? `, ${r}` : ''}!` },
  { cmd: '/countdown', desc: 'Days until a date: /countdown 2026-12-25', run: countdown },
  { cmd: '/random', desc: 'Random number: /random 1-100', run: (r) => { const [a, b] = (r.match(/-?\d+/g) ?? ['1', '100']).map(Number); const lo = Math.min(a, b ?? 100), hi = Math.max(a, b ?? 100); return `🔢 ${lo + Math.floor(Math.random() * (hi - lo + 1))} (${lo}–${hi})`; } },
  { cmd: '/clap', desc: 'Add 👏 between 👏 words', run: (r) => r.split(/\s+/).filter(Boolean).join(' 👏 ') + ' 👏' },
  { cmd: '/emojify', desc: 'Turn words into emoji where possible', run: (r) => r.split(/(\s+)/).map((w) => SHORTCODES[w.toLowerCase()] ?? w).join('') },
  { cmd: '/binary', desc: 'Encode text as binary', run: (r) => [...r].map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ') },
  { cmd: '/quote', desc: 'Share an inspiring quote', run: () => `💬 ${QUOTES[Math.floor(Math.random() * QUOTES.length)]}` },
  { cmd: '/password', desc: 'Generate a strong password (spoilered)', run: (r) => { const n = Math.max(8, Math.min(64, parseInt(r) || 16)); const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'; const a = crypto.getRandomValues(new Uint32Array(n)); return `🔐 ||${Array.from(a, (x) => cs[x % cs.length]).join('')}||`; } },
  { cmd: '/upper', desc: 'SEND IN CAPS', run: (r) => r.toUpperCase() },
  { cmd: '/lower', desc: 'send in lowercase', run: (r) => r.toLowerCase() },
  { cmd: '/sparkle', desc: '✨ Make it sparkle ✨', run: (r) => `✨ ${r || 'sparkle'} ✨` },
  { cmd: '/color', desc: 'Share a colour: /color #60E4C5', run: (r) => { const m = /#?([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(r); return m ? `🎨 \`#${m[1].toUpperCase()}\`` : '🎨 Give me a hex colour, e.g. /color #60E4C5'; } },
];

const QUOTES = ['“The best way out is always through.” — Robert Frost', '“Simplicity is the ultimate sophistication.” — Leonardo da Vinci', '“Stay hungry, stay foolish.” — Stewart Brand', '“What we think, we become.” — Buddha', '“Done is better than perfect.” — Sheryl Sandberg', '“Be kind, for everyone you meet is fighting a hard battle.” — Ian Maclaren'];

function calc(r: string) {
  const expr = r.replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**');
  if (!expr.trim() || !/^[\d\s+\-*/().%]+$/.test(expr)) return '🧮 Try something like /calc (12+8)*3';
  try {
    // Only digits and operators reach here, so evaluating is safe.
    const v = Function(`"use strict";return (${expr})`)() as number;
    return Number.isFinite(v) ? `🧮 ${r.trim()} = **${Math.round(v * 1e8) / 1e8}**` : '🧮 That doesn’t compute.';
  } catch { return '🧮 That doesn’t compute.'; }
}
function rps(r: string) {
  const opts = ['rock', 'paper', 'scissors'] as const; const em = { rock: '🪨', paper: '📄', scissors: '✂️' };
  const me = opts.find((o) => r.toLowerCase().startsWith(o[0])) ?? opts[Math.floor(Math.random() * 3)];
  const bot = opts[Math.floor(Math.random() * 3)];
  const res = me === bot ? 'Draw!' : (opts.indexOf(me) - opts.indexOf(bot) + 3) % 3 === 1 ? 'I win! 🏆' : 'I lose 😅';
  return `${em[me]} vs ${em[bot]} — ${res}`;
}
function countdown(r: string) {
  const d = new Date(r.trim());
  if (!r.trim() || isNaN(d.getTime())) return '🗓️ Give me a date, e.g. /countdown 2026-12-25';
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const label = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return days > 0 ? `🗓️ ${days} day${days === 1 ? '' : 's'} until ${label}` : days === 0 ? `🎉 ${label} is today!` : `🗓️ ${label} was ${-days} day${days === -1 ? '' : 's'} ago`;
}

const EIGHT = ['It is certain.', 'Without a doubt.', 'Yes, definitely.', 'Most likely.', 'Ask again later.', 'Cannot predict now.', 'Don’t count on it.', 'My sources say no.', 'Very doubtful.', 'Signs point to yes.'];

export function applySlash(body: string) {
  const m = /^(\/\w+)\s*([\s\S]*)$/.exec(body);
  const c = m && SLASH.find((s) => s.cmd === m[1].toLowerCase());
  if (!c || !m) return { body, confetti: false };
  return { body: c.run(m[2].trim()), confetti: !!c.confetti };
}

export const STICKERS: { name: string; items: string[] }[] = [
  { name: 'Moods', items: ['😂', '🥹', '😍', '🥳', '😎', '🤯', '😭', '😴', '🤔', '🙃', '😤', '🫠'] },
  { name: 'Love', items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '💖', '💘', '😘', '🥰', '🫶', '💌'] },
  { name: 'Animals', items: ['🐶', '🐱', '🦊', '🐼', '🐨', '🦁', '🐸', '🐵', '🦄', '🐙', '🦖', '🐧'] },
  { name: 'Food', items: ['🍕', '🍔', '🌮', '🍣', '🍜', '🍩', '🍪', '🧁', '🍦', '🍓', '🥑', '☕'] },
  { name: 'Sports & play', items: ['⚽', '🏀', '🏈', '🎾', '🏓', '🎮', '🎯', '🎳', '🏆', '🥇', '🛹', '🎲'] },
  { name: 'Hype', items: ['🔥', '🎉', '💯', '🚀', '👏', '🙌', '✨', '🏆', '⚡', '🤝', '💪', '👀'] },
];

export function confetti() { window.dispatchEvent(new Event('chat:confetti')); }
