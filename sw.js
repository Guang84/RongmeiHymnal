const CACHE = 'rongmei-songbooks-v24';
const DOWNLOAD_CACHE = 'rongmei-songbooks-downloads-v1';
const SHELL = ['./', './index.html', './book.html', './hymn.html', './404.html', './policy.html', './css/main.css', './js/app.js', './js/data.js', './js/storage.js', './js/ui.js', './js/settings.js', './js/contact.js', './js/offline.js', './data/songbooks/index.json', './data/contact.json', './data/songbooks/ngai-luzaam/metadata.json', './data/songbooks/ngai-luzaam/songs.json', './assets/Rongmei%20Gospel%20song%20books.png', './assets/buanthlu-cover.png', './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png', './manifest.webmanifest'];

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage(message));
}

async function availableResponse(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok) return response;
  } catch { /* Use a previously saved response below. */ }
  const cached = await caches.match(url, { ignoreSearch: true });
  if (cached) return cached;
  throw new Error(`Required offline resource is unavailable: ${url}`);
}

async function registeredBookFiles() {
  const response = await availableResponse('./data/songbooks/index.json');
  const index = await response.json();
  const books = Array.isArray(index.books) ? index.books.filter(book => /^[a-z0-9][a-z0-9-]*$/i.test(book?.directory || '')) : [];
  if (!books.length) throw new Error('No valid songbooks were found in the library index.');
  const resources = await Promise.all(books.map(async book => {
    const metadata = `./data/songbooks/${book.directory}/${book.metadata || 'metadata.json'}`;
    const metadataResponse = await availableResponse(metadata);
    const data = await metadataResponse.json();
    const songFile = data.songs?.file;
    const localSong = !data.songs?.url && typeof songFile === 'string' && /^[a-z0-9][a-z0-9._-]*\.json$/i.test(songFile) ? `./data/songbooks/${book.directory}/${songFile}` : null;
    const remoteSong = typeof data.songs?.url === 'string' && /^https?:\/\//i.test(data.songs.url) ? data.songs.url + (data.songs.url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(data.songs.updatedAt || 'latest') : null;
    const cover = typeof data.cover?.image === 'string' && !/^(?:[a-z]+:)?\/\//i.test(data.cover.image) ? `./${data.cover.image.replace(/^\.?\//, '')}` : null;
    const icon = typeof data.icon === 'string' && !/^(?:[a-z]+:)?\/\//i.test(data.icon) ? `./${data.icon.replace(/^\.?\//, '')}` : null;
    if (!localSong && !data.songs?.url) throw new Error(`No downloadable song data was found for ${book.directory}.`);
    return [metadata, localSong || remoteSong, cover, icon].filter(Boolean);
  }));
  return { books: books.length, files: resources.flat() };
}

async function libraryFiles() {
  const registered = await registeredBookFiles();
  const files = [...new Set([...SHELL, ...registered.files].map(file => new URL(file, self.registration.scope).href))];
  return { books: registered.books, files };
}

async function downloadLibrary(source) {
  let manifest;
  try {
    manifest = await libraryFiles();
  } catch (error) {
    const result = { type: 'OFFLINE_COMPLETE', completed: 0, total: 0, failed: 1, error: error.message };
    source?.postMessage(result);
    return result;
  }
  const { books, files } = manifest;
  const cache = await caches.open(DOWNLOAD_CACHE);
  let completed = 0;
  const failed = [];
  for (const url of files) {
    try {
      const response = await availableResponse(url);
      await cache.put(url, response);
    } catch {
      failed.push(url);
    }
    completed += 1;
    source?.postMessage({ type: 'OFFLINE_PROGRESS', completed, total: files.length });
  }
  const result = { type: 'OFFLINE_COMPLETE', books, completed, total: files.length, failed: failed.length };
  source?.postMessage(result);
  return result;
}

async function responsesDiffer(first, second) {
  if (!first) return true;
  const [a, b] = await Promise.all([first.arrayBuffer(), second.arrayBuffer()]);
  if (a.byteLength !== b.byteLength) return true;
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return true;
  }
  return false;
}

let refreshTask;
async function refreshLibrary(source) {
  if (refreshTask) return refreshTask;
  refreshTask = (async () => {
    try {
      const { files } = await libraryFiles();
      const runtimeCache = await caches.open(CACHE);
      const downloadCache = await caches.open(DOWNLOAD_CACHE);
      const hasOfflineDownload = (await downloadCache.keys()).length > 0;
      let changed = false;
      let refreshed = 0;
      for (const url of files.filter(file => new URL(file).pathname.includes('/data/') || /\.(?:png|svg|webp|jpe?g)$/i.test(new URL(file).pathname))) {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Update request failed: ${response.status} ${url}`);
        const existing = await caches.match(url, { ignoreSearch: true });
        if (await responsesDiffer(existing, response.clone())) changed = true;
        await runtimeCache.put(url, response.clone());
        if (hasOfflineDownload) await downloadCache.put(url, response.clone());
        refreshed += 1;
      }
      source?.postMessage({ type: 'LIBRARY_REFRESHED', changed, refreshed });
      if (changed) await notifyClients({ type: 'LIBRARY_UPDATED' });
      return { changed, refreshed };
    } catch (error) {
      source?.postMessage({ type: 'LIBRARY_REFRESH_FAILED', message: error.message });
      return { changed: false, refreshed: 0 };
    } finally {
      refreshTask = null;
    }
  })();
  return refreshTask;
}

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const results = await Promise.allSettled(SHELL.map(url => cache.add(url)));
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length) await notifyClients({ type: 'CACHE_WARNING', count: failed.length });
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key !== CACHE && key !== DOWNLOAD_CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'DOWNLOAD_LIBRARY') event.waitUntil(downloadLibrary(event.source));
  if (event.data?.type === 'REFRESH_LIBRARY') event.waitUntil(refreshLibrary(event.source));
  if (event.data?.type === 'CLEAR_DOWNLOADS') event.waitUntil(caches.delete(DOWNLOAD_CACHE).then(() => {
    event.source?.postMessage({ type: 'OFFLINE_CLEARED' });
  }));
  if (event.data?.type === 'GET_OFFLINE_STATUS') event.waitUntil((async () => {
    try {
      const { books, files } = await libraryFiles();
      const cache = await caches.open(DOWNLOAD_CACHE);
      const matches = await Promise.all(files.map(file => cache.match(file, { ignoreSearch: true })));
      const count = matches.filter(Boolean).length;
      event.source?.postMessage({ type: 'OFFLINE_STATUS', books, downloaded: count === files.length, count, total: files.length });
    } catch {
      event.source?.postMessage({ type: 'OFFLINE_STATUS', downloaded: false, count: 0, total: 0 });
    }
  })());
});
self.addEventListener('fetch', event => {
  const requestURL = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestURL.origin !== location.origin) return;
  const isData = requestURL.pathname.includes('/data/');
  const ignoreSearch = isData || event.request.mode === 'navigate';
  event.respondWith((async () => {
    try {
      if (isData) {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
        await (await caches.open(CACHE)).put(event.request, response.clone());
        return response;
      }
      const cached = await caches.match(event.request, { ignoreSearch });
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') await (await caches.open(CACHE)).put(event.request, response.clone());
      return response;
    } catch (error) {
      const cached = await caches.match(event.request, { ignoreSearch });
      if (cached) return cached;
      if (event.request.mode === 'navigate') return (await caches.match('./404.html')) || Response.error();
      await notifyClients({ type: 'NETWORK_ERROR', url: requestURL.pathname });
      return new Response('This item is unavailable offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
