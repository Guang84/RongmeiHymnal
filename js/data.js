import { matchesSearch, normalizeSearch } from './search-core.js';

const LIBRARY_URL = 'data/songbooks/index.json';
const DATA_CACHE = 'glab-rongmei-hymnal-data-v1';

let library = null;
let activeBook = null;
let records = [];
let searchIndex = [];
const songCache = new Map();
const songRequests = new Map();

const normalize = normalizeSearch;
const safeId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value);
const safeSongPath = value => typeof value === 'string'
  && /^songs\/[a-z0-9][a-z0-9-]*\/song\.json$/i.test(value)
  && !value.split('/').includes('..');

async function fetchJSON(url, label) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
    if (response.ok && typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(DATA_CACHE);
        await cache.put(url, response.clone());
      } catch { /* Browser storage may be unavailable or full. */ }
    }
  } catch {
    if (typeof caches !== 'undefined') {
      try { response = await caches.match(url, { ignoreSearch: true }); } catch { /* Cache unavailable. */ }
    }
  }
  if (!response?.ok && typeof caches !== 'undefined') {
    try {
      const cached = await caches.match(url, { ignoreSearch: true });
      if (cached) response = cached;
    } catch { /* Keep the network error. */ }
  }
  if (!response?.ok) throw new Error(label + ' (' + (response?.status || 'offline') + ')');
  return response.json();
}

function dataURL(root, path) {
  return new URL(path.split('/').map(encodeURIComponent).join('/'), root.replace(/\/+$/, '') + '/').href;
}

function cleanLyricLine(value) {
  return String(value ?? '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/\u0092/g, '’')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/g, '');
}

function hasLines(lines) {
  return Array.isArray(lines) && lines.some(line => typeof line === 'string' && line.trim());
}

function titleForLanguage(titles, preferred) {
  if (titles?.[preferred]) return titles[preferred];
  const first = Object.values(titles || {}).find(value => typeof value === 'string' && value.trim());
  return first || '';
}

function songSummary(entry, book) {
  const titles = entry.titles || {};
  return {
    id: entry.id,
    number: entry.number,
    path: entry.path,
    titles,
    bookId: book.id,
    title: titleForLanguage(titles, book.defaultLanguage),
    titleRongmei: titles.rongmei || '',
    titleEnglish: titles.english || '',
    sourceNumber: entry.number
  };
}

function songSearchText(song) {
  return normalize([
    song.number, song.title, song.titleRongmei, song.titleEnglish,
    song.sourceNumber, ...(song.search?.keywords || [])
  ].join(' '));
}

async function loadBookMetadata(entry, index, manifest) {
  const presentation = await fetchJSON(
    'data/songbooks/' + encodeURIComponent(entry.directory) + '/' + encodeURIComponent(entry.metadata || 'metadata.json'),
    'presentation metadata for ' + entry.id
  );
  validateBookMetadata(presentation, entry);

  const collection = manifest.collections.find(item => item.bookId === entry.id);
  if (!collection || collection.songCount !== presentation.songs?.count && Number.isInteger(presentation.songs?.count)) {
    throw new Error('manifest and presentation metadata disagree for ' + entry.id);
  }
  const sourceBookURL = dataURL(index.dataSource.baseUrl, collection.path);
  const sourceIndex = await fetchJSON(sourceBookURL, 'song index for ' + entry.id);
  validateBookIndex(sourceIndex, entry, collection);

  const book = {
    ...entry,
    ...presentation,
    bookIndex: sourceIndex,
    sourceBookURL,
    sourceBaseURL: dataURL(index.dataSource.baseUrl, entry.id),
    coverImage: presentation.cover?.image || '',
    coverImageAlt: presentation.cover?.alt || 'Cover of ' + presentation.title,
    iconImage: presentation.icon || '',
    songCount: sourceIndex.songCount,
    updatedAt: sourceIndex.updatedAt,
    contentVersion: sourceIndex.contentVersion,
    defaultLanguage: sourceIndex.defaultLanguage
  };
  book.songRecords = sourceIndex.songs.map(song => songSummary(song, book));
  return book;
}

export async function loadLibrary() {
  if (library) return library;
  const index = await fetchJSON(LIBRARY_URL, 'songbook library');
  validateLibrary(index);
  const manifest = await fetchJSON(index.dataSource.manifestUrl, 'songbook data manifest');
  validateManifest(manifest, index);
  const books = await Promise.all(index.books.map(entry => loadBookMetadata(entry, index, manifest)));
  library = { ...index, books, manifest };
  return library;
}

export async function loadBook(bookId) {
  const currentLibrary = await loadLibrary();
  const selected = currentLibrary.books.find(book => book.id === bookId) || currentLibrary.books[0];
  if (!selected) throw new Error('no songbooks configured');
  activeBook = selected;
  records = selected.songRecords.slice().sort((a, b) => a.number - b.number);
  searchIndex = records.map(song => ({ song, searchableText: songSearchText(song) }));
  return records;
}

export async function loadSong(songOrNumber, language) {
  const descriptor = typeof songOrNumber === 'object'
    ? songOrNumber
    : records.find(item => item.number === Number(songOrNumber));
  if (!descriptor) throw new Error('song not found in the selected songbook');
  const book = getBooks().find(item => item.id === descriptor.bookId) || activeBook;
  if (!book || !safeSongPath(descriptor.path)) throw new Error('invalid song source path');
  const url = dataURL(book.sourceBaseURL, descriptor.path);
  const cacheKey = book.id + ':' + descriptor.id;
  let raw = songCache.get(cacheKey);
  if (!raw) {
    let request = songRequests.get(cacheKey);
    if (!request) {
      request = fetchJSON(url, 'song ' + descriptor.number + ' from ' + book.title)
        .then(data => {
          validateSongDocument(data, book, descriptor);
          songCache.set(cacheKey, data.song);
          return data.song;
        })
        .finally(() => songRequests.delete(cacheKey));
      songRequests.set(cacheKey, request);
    }
    raw = await request;
  }
  return normalizeSongRecord(raw, book, language);
}

function normalizeSongRecord(raw, book, requestedLanguage) {
  const languages = raw.languages || {};
  const availableLanguages = Object.keys(languages);
  const preferred = requestedLanguage && languages[requestedLanguage]
    ? requestedLanguage
    : (languages[book.defaultLanguage] ? book.defaultLanguage : availableLanguages[0]);
  const languageRecord = languages[preferred] || {};
  const details = raw.details || {};
  const source = raw.source || {};
  const editorial = raw.editorial || { status: 'not_reviewed', notes: [] };
  const rights = raw.rights || { status: 'unknown', languageRights: {} };
  const titles = Object.fromEntries(Object.entries(languages).map(([key, value]) => [key, value?.title || '']));
  const content = languageRecord.content || { format: 'source-lines', lines: [] };
  const note = Array.isArray(editorial.notes) ? editorial.notes.filter(Boolean).join(' ') : '';
  return {
    ...raw,
    id: raw.id,
    number: raw.number,
    title: languageRecord.title || titleForLanguage(titles, preferred) || 'Untitled song',
    titleRongmei: titles.rongmei || '',
    titleEnglish: titles.english || '',
    language: preferred,
    availableLanguages: availableLanguages.map(key => ({
      id: key,
      title: languages[key]?.title || key,
      contentStatus: languages[key]?.contentStatus || 'unknown'
    })),
    source,
    sourceBook: source.sourceBook || book.title,
    sourceNumber: source.printedNumber ?? raw.number,
    author: details.author,
    composer: details.composer,
    translator: languageRecord.credits?.translator,
    editor: languageRecord.credits?.editor,
    arranger: details.arranger,
    chord: details.chord,
    key: details.key,
    beat: details.beat,
    meter: details.meter,
    tune: details.tune,
    content,
    contentStatus: languageRecord.contentStatus || (content ? 'available' : 'title_only'),
    editorial,
    verification: {
      status: editorial.status || 'not_reviewed',
      note
    },
    rights,
    search: raw.search || { keywords: [] }
  };
}

export function validateLibrary(data) {
  if (!data || data.schemaVersion !== '3.0' || !Array.isArray(data.books) || !data.books.length
      || !data.dataSource?.baseUrl || !data.dataSource?.manifestUrl) {
    throw new Error('invalid library configuration');
  }
  const ids = new Set();
  data.books.forEach(entry => {
    if (!entry || !safeId(entry.id) || !safeId(entry.directory) || entry.id !== entry.directory
        || typeof entry.metadata !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.json$/i.test(entry.metadata)
        || ids.has(entry.id)) throw new Error('invalid or duplicate songbook entry');
    ids.add(entry.id);
  });
}

export function validateManifest(manifest, index) {
  if (!manifest || manifest.schemaVersion !== '2.1' || !Array.isArray(manifest.collections)
      || manifest.collections.length !== index.books.length) throw new Error('invalid external songbook manifest');
  const ids = new Set();
  manifest.collections.forEach(collection => {
    if (!safeId(collection.bookId) || ids.has(collection.bookId)
        || !Number.isInteger(collection.songCount) || collection.songCount < 1
        || typeof collection.path !== 'string' || !/^[a-z0-9-]+\/book\.json$/i.test(collection.path)) {
      throw new Error('invalid collection entry in external manifest');
    }
    ids.add(collection.bookId);
  });
  if (manifest.totalSongs !== manifest.collections.reduce((sum, item) => sum + item.songCount, 0)) {
    throw new Error('external manifest song total is inconsistent');
  }
  if (index.books.some(book => !ids.has(book.id))) throw new Error('a configured songbook is missing from the external manifest');
}

export function validateBookMetadata(data, entry) {
  if (!data || data.schemaVersion !== '1.0' || data.id !== entry.id || data.name !== entry.id
      || !data.title || !data.intro?.summary || !data.credits) {
    throw new Error('invalid presentation metadata for ' + entry.id);
  }
}

export function validateBookIndex(data, entry, collection) {
  if (!data || data.schemaVersion !== '2.1' || data.bookId !== entry.id
      || typeof data.contentVersion !== 'string' || !data.title
      || !safeId(data.defaultLanguage) || !Array.isArray(data.songs)
      || data.songCount !== collection.songCount || data.songs.length !== collection.songCount) {
    throw new Error('invalid Schema 2.1 book index for ' + entry.id);
  }
  const ids = new Set();
  const numbers = new Set();
  data.songs.forEach(song => {
    if (!song || typeof song.id !== 'string' || !song.id.trim() || ids.has(song.id)
        || !Number.isInteger(song.number) || song.number < 1 || numbers.has(song.number)
        || !safeSongPath(song.path) || !song.titles || !Object.keys(song.titles).length) {
      throw new Error('invalid or duplicate song index entry in ' + entry.id);
    }
    ids.add(song.id);
    numbers.add(song.number);
  });
}

export function validateSongDocument(data, book, descriptor) {
  const song = data?.song;
  if (!data || data.schemaVersion !== '2.1' || data.bookId !== book.id
      || data.contentVersion !== book.contentVersion || !song
      || song.id !== descriptor.id || song.number !== descriptor.number
      || !song.languages || typeof song.languages !== 'object') {
    throw new Error('invalid Schema 2.1 song document for ' + book.id + ' #' + descriptor.number);
  }
  const languages = Object.values(song.languages);
  if (!languages.length || !languages.some(item => item?.contentStatus === 'available'
      && (hasLines(item.content?.lines) || Array.isArray(item.content?.sections)))) {
    throw new Error('song has no available lyric content: ' + descriptor.id);
  }
  languages.forEach(item => {
    if (item.contentStatus === 'title_only' && item.content !== null) {
      throw new Error('title-only language must not contain lyrics: ' + descriptor.id);
    }
    if (item.content && item.content.format === 'source-lines' && !Array.isArray(item.content.lines)) {
      throw new Error('invalid source-lines content: ' + descriptor.id);
    }
    if (item.content && item.content.format === 'structured'
        && (!Array.isArray(item.content.sections) || !item.content.sections.length)) {
      throw new Error('invalid structured content: ' + descriptor.id);
    }
  });
}

function groupLegacyLines(lines) {
  const groups = [];
  let group = [];
  lines.forEach(line => {
    if (String(line).trim()) group.push(String(line));
    else if (group.length) {
      groups.push(group);
      group = [];
    }
  });
  if (group.length) groups.push(group);
  return groups;
}

/** Render Schema 2.1 source-lines exactly; only legacy content uses display cleanup. */
export function getSongSections(song) {
  const content = song?.content;
  if (content?.format === 'source-lines' && Array.isArray(content.lines)) {
    return [{ type: 'source-lines', label: '', lines: content.lines.map(line => String(line ?? '')) }];
  }
  if (content?.format === 'structured' && Array.isArray(content.sections)) {
    return content.sections.map((section, index) => ({
      type: section.type || 'verse',
      label: section.label || (section.type === 'verse' ? 'Verse ' + (index + 1) : ''),
      repeatOf: section.repeatOf || null,
      lines: (section.lines || []).map(line => String(line ?? ''))
    }));
  }
  const sections = content?.sections;
  if (Array.isArray(sections) && sections.some(section => hasLines(section?.lines))) {
    return sections.filter(section => hasLines(section?.lines)).map(section => ({
      type: section.type || 'verse',
      label: section.label || '',
      lines: section.lines.map(cleanLyricLine)
    }));
  }
  const rawLines = (content?.lines || []).map(cleanLyricLine);
  return groupLegacyLines(rawLines).map((lines, index) => ({
    type: 'verse',
    label: 'Verse ' + (index + 1),
    lines
  }));
}

export const getLibrary = () => library;
export const getBooks = () => library?.books || [];
export const getActiveBook = () => activeBook;
export const getAllHymns = () => records;
export const getHymnByNumber = number => records.find(song => song.number === Number(number));
export const getHymnById = id => records.find(song => song.id === id);
export const getPreviousHymn = song => records[records.findIndex(item => item.id === song.id) - 1];
export const getNextHymn = song => records[records.findIndex(item => item.id === song.id) + 1];
export const getRecordKey = song => (song.bookId || activeBook?.id || 'unknown') + ':' + song.id;
export const buildBookURL = book => 'book.html?book=' + encodeURIComponent(book.id);
export const buildHymnURL = (song, book = activeBook) => 'hymn.html?book='
  + encodeURIComponent(book?.id || song.bookId || '') + '&number=' + encodeURIComponent(song.number);

export function searchHymns(query) {
  const needle = normalize(query);
  if (!needle) return [];
  return searchIndex.filter(item => matchesSearch(needle, item.searchableText)).map(item => item.song);
}

/** Catalogue search uses the lightweight book indexes; lyric files are fetched only when opened. */
export async function searchAcrossBooks(query) {
  const needle = normalize(query);
  if (!needle) return { results: [], searchedBooks: 0, failedBooks: [] };
  const books = getBooks();
  const results = books.flatMap(book => book.songRecords
    .filter(song => matchesSearch(needle, songSearchText(song)))
    .map(song => ({ book, song })));
  return { results, searchedBooks: books.length, failedBooks: [] };
}

export function getHymnsAlphabetically() {
  const titleForSort = song => song.titleRongmei || song.title || song.titleEnglish || '';
  return records.slice().sort((a, b) => titleForSort(a).localeCompare(titleForSort(b), undefined, {
    sensitivity: 'base', numeric: true
  }) || a.number - b.number);
}
