import { useEffect, useState } from 'react';
import { readStored, writeStored } from '@/lib/safe-storage';

/** Private, on-device preferences: saved homes, recently viewed, seasonal toggle. Nothing is sent to ENKOP. */
const EVT = 'enkop-personal';
function read(key: string): string[] {
  try { const v = JSON.parse(readStored(key) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
}
function write(key: string, v: string[]) { writeStored(key, JSON.stringify(v)); window.dispatchEvent(new Event(EVT)); }

function useList(key: string) {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => { const sync = () => setList(read(key)); sync(); window.addEventListener(EVT, sync); window.addEventListener('storage', sync); return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync); }; }, [key]);
  return list;
}

export function useSaved() {
  const saved = useList('enkop:saved');
  const toggle = (slug: string) => { const cur = read('enkop:saved'); write('enkop:saved', cur.includes(slug) ? cur.filter(s => s !== slug) : [slug, ...cur]); };
  return { saved, isSaved: (slug: string) => saved.includes(slug), toggle };
}

export function useRecent() { return useList('enkop:recent'); }
export function recordView(slug: string) { write('enkop:recent', [slug, ...read('enkop:recent').filter(s => s !== slug)].slice(0, 8)); }
export function resetPersonal() { ['enkop:saved', 'enkop:recent'].forEach(k => writeStored(k, null)); window.dispatchEvent(new Event(EVT)); }
