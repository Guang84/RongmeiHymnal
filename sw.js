const APP_CACHE_PREFIX = 'glab-rongmei-hymnal-';
const CACHE = 'glab-rongmei-hymnal-shell-v26';
const DOWNLOAD_CACHE = 'glab-rongmei-hymnal-offline-v2';
const DATA_CACHE = 'glab-rongmei-hymnal-data-v1';
const LEGACY_CACHES = ['rongmei-songbooks-v25', 'rongmei-songbooks-downloads-v1'];
const INDEX_URL = './data/songbooks/index.json';
const SHELL = [
  './', './index.html', './book.html', './hymn.html', './404.html', './policy.html',
  './css/main.css', './js/app.js', './js/data.js', './js/search-core.js',
  './js/storage.js', './js/ui.js', './js/settings.js', './js/contact.js',
  './js/offline.js', INDEX_URL, './data/contact.json',
  './data/songbooks/buanthanhlu/metadata.json',
  './data/songbooks/hymdaihlu/metadata.json',
  './data/songbooks/ngai-luzaam/metadata.json',
  './data/songbooks/vbs-songs/metadata.json',
  './assets/Rongmei%20Gospel%20song%20books.png',
  './assets/buanthlu-cover.png', './assets/icons/icon.svg',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './manifest.webmanifest',
  'https://guang84.github.io/assets/brand/glab-mark-256.png'
];

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage(message));
}

async function availableResponse(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok) return response;
  } catch { /* Try a previously cached copy. */ }
  const cached = await caches.match(url, { ignoreSearch: true });
  if (cached) return cached;
  throw new Error('Required offline resource is unavailable: ' + url);
}

function validBookId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value);
}
function validSongPath(value) {
  return typeof value === 'string'
    && /^songs\/[a-z0-9][a-z0-9-]*\/song\.json$/i.test(value)
    && !value.split('/').includes('..');
}

async function registeredBookFiles() {
  const indexResponse = await availableResponse(new URL(INDEX_URL, self.registration.scope).href);
  const index = await indexResponse.json();
  if (index.schemaVersion !== '3.0' || !Array.isArray(index.books)
      || !index.dataSource?.baseUrl || !index.dataSource?.manifestUrl) {
    throw new Error('The app library configuration is invalid.');
  }

  const manifestResponse = await availableResponse(index.dataSource.manifestUrl);
  const manifest = await manifestResponse.json();
  if (manifest.schemaVersion !== '2.1' || !Array.isArray(manifest.collections)) {
    throw new Error('The external Schema 2.1 manifest is invalid.');
  }

  const files = [index.dataSource.manifestUrl];
  const refreshFiles = [index.dataSource.manifestUrl];
  let totalSongs = 0;

  for (const book of index.books) {
    if (!validBookId(book.id) || book.directory !== book.id) {
      throw new Error('Invalid songbook ID in the app library.');
    }
    const collection = manifest.collections.find(item => item.bookId === book.id);
    if (!collection || !Number.isInteger(collection.songCount)
        || !/^[a-z0-9-]+\/book\.json$/i.test(collection.path)) {
      throw new Error('Missing or invalid collection entry for ' + book.id);
    }

    const bookURL = new URL(collection.path, index.dataSource.baseUrl.replace(/\/+$/, '') + '/').href;
    const bookResponse = await availableResponse(bookURL);
    const bookData = await bookResponse.json();
    if (bookData.schemaVersion !== '2.1' || bookData.bookId !== book.id
        || !Array.isArray(bookData.songs) || bookData.songs.length !== collection.songCount) {
      throw new Error('Invalid song index for ' + book.id);
    }
    files.push(bookURL);
    refreshFiles.push(bookURL);
    totalSongs += bookData.songs.length;

    const presentationPath = './data/songbooks/' + book.id + '/' + (book.metadata || 'metadata.json');
    files.push(new URL(presentationPath, self.registration.scope).href);
    refreshFiles.push(new URL(presentationPath, self.registration.scope).href);

    const bookBase = new URL(book.id + '/', index.dataSource.baseUrl.replace(/\/+$/, '') + '/');
    for (const song of bookData.songs) {
      if (!song?.id || !Number.isInteger(song.number) || !validSongPath(song.path)) {
        throw new Error('Invalid song path in ' + book.id + ' index.');
      }
      files.push(new URL(song.path, bookBase).href);
    }

    const metadataResponse = await availableResponse(new URL(presentationPath, self.registration.scope).href);
    const metadata = await metadataResponse.json();
    for (const imagePath of [metadata.cover?.image, metadata.icon]) {
      if (typeof imagePath === 'string' && imagePath
          && !/^(?:[a-z]+:)?\/\//i.test(imagePath)) {
        const imageURL = new URL(imagePath.replace(/^\.?\//, ''), self.registration.scope).href;
        files.push(imageURL);
        refreshFiles.push(imageURL);
      } else if (typeof imagePath === 'string' && /^https:\/\//i.test(imagePath)) {
        files.push(imagePath);
        refreshFiles.push(imagePath);
      }
    }
  }

  if (totalSongs !== manifest.totalSongs) throw new Error('Manifest total does not match registered songbooks.');
  return {
    books: index.books.length,
    songCount: totalSongs,
    files: [...new Set(files)],
    refreshFiles: [...new Set(refreshFiles)]
  };
}

async function libraryFiles() {
  const registered = await registeredBookFiles();
  const shell = SHELL.map(file => new URL(file, self.registration.scope).href);
  return {
    books: registered.books,
    songCount: registered.songCount,
    files: [...new Set([...shell, ...registered.files])],
    refreshFiles: [...new Set([...shell, ...registered.refreshFiles])]
  };
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
  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      const index = cursor++;
      const url = files[index];
      try {
        const response = await availableResponse(url);
        await cache.put(url, response);
      } catch {
        failed.push(url);
      }
      completed += 1;
      source?.postMessage({ type: 'OFFLINE_PROGRESS', completed, total: files.length });
    }
  };
  await Promise.all(Array.from({ length: 8 }, () => worker()));
  const result = {
    type: 'OFFLINE_COMPLETE',
    books,
    completed,
    total: files.length,
    songCount: manifest.songCount,
    failed: failed.length
  };
  source?.postMessage(result);
  return result;
}

async function responsesDiffer(first, second) {
  if (!first) return true;
  const [a, b] = await Promise.all([first.arrayBuffer(), second.arrayBuffer()]);
  if (a.byteLength !== b.byteLength) return true;
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return true;
  }
  return false;
}

let refreshTask;
async function refreshLibrary(source) {
  if (refreshTask) return refreshTask;
  refreshTask = (async () => {
    try {
      const { refreshFiles } = await libraryFiles();
      const runtimeCache = await caches.open(CACHE);
      const downloadCache = await caches.open(DOWNLOAD_CACHE);
      const hasOfflineDownload = (await downloadCache.keys()).length > 0;
      let changed = false;
      let refreshed = 0;
      for (const url of refreshFiles) {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Update request failed: ' + response.status + ' ' + url);
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
  const keep = [CACHE, DOWNLOAD_CACHE, DATA_CACHE];
  const obsoleteOwnCaches = keys.filter(key =>
    (key.startsWith(APP_CACHE_PREFIX) && !keep.includes(key)) || LEGACY_CACHES.includes(key)
  );
  await Promise.all(obsoleteOwnCaches.map(key => caches.delete(key)));
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
      const { books, files, songCount } = await libraryFiles();
      const cache = await caches.open(DOWNLOAD_CACHE);
      const matches = await Promise.all(files.map(file => cache.match(file, { ignoreSearch: true })));
      const count = matches.filter(Boolean).length;
      event.source?.postMessage({
        type: 'OFFLINE_STATUS', books, songCount,
        downloaded: count === files.length, count, total: files.length
      });
    } catch (error) {
      event.source?.postMessage({ type: 'OFFLINE_STATUS', downloaded: false, count: 0, total: 0, error: error.message });
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
        if (!response.ok) throw new Error('Data request failed: ' + response.status);
        await (await caches.open(CACHE)).put(event.request, response.clone());
        return response;
      }
      const cached = await caches.match(event.request, { ignoreSearch });
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') {
        await (await caches.open(CACHE)).put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(event.request, { ignoreSearch });
      if (cached) return cached;
      if (event.request.mode === 'navigate') return (await caches.match('./404.html')) || Response.error();
      await notifyClients({ type: 'NETWORK_ERROR', url: requestURL.pathname });
      return new Response('This item is unavailable offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
