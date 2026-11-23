import { toast } from './ui.js';

const $ = selector => document.querySelector(selector);
let installPrompt;
let activeWorker;

function setStatus(message, state = '') {
  const node = $('[data-offline-status]');
  if (!node) return;
  node.textContent = message;
  node.dataset.state = state;
}

async function updateStorageEstimate() {
  const node = $('[data-storage-estimate]');
  if (!node || !navigator.storage?.estimate) return;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const mb = value => (value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0);
  node.textContent = `${mb(usage)} MB used of ${mb(quota)} MB available to this app.`;
}

function sendToWorker(message) {
  const worker = navigator.serviceWorker?.controller || activeWorker;
  if (!worker) {
    setStatus('Offline setup will be ready after the app finishes starting.');
    return false;
  }
  worker.postMessage(message);
  return true;
}

export function initOfflineLibrary() {
  const panel = $('[data-offline-panel]');
  if (!panel || !('serviceWorker' in navigator)) return;
  const download = $('[data-download-offline]');
  const remove = $('[data-remove-offline]');
  const install = $('[data-install-app]');
  const progress = $('[data-offline-progress]');
  download.disabled = true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    install.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    install.hidden = true;
    toast('Rongmei Hymnal installed');
  });
  install?.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null;
    install.hidden = true;
  });
  download?.addEventListener('click', async () => {
    download.disabled = true;
    progress.hidden = false;
    progress.value = 0;
    setStatus('Preparing the offline library…', 'working');
    try { await navigator.storage?.persist?.(); } catch { /* Persistence is optional. */ }
    if (!sendToWorker({ type: 'DOWNLOAD_LIBRARY' })) download.disabled = false;
  });
  remove?.addEventListener('click', () => sendToWorker({ type: 'CLEAR_DOWNLOADS' }));

  navigator.serviceWorker.addEventListener('message', event => {
    const data = event.data || {};
    if (data.type === 'OFFLINE_PROGRESS') {
      progress.max = data.total;
      progress.value = data.completed;
      setStatus(`Downloading app data… ${data.completed} of ${data.total}`, 'working');
    }
    if (data.type === 'OFFLINE_COMPLETE') {
      download.disabled = false;
      progress.hidden = true;
      remove.hidden = !data.completed;
      const errorMessage = data.error || (data.failed ? `Saved with ${data.failed} item(s) unavailable. Try again when connected.` : '');
      setStatus(errorMessage || `Offline library is ready: ${data.books} collections and ${data.songCount || 'all'} individual song records saved on this device.`, errorMessage ? 'warning' : 'ready');
      toast(data.failed ? 'Offline download partly completed' : 'Offline library downloaded');
      updateStorageEstimate();
    }
    if (data.type === 'OFFLINE_STATUS') {
      remove.hidden = !data.count;
      setStatus(data.downloaded ? `Offline library ready: ${data.books} collections, ${data.songCount || 'all'} songs and ${data.count} resources saved on this device.` : data.count ? `Offline download is incomplete (${data.count} of ${data.total} resources). Connect to the internet and download again.` : 'Download the complete collection once, then read individual songs without internet.', data.downloaded ? 'ready' : data.count ? 'warning' : '');
    }
    if (data.type === 'OFFLINE_CLEARED') {
      remove.hidden = true;
      setStatus('Downloaded library data removed. The basic app cache remains available.');
      toast('Offline download removed');
      updateStorageEstimate();
    }
  });
  navigator.serviceWorker.ready.then(registration => {
    activeWorker = registration.active;
    download.disabled = false;
    sendToWorker({ type: 'GET_OFFLINE_STATUS' });
    updateStorageEstimate();
  });
}
