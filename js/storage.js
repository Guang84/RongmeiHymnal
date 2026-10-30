const KEYS = {
  favorites: 'rongmei-songbooks:favorites',
  history: 'rongmei-songbooks:history',
  settings: 'rongmei-songbooks:settings'
};

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function getFavorites() {
  return read(KEYS.favorites, [])
}
export function toggleFavorite(id) {
  const values = getFavorites();
  const next = values.includes(id) ? values.filter(value => value !== id) : [...values, id];
  write(KEYS.favorites, next);
  return next.includes(id)
}
export function getHistory() {
  return read(KEYS.history, [])
}
export function addHistory(id) {
  write(KEYS.history, [id, ...getHistory().filter(value => value !== id)].slice(0, 10))
}
export function getSettings() {
  const settings = {
    ...{
      font: 21,
      spacing: 'normal',
      width: 'normal',
      // A songbook should open like a page, regardless of the device theme.
      theme: 'light',
      tone: 'forest'
    },
    ...read(KEYS.settings, {})
  };
  // Preserve older settings without allowing a device theme to override reading mode.
  if (settings.theme === 'system') settings.theme = 'light';
  return settings
}
export function saveSettings(settings) {
  write(KEYS.settings, settings)
}
