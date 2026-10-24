// Shared (frontend + backend) constants for the bot marketplace.
export const BOT_CATEGORIES = ['Moderation', 'Fun', 'Music', 'Utility', 'Games', 'Social', 'Productivity', 'Economy', 'Other'] as const;
export type BotCategory = (typeof BOT_CATEGORIES)[number];

export const CATEGORY_EMOJI: Record<string, string> = {
  Moderation: '🛡️', Fun: '🎉', Music: '🎵', Utility: '🧰', Games: '🎮', Social: '💬', Productivity: '📈', Economy: '💰', Other: '✨',
};

export const MARKET_SORTS = ['popular', 'top', 'new', 'verified'] as const;

/** What a verified bot must meet before it can apply. */
export const VERIFY_RULES = [
  { key: 'installs', label: 'Installed in at least 3 communities', min: 3 },
  { key: 'description', label: 'Description of 80+ characters' },
  { key: 'events', label: 'An events URL is set' },
  { key: 'privacy', label: 'A privacy policy link is set' },
  { key: 'commands', label: 'At least one command is documented' },
] as const;
