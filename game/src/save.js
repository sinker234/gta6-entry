// Neon Tides — localStorage save: money, story progress, best haul, mute.

const KEY = 'neon-tides-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || !data) return null;
    return {
      money: typeof data.money === 'number' ? data.money : 0,
      storyIndex: typeof data.storyIndex === 'number' ? data.storyIndex : 0,
      best: typeof data.best === 'number' ? data.best : 0,
      muted: !!data.muted,
    };
  } catch (e) {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {}
}
