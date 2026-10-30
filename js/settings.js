import {
  getSettings,
  saveSettings
} from './storage.js';
import './contact.js';
import {
  $
} from './ui.js';
let settings = getSettings();

function apply() {
  document.body.classList.toggle('dark', settings.theme === 'dark');
  document.documentElement.style.setProperty('--reader-size', `${settings.font}px`);
  document.documentElement.style.setProperty('--ui-font-size', `${(16 * Math.min(32, Math.max(16, settings.font)) / 18).toFixed(2)}px`);
  document.documentElement.dataset.spacing = settings.spacing;
  document.documentElement.dataset.width = settings.width;
  document.documentElement.dataset.tone = settings.tone;
  const output = $('[data-font-output]');
  if (output) output.textContent = `${settings.font}px`;
  for (const [selector, key] of [
      ['[data-font-setting]', 'font'],
      ['[data-spacing-setting]', 'spacing'],
      ['[data-width-setting]', 'width'],
      ['[data-theme-setting]', 'theme'],
      ['[data-tone-setting]', 'tone']
    ]) {
    const node = $(selector);
    if (node) node.value = settings[key]
  }
}
export function initSettings() {
  apply();
  const dialog = $('[data-settings-dialog]');
  document.querySelectorAll('[data-open-settings]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
  for (const [selector, key] of [
      ['[data-font-setting]', 'font'],
      ['[data-spacing-setting]', 'spacing'],
      ['[data-width-setting]', 'width'],
      ['[data-theme-setting]', 'theme'],
      ['[data-tone-setting]', 'tone']
    ]) {
    const node = $(selector);
    if (node) node.addEventListener('input', () => {
      settings = {
        ...settings,
        [key]: key === 'font' ? Number(node.value) : node.value
      };
      saveSettings(settings);
      apply()
    })
  }
  document.querySelectorAll('[data-font-step]').forEach(button => button.addEventListener('click', () => {
    settings = { ...settings, font: Math.min(32, Math.max(16, settings.font + Number(button.dataset.fontStep || 0))) };
    saveSettings(settings);
    apply();
  }));
  document.querySelectorAll('[data-font-reset]').forEach(button => button.addEventListener('click', () => {
    settings = { ...settings, font: 21 };
    saveSettings(settings);
    apply();
  }));
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
    settings = {
      ...settings,
      theme: document.body.classList.contains('dark') ? 'light' : 'dark'
    };
    saveSettings(settings);
    apply()
  }))
}
