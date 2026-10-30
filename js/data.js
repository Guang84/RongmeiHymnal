import { matchesSearch, normalizeSearch } from './search-core.js';

const LIBRARY_URL = 'data/songbooks/index.json';

let library = null;
let activeBook = null;
let records = [];
let searchIndex = [];
const bookSongCache = new Map();
const bookSongRequests = new Map();

const normalize = normalizeSearch;
const safeDirectory = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value);
const safeFile = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*\.json$/i.test(value);
const localBookURL = (book, file) => `data/songbooks/${encodeURIComponent(book.directory)}/${encodeURIComponent(file)}`;

async function fetchJSON(url, label) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
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

function cleanLyricLine(value) {
  let line = String(value ?? '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/\u0092/g, '’')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  // Legacy imports use symbol/number sequences for lost chord/layout glyphs.
  // Clean the display only; the original stored lyric text remains untouched.
  return line
    .replace(/(?:\d+[!@#$%^&*+|<>~_{}]+[0-9]*|[!@#$%^&*+|<>~_{}]+[0-9]+|[!@#$%^&*+|~_{}]{2,}|[<>]+)/g, ' ')
    .replace(/(^|\s)[!@#$%^&*+|~_](?=\s|$|[.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/g, '');
}

function hasLines(lines) {
  return Array.isArray(lines) && lines.some(line => typeof line === 'string' && line.trim());
}

function songSearchText(song) {
  const lyricLines = getSongSections(song).flatMap(section => section.lines);
  return normalize([song.number, song.title, song.titleRongmei, song.rongmeiTitle, song.titleEnglish, song.englishTitle, song.title_rongmei, song.title_english, song.sourceNumber, song.sourceBook, song.author, song.chord, song.beat, song.meta3, song.meta4, lyricLines.join(' '), ...(song.search?.keywords || [])].join(' '));
}

async function loadBookMetadata(entry) {
  const data = await fetchJSON(localBookURL(entry, entry.metadata || 'metadata.json'), `metadata for ${entry.id}`);
  validateBookMetadata(data, entry);
  return {
    ...entry,
    ...data,
    coverImage: data.cover?.image || '',
    coverImageAlt: data.cover?.alt || `Cover of ${data.title}`,
    iconImage: data.icon || '',
    songCount: Number.isInteger(entry.songCount) ? entry.songCount : data.songs?.count,
    updatedAt: data.songs?.updatedAt || '—'
  };
}

async function loadSongsForBook(book) {
  if (bookSongCache.has(book.id)) return bookSongCache.get(book.id);
  if (bookSongRequests.has(book.id)) return bookSongRequests.get(book.id);
  const request = (async () => {
    const externalURL = book.songs?.url?.trim();
    const sourceURL = externalURL || localBookURL(book, book.songs?.file || 'songs.json');
    const version = encodeURIComponent(book.songs?.updatedAt || book.version || 'latest');
    const versionedURL = `${sourceURL}${sourceURL.includes('?') ? '&' : '?'}v=${version}`;
    const data = await fetchJSON(versionedURL, `songs for ${book.title}`);
    validateSongsData(data, book);
    const result = {
      songs: [...data.songs].sort((a, b) => a.number - b.number),
      sourceURL,
      updatedAt: data.updatedAt || book.updatedAt
    };
    bookSongCache.set(book.id, result);
    return result;
  })();
  bookSongRequests.set(book.id, request);
  try {
    return await request;
  } finally {
    bookSongRequests.delete(book.id);
  }
}

export async function loadLibrary() {
  if (library) return library;
  const data = await fetchJSON(LIBRARY_URL, 'songbook library');
  validateLibrary(data);
  const books = await Promise.all(data.books.map(loadBookMetadata));
  library = { ...data, books };
  return library;
}

export async function loadBook(bookId) {
  const currentLibrary = await loadLibrary();
  const selected = currentLibrary.books.find(book => book.id === bookId) || currentLibrary.books[0];
  if (!selected) throw new Error('no songbooks configured');
  if (activeBook?.id === selected.id && records.length) return records;

  const data = await loadSongsForBook(selected);
  records = data.songs;
  activeBook = {
    ...selected,
    songCount: records.length,
    updatedAt: data.updatedAt,
    sourceURL: data.sourceURL
  };
  searchIndex = records.map(song => ({ song, searchableText: songSearchText(song) }));
  return records;
}

export function validateLibrary(data) {
  if (!data || data.schemaVersion !== '2.0' || !Array.isArray(data.books) || !data.books.length) throw new Error('invalid songbook library');
  const ids = new Set();
  data.books.forEach(entry => {
    if (!entry || !safeDirectory(entry.id) || !safeDirectory(entry.directory) || entry.id !== entry.directory || !safeFile(entry.metadata || 'metadata.json') || ids.has(entry.id)) {
      throw new Error('invalid or duplicate songbook entry');
    }
    ids.add(entry.id);
  });
}

export function validateBookMetadata(data, entry) {
  if (!data || data.schemaVersion !== '1.0' || data.id !== entry.id || data.name !== entry.id || !data.title || !data.intro?.summary || !data.credits?.editor || !data.songs || (!safeFile(data.songs.file || '') && !data.songs.url?.trim())) {
    throw new Error(`invalid metadata for ${entry.id}`);
  }
}

export function validateSongsData(data, book) {
  if (!data || data.schemaVersion !== '1.0' || typeof data.contentVersion !== 'string' || !Array.isArray(data.songs)) throw new Error(`invalid songs for ${book.id}`);
  const ids = new Set();
  const numbers = new Set();
  data.songs.forEach(song => {
    const sections = song.content?.sections;
    const validSections = Array.isArray(sections) && sections.some(section => hasLines(section?.lines));
    if (!song.id || ids.has(song.id) || !Number.isInteger(song.number) || song.number < 1 || numbers.has(song.number) || !song.title || (!hasLines(song.content?.lines) && !validSections)) {
      throw new Error(`invalid song in ${book.id}`);
    }
    ids.add(song.id);
    numbers.add(song.number);
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

/** Return display-ready lyric groups for both modern and legacy source records. */
export function getSongSections(song) {
  const sections = song?.content?.sections;
  if (Array.isArray(sections) && sections.some(section => hasLines(section?.lines))) {
    return sections
      .filter(section => hasLines(section?.lines))
      .map(section => ({
        type: section.type || 'verse',
        label: section.label || '',
        lines: section.lines.map(cleanLyricLine)
      }));
  }

  const rawLines = (song?.content?.lines || []).map(cleanLyricLine)
  const firstVerseIndex = rawLines.findIndex(line => /^\s*1[.)]\s+\S/.test(line));
  const candidateDetails = firstVerseIndex > 0 ? rawLines.slice(0, firstVerseIndex).filter(line => line.trim()) : [];
  const hasSongDetails = candidateDetails.some(line => /\bdoh hei\b|\bref\.?|\bchorus\b|\brefrain\b|\b\d+\.\d+\b/i.test(line));
  const details = hasSongDetails ? candidateDetails : [];
  const groups = groupLegacyLines(hasSongDetails ? rawLines.slice(firstVerseIndex) : rawLines);
  const hasRefrain = details.some(line => /\bref\.?|\bchorus\b|\brefrain\b/i.test(line));
  const result = details.length ? [{ type: 'frontmatter', label: 'Song details', lines: details }] : [];
  let nextVerse = 1;
  let sawVerse = false;
  let inferredRefrain = false;

  groups.forEach(lines => {
    const firstLine = lines.find(line => line.trim()) || '';
    const verseMatch = firstLine.match(/^\s*(?:verse\s*)?(\d+)\s*[.)]\s+\S/i);
    const explicitRefrain = /^\s*(?:chorus|refrain|ref\.?)\s*[:.\-]?/i.test(firstLine);
    const attribution = /^\s*(?:ph\.|words?:|text:|tune:|music:|by\s)/i.test(firstLine);
    let type = 'verse';
    let label = '';

    if (attribution) {
      type = 'attribution';
      label = 'Source note';
    } else if (explicitRefrain || (hasRefrain && sawVerse && !inferredRefrain && !verseMatch)) {
      type = 'chorus';
      label = explicitRefrain ? 'Chorus / refrain' : 'Refrain';
      inferredRefrain = true;
    } else if (verseMatch) {
      const number = Number(verseMatch[1]);
      type = 'verse';
      label = `Verse ${number}`;
      nextVerse = number + 1;
      sawVerse = true;
    } else {
      label = `Verse ${nextVerse}`;
      nextVerse += 1;
      sawVerse = true;
    }
    result.push({ type, label, lines });
  });
  return result;
}

export const getLibrary = () => library;
export const getBooks = () => library?.books || [];
export const getActiveBook = () => activeBook;
export const getAllHymns = () => records;
export const getHymnByNumber = number => records.find(song => song.number === Number(number));
export const getHymnById = id => records.find(song => song.id === id);
export const getPreviousHymn = song => records[records.indexOf(song) - 1];
export const getNextHymn = song => records[records.indexOf(song) + 1];
export const getRecordKey = song => `${activeBook?.id || 'unknown'}:${song.id}`;
export const buildBookURL = book => `book.html?book=${encodeURIComponent(book.id)}`;
export const buildHymnURL = (song, book = activeBook) => `hymn.html?book=${encodeURIComponent(book?.id || '')}&number=${encodeURIComponent(song.number)}`;

export function searchHymns(query) {
  const needle = normalize(query);
  if (!needle) return [];
  return searchIndex.filter(item => matchesSearch(needle, item.searchableText)).map(item => item.song);
}

/** Search every available book and keep successful results if a source is offline. */
export async function searchAcrossBooks(query) {
  const needle = normalize(query);
  if (!needle) return { results: [], searchedBooks: 0, failedBooks: [] };
  const books = getBooks();
  const settled = await Promise.allSettled(books.map(async book => ({
    book,
    ...(await loadSongsForBook(book))
  })));
  const sources = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
  const failedBooks = settled.map((result, index) => result.status === 'rejected' ? {
    id: books[index].id,
    title: books[index].title,
    reason: result.reason instanceof Error ? result.reason.message : String(result.reason)
  } : null).filter(Boolean);
  const results = sources.flatMap(({ book, songs }) => songs
    .filter(song => matchesSearch(needle, songSearchText(song)))
    .map(song => ({ book, song })));
  return { results, searchedBooks: sources.length, failedBooks };
}

export function getHymnsAlphabetically() {
  const titleForSort = song => song.titleRongmei || song.rongmeiTitle || song.title || song.titleEnglish || song.englishTitle || '';
  return [...records].sort((a, b) => titleForSort(a).localeCompare(titleForSort(b), undefined, { sensitivity: 'base', numeric: true }) || a.number - b.number);
}
