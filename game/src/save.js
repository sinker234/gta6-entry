// localStorage save: money, story progress and lifetime stats.
import { STORAGE_KEY } from './config.js';

export function defaultSave() {
  return { money: 120, storyIndex: 0, storyDone: false, stats: { missions: 0, fares: 0, deliveries: 0, races: 0, busted: 0, wasted: 0, earned: 0 } };
}
export function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const base = defaultSave();
    return { ...base, ...parsed, stats: { ...base.stats, ...(parsed.stats ?? {}) } };
  } catch { return null; }
}
export function hasSave() { try { return localStorage.getItem(STORAGE_KEY) !== null; } catch { return false; } }
export function writeSave(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* private mode */ } }
export function clearSave() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
