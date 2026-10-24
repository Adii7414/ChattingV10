import { useEffect, useState } from 'react';

/** Small per-device stores for the marketplace (favourites, recently viewed, compare tray). */
function useStored(key: string, max: number) {
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || '[]') as string[]; } catch { return []; } };
  const [ids, setIds] = useState<string[]>(read);
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === key) setIds(read()); };
    window.addEventListener('market-store', on);
    return () => window.removeEventListener('market-store', on);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const write = (next: string[]) => { const v = next.slice(0, max); localStorage.setItem(key, JSON.stringify(v)); setIds(v); window.dispatchEvent(new CustomEvent('market-store', { detail: key })); };
  return { ids, write };
}

export function useFavourites() {
  const { ids, write } = useStored('market:favs', 200);
  return { favs: ids, isFav: (id: string) => ids.includes(id), toggle: (id: string) => write(ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids]) };
}
export function useRecent() {
  const { ids, write } = useStored('market:recent', 12);
  return { recent: ids, push: (id: string) => write([id, ...ids.filter((x) => x !== id)]), clear: () => write([]) };
}
export function useCompare() {
  const { ids, write } = useStored('market:compare', 3);
  return { compare: ids, inCompare: (id: string) => ids.includes(id), toggle: (id: string) => write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-3)), clear: () => write([]) };
}

export const PERM_INFO: Record<string, { risk: 0 | 1 | 2; text: string }> = {
  'Read Messages': { risk: 0, text: 'See messages in channels it can access' },
  'Send Messages': { risk: 0, text: 'Post messages and cards' },
  'Add Reactions': { risk: 0, text: 'React to messages' },
  'View Members': { risk: 0, text: 'See the member list' },
  'Manage Messages': { risk: 1, text: 'Delete or pin anyone’s messages' },
  'Manage Channels': { risk: 2, text: 'Create, edit and delete channels' },
  'Manage Roles': { risk: 2, text: 'Give and take roles from members' },
  'Moderate Members': { risk: 2, text: 'Time out, kick or ban members' },
};
export const riskOf = (perms: string[]) => Math.max(0, ...perms.map((p) => PERM_INFO[p]?.risk ?? 0)) as 0 | 1 | 2;
export const RISK_LABEL = ['Low access', 'Medium access', 'High access'] as const;
export const RISK_CLASS = ['bg-primary/10 text-primary', 'bg-amber-400/15 text-amber-600 dark:text-amber-300', 'bg-destructive/10 text-destructive'] as const;
export const isNew = (createdAt: string) => !!createdAt && Date.now() - new Date(createdAt).getTime() < 14 * 864e5;
export const listingUrl = (id: string) => `${window.location.origin}/app/bots/${id}`;
