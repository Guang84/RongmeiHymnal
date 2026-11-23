import {
  buildBookURL,
  buildHymnURL,
  getActiveBook,
  getAllHymns,
  getBooks,
  getHymnByNumber,
  getHymnsAlphabetically,
  getLibrary,
  getNextHymn,
  getPreviousHymn,
  getRecordKey,
  getSongSections,
  loadBook,
  loadLibrary,
  loadSong,
  searchAcrossBooks,
  searchHymns,
  searchLyricsInBook
} from './data.js';
import { addHistory, getFavorites, getHistory, toggleFavorite } from './storage.js';
import { verificationMessage } from './search-core.js';
import { $, renderMiniLists, toast } from './ui.js';
import { initSettings } from './settings.js';
import { initOfflineLibrary } from './offline.js';

const PAGE_SIZE = 60;
let catalogSongs = [];
let visibleSongCount = PAGE_SIZE;
let catalogScrollInitialized = false;


function songTitleParts(song) {
  const primary = song?.title || song?.titleRongmei || song?.titleEnglish || '';
  const alternate = song?.language === 'english' ? song?.titleRongmei : song?.titleEnglish;
  return { primary, secondary: alternate && alternate !== primary ? alternate : '' };
}
function appendSongTitle(parent, song, link = false) {
  const parts = songTitleParts(song);
  const primary = createElement(link ? 'a' : 'span', 'song-title-primary', parts.primary);
  if (link) primary.href = buildHymnURL(song);
  parent.append(primary);
  if (parts.secondary) parent.append(createElement('span', 'song-title-secondary', parts.secondary));
}

const selectedBookId = () => new URLSearchParams(location.search).get('book');
const setText = (selector, value = '—') => document.querySelectorAll(selector).forEach(node => { node.textContent = value || '—'; });

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function applyBookTheme(book) {
  const accent = book?.theme?.accent;
  const accentSoft = book?.theme?.accentSoft;
  if (accent) document.documentElement.style.setProperty('--book-accent', accent);
  else document.documentElement.style.removeProperty('--book-accent');
  if (accentSoft) document.documentElement.style.setProperty('--book-accent-soft', accentSoft);
  else document.documentElement.style.removeProperty('--book-accent-soft');
  if (book?.iconImage) {
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) {
      favicon.href = book.iconImage;
      favicon.type = 'image/png';
    }
  }
}

function renderAppDetails() {
  const library = getLibrary()?.library;
  if (!library) return;
  setText('[data-library-name]', library.name);
  setText('[data-library-eyebrow]', library.eyebrow || 'Digital songbook library');
  setText('[data-library-title]', library.title);
  setText('[data-library-intro]', library.intro);
  setText('[data-library-about]', library.about);
  setText('[data-book-count]', getBooks().length);
  const totalSongs = getBooks().reduce((total, book) => total + (Number.isInteger(book.songCount) ? book.songCount : 0), 0);
  setText('[data-total-song-count]', totalSongs || '—');
  const image = $('[data-library-image]');
  if (image && library.heroImage) {
    image.src = library.heroImage;
    image.alt = library.heroImageAlt || library.name;
  }
}

function renderBookList() {
  const node = $('[data-book-list]');
  if (!node) return;
  node.replaceChildren();
  getBooks().forEach(book => {
    const link = createElement('a', 'book-card');
    link.href = buildBookURL(book);
    link.setAttribute('aria-label', `Open ${book.title}`);
    if (book.theme?.accent) link.style.setProperty('--card-accent', book.theme.accent);
    const image = createElement('img', 'book-card-cover');
    image.src = book.coverImage || 'assets/Rongmei Gospel song books.png';
    image.alt = book.coverImageAlt || `Cover of ${book.title}`;
    const content = createElement('span', 'book-card-content');
    if (book.iconImage) {
      const icon = createElement('img', 'book-card-icon');
      icon.src = book.iconImage;
      icon.alt = '';
      content.append(icon);
    }
    content.append(
      createElement('span', 'book-card-label', 'Songbook'),
      createElement('strong', '', book.title),
      createElement('small', '', book.subtitle || book.language || 'Digital songbook'),
      createElement('span', 'book-card-credit', 'Digital edition · ' + (book.credits?.editor || 'GLab')),
      createElement('span', 'book-card-open', `${book.songCount || 'View'} songs  →`)
    );
    link.append(image, content);
    node.append(link);
  });
}

function renderBookFooter(book) {
  if (!book) return;
  setText('[data-book-footer-title]', book.title);
  setText('[data-book-editor]', book.credits.editor);
  setText('[data-book-compiler]', book.credits.compiledBy);
  setText('[data-book-publisher]', book.credits.publisher);
  setText('[data-book-year]', book.credits.year);
  setText('[data-book-rights]', book.credits.rights);
  const source = $('[data-book-source]');
  if (source) {
    const externalURL = book.sourceBookURL;
    source.hidden = !externalURL;
    if (externalURL) {
      source.href = externalURL;
      source.textContent = 'Collection index ↗';
    }
  }
}

function renderChangelog(book) {
  const block = $('[data-book-changelog]');
  const list = $('[data-book-changelog-list]');
  if (!block || !list) return;
  const entries = Array.isArray(book.changelog) ? book.changelog : [];
  block.hidden = !entries.length;
  list.replaceChildren();
  entries.forEach(entry => {
    const item = createElement('li');
    const date = createElement('time', 'changelog-date', entry.date || 'Update');
    if (entry.date) date.dateTime = entry.date;
    item.append(date, createElement('span', '', entry.note || 'Editorial update.'));
    list.append(item);
  });
}

function renderBookDetails() {
  const book = getActiveBook();
  if (!book) return;
  applyBookTheme(book);
  setText('[data-active-book-title]', book.title);
  setText('[data-active-book-name]', book.name);
  setText('[data-active-book-subtitle]', book.subtitle);
  setText('[data-active-book-summary]', book.intro.summary);
  setText('[data-active-book-description]', book.intro.description);
  setText('[data-active-book-language]', book.language);
  setText('[data-active-song-count]', book.songCount);
  setText('[data-active-book-updated]', book.updatedAt);
  setText('[data-book-edition-version]', book.contentVersion || '—');
  setText('[data-book-edition-updated]', book.updatedAt || '—');
  setText('[data-book-edition-language]', book.defaultLanguage || book.language || '—');
  setText('[data-book-edition-editor]', book.credits?.editor || 'Not recorded');
  setText('[data-book-edition-compiler]', book.credits?.compiledBy || 'Not recorded');
  setText('[data-book-edition-publisher]', book.credits?.publisher || 'Not recorded');
  setText('[data-book-edition-rights]', book.credits?.rights || 'Rights information is not recorded in the presentation metadata.');
  const cover = $('[data-active-cover]');
  if (cover) {
    cover.src = book.coverImage || 'assets/Rongmei Gospel song books.png';
    cover.alt = book.coverImageAlt || `Cover of ${book.title}`;
  }
  const random = $('[data-random-link]');
  if (random) random.href = `hymn.html?book=${encodeURIComponent(book.id)}&random=1`;
  document.title = `${book.title} | Rongmei Hymnal`;
  renderBookFooter(book);
  renderChangelog(book);
}

function renderSongTable(songs = getHymnsAlphabetically()) {
  const body = $('[data-song-table]');
  if (!body) return;
  catalogSongs = songs;
  body.replaceChildren();
  songs.slice(0, visibleSongCount).forEach(song => {
    const row = document.createElement('tr');
    const number = createElement('td', 'table-number', song.number);
    const titleCell = document.createElement('td');
    appendSongTitle(titleCell, song, true);
    titleCell.append(createElement('small', 'song-catalog-meta', 'Digital song ' + String(song.number).padStart(3, '0')));
    const actionCell = createElement('td', 'table-action');
    const action = createElement('a', '', 'Read →');
    action.href = buildHymnURL(song);
    action.setAttribute('aria-label', `Open song ${song.number}: ${songTitleParts(song).primary}`);
    actionCell.append(action);
    row.append(number, titleCell, actionCell);
    body.append(row);
  });
  if (!songs.length) {
    const row = document.createElement('tr');
    row.append(createElement('td', 'empty-state', 'No songs match this search.'));
    row.firstChild.colSpan = 3;
    body.append(row);
  }
  const shownCount = Math.min(visibleSongCount, songs.length);
  const pageStatus = $('[data-catalog-page-status]');
  if (pageStatus) pageStatus.textContent = songs.length
    ? `Showing ${shownCount} of ${songs.length} songs · sorted A–Z. Use “Load more” to continue.`
    : 'No matching songs.';
  const more = $('[data-load-more]');
  if (more) {
    more.hidden = shownCount >= songs.length || !songs.length;
    more.textContent = shownCount >= songs.length ? 'All songs loaded' : `Load more songs (${Math.min(PAGE_SIZE, songs.length - shownCount)} more)`;
  }
}

function loadMoreCatalogSongs() {
  if (visibleSongCount >= catalogSongs.length) return;
  visibleSongCount = Math.min(catalogSongs.length, visibleSongCount + PAGE_SIZE);
  renderSongTable(catalogSongs);
}

function initCatalogInfiniteScroll() {
  if (catalogScrollInitialized) return;
  const more = $('[data-load-more]');
  if (!more) return;
  catalogScrollInitialized = true;
  // Keep the catalogue in the document's natural scroll flow on touch screens.
  more.addEventListener('click', loadMoreCatalogSongs);
}

function initSearch() {
  const input = $('[data-search-input]');
  const status = $('[data-search-status]');
  const clear = $('[data-clear-search]');
  const lyricsButton = $('[data-search-lyrics]');
  if (!input || !status || !clear) return;
  let request = 0;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    request += 1;
    clear.hidden = !query;
    if (lyricsButton) lyricsButton.disabled = !query;
    const matches = searchHymns(query);
    visibleSongCount = PAGE_SIZE;
    status.textContent = query
      ? matches.length + ' title/number match' + (matches.length === 1 ? '' : 'es') + ' in ' + getActiveBook().title + '. Use “Search lyrics too” to search the full song text.'
      : '';
    const matchedIds = new Set(matches.map(song => song.id));
    renderSongTable(query ? getHymnsAlphabetically().filter(song => matchedIds.has(song.id)) : getHymnsAlphabetically());
  });

  clear.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
  });

  lyricsButton?.addEventListener('click', async () => {
    const query = input.value.trim();
    if (!query) return;
    const currentRequest = ++request;
    lyricsButton.disabled = true;
    clear.disabled = true;
    status.textContent = 'Searching individual song records… 0 of ' + getAllHymns().length;
    try {
      const result = await searchLyricsInBook(query, (completed, total, failed) => {
        if (currentRequest === request) {
          status.textContent = 'Searching song text… ' + completed + ' of ' + total
            + (failed ? ' · ' + failed + ' unavailable' : '');
        }
      });
      if (currentRequest !== request || input.value.trim() !== query) return;
      const titleMatches = searchHymns(query);
      const matchedIds = new Set([...titleMatches, ...result.results].map(song => song.id));
      const matches = getHymnsAlphabetically().filter(song => matchedIds.has(song.id));
      visibleSongCount = PAGE_SIZE;
      renderSongTable(matches);
      status.textContent = matches.length + ' matching song' + (matches.length === 1 ? '' : 's')
        + ' in ' + getActiveBook().title + '. Searched ' + result.completed + ' of ' + result.total
        + ' song records' + (result.failed ? '; ' + result.failed + ' could not be loaded.' : '.');
    } catch (error) {
      if (currentRequest === request) {
        console.error('Lyric search failed', error);
        status.textContent = 'Lyric search could not be completed. Check the connection and try again.';
        status.dataset.state = 'error';
      }
    } finally {
      if (currentRequest === request) {
        lyricsButton.disabled = false;
        clear.disabled = false;
      }
    }
  });
}

function renderGlobalSearchResults(results, query) {
  const node = $('[data-library-search-results]');
  if (!node) return;
  node.replaceChildren();
  if (!query) return;
  if (!results.length) {
    node.append(createElement('p', 'empty-state', 'No songs match that search across the library.'));
    return;
  }
  results.slice(0, 18).forEach(({ book, song }) => {
    const link = createElement('a', 'library-search-result');
    link.href = buildHymnURL(song, book);
    link.append(
      createElement('span', 'search-result-book', book.title),
      createElement('strong', '', `${song.number} · ${songTitleParts(song).primary}${songTitleParts(song).secondary ? ` / ${songTitleParts(song).secondary}` : ''}`),
      createElement('span', 'search-result-action', 'Read song →')
    );
    node.append(link);
  });
  if (results.length > 18) node.append(createElement('p', 'search-result-limit', `Showing the first 18 of ${results.length} matching songs.`));
}

function initGlobalSearch() {
  const input = $('[data-library-search-input]');
  const status = $('[data-library-search-status]');
  const clear = $('[data-library-clear-search]');
  if (!input || !status || !clear) return;
  let request = 0;
  let timer;
  const search = async () => {
    const query = input.value.trim();
    clear.hidden = !query;
    const currentRequest = ++request;
    if (!query) {
      status.textContent = '';
      status.dataset.state = '';
      renderGlobalSearchResults([], '');
      return;
    }
    status.textContent = 'Searching song titles and numbers across the library…';
    try {
      const search = await searchAcrossBooks(query);
      if (currentRequest !== request) return;
      const { results, searchedBooks, failedBooks } = search;
      const resultLabel = `${results.length} matching title/number result${results.length === 1 ? '' : 's'} from ${searchedBooks} songbooks.`;
      status.textContent = failedBooks.length
        ? `${resultLabel} Unavailable: ${failedBooks.map(book => book.title).join(', ')}. Some results may be missing.`
        : resultLabel;
      status.dataset.state = failedBooks.length ? 'partial' : 'complete';
      renderGlobalSearchResults(results, query);
    } catch {
      if (currentRequest !== request) return;
      status.textContent = 'The library search could not be completed. Please try again.';
      status.dataset.state = 'error';
      renderGlobalSearchResults([], query);
    }
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 180);
  });
  clear.addEventListener('click', () => {
    input.value = '';
    clearTimeout(timer);
    search();
    input.focus();
  });
}

function renderHome() {
  renderAppDetails();
  renderBookList();
  initGlobalSearch();
}

function renderBookPage() {
  const book = getActiveBook();
  renderBookDetails();
  visibleSongCount = PAGE_SIZE;
  renderSongTable(getHymnsAlphabetically());
  initCatalogInfiniteScroll();
  renderMiniLists();
  const latest = getHistory().find(recordKey => recordKey.startsWith(`${book.id}:`));
  const lastSong = getAllHymns().find(song => getRecordKey(song) === latest);
  if (lastSong) {
    $('[data-continue-section]').hidden = false;
    const title = songTitleParts(lastSong);
    setText('[data-continue-title]', `${lastSong.number} · ${title.primary}`);
    $('[data-continue-link]').href = buildHymnURL(lastSong);
  }
  initSearch();
}

function renderLyrics(song) {
  const lyrics = $('[data-lyrics]');
  const outline = $('[data-song-outline]');
  const sections = getSongSections(song);
  lyrics.replaceChildren();
  if (outline) outline.replaceChildren();
  if (!sections.length || !sections.some(section => section.lines.some(line => line.trim()))) {
    lyrics.append(createElement('p', 'empty-state lyrics-unavailable',
      'Lyrics for this language were not included in the supplied source. The available title is retained.'));
    if (outline) outline.hidden = true;
    return;
  }
  sections.forEach((section, index) => {
    const block = createElement('section', 'song-section song-section--' + section.type);
    block.id = 'song-section-' + (index + 1);
    block.setAttribute('aria-label', section.label || 'Song text');
    if (section.label) block.append(createElement('h2', 'song-section-label', section.label));
    section.lines.forEach(line => block.append(createElement('p', '', line)));
    lyrics.append(block);
    if (outline && section.label && !['frontmatter', 'attribution'].includes(section.type)) {
      const link = createElement('a', 'song-outline-link song-outline-link--' + section.type, section.label);
      link.href = '#' + block.id;
      outline.append(link);
    }
  });
  if (outline) outline.hidden = outline.childElementCount < 2;
}

function initPresentationMode() {
  const button = $('[data-presentation-button]');
  const exitButton = $('[data-presentation-exit]');
  if (!button) return;
  const toggle = force => {
    const enabled = typeof force === 'boolean' ? force : !document.body.classList.contains('presentation-mode');
    document.body.classList.toggle('presentation-mode', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'Exit presentation' : 'Present';
    exitButton?.setAttribute('aria-hidden', String(!enabled));
    if (enabled && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // Keep the focused presentation layout if fullscreen is unavailable.
      });
    } else if (!enabled && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };
  button.addEventListener('click', toggle);
  exitButton?.addEventListener('click', () => toggle(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('presentation-mode')) toggle(false);
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('presentation-mode')) toggle(false);
  });
  return toggle;
}

function renderSongContent(song, book) {
  const sourceNumber = $('[data-reader-source-number]');
  if (sourceNumber) {
    const sourceDetails = [];
    if (song.sourceBook) sourceDetails.push('Source book: ' + song.sourceBook);
    if (song.sourceNumber !== undefined && song.sourceNumber !== null) {
      sourceDetails.push('Printed number: ' + song.sourceNumber);
    }
    sourceNumber.hidden = !sourceDetails.length;
    sourceNumber.textContent = sourceDetails.join(' · ');
  }

  const readerTitle = $('[data-reader-title]');
  const titleParts = songTitleParts(song);
  setText('[data-reader-title]', titleParts.primary);
  $('[data-reader-title-secondary]')?.remove();
  if (titleParts.secondary && readerTitle) {
    const secondary = createElement('p', 'song-title-secondary reader-title-secondary', titleParts.secondary);
    secondary.dataset.readerTitleSecondary = '';
    readerTitle.insertAdjacentElement('afterend', secondary);
  }

  const metadataBlock = $('[data-song-metadata]');
  if (metadataBlock) {
    metadataBlock.replaceChildren();
    const details = song.details || {};
    const items = [
      ['Author', details.author], ['Composer', details.composer],
      ['Translator', song.translator], ['Arranger', details.arranger],
      ['Chord', details.chord], ['Key', details.key], ['Beat', details.beat],
      ['Meter', details.meter], ['Tune', details.tune]
    ].filter(([, value]) => value !== null && value !== undefined && String(value).trim());
    items.forEach(([label, value]) => {
      const item = document.createElement('div');
      item.append(createElement('dt', '', label), createElement('dd', '', String(value).trim()));
      metadataBlock.append(item);
    });
    metadataBlock.hidden = !items.length;
  }

  setText('[data-verification]', verificationMessage(song, book.title));
  const rightsNode = $('[data-rights-status]');
  if (rightsNode) {
    const languageRights = song.rights?.languageRights?.[song.language];
    const status = languageRights?.status || song.rights?.status || 'unknown';
    const labels = {
      unknown: 'Rights information has not yet been verified.',
      pending: 'Publication permission is pending confirmation.',
      licensed: 'A licence is recorded for this content.',
      public_domain_verified: 'Public-domain status is recorded for this content.',
      restricted: 'This content has restricted permitted uses.'
    };
    rightsNode.textContent = labels[status] || 'Rights status: ' + status.replace(/[_-]+/g, ' ') + '.';
  }
  document.title = (titleParts.primary || song.title) + ' | ' + book.title;
  renderLyrics(song);
}

async function renderReader() {
  const book = getActiveBook();
  applyBookTheme(book);
  const params = new URLSearchParams(location.search);
  const number = params.get('number');
  const descriptor = number
    ? getHymnByNumber(number)
    : params.has('random')
      ? getAllHymns()[Math.floor(Math.random() * getAllHymns().length)]
      : null;
  if (!descriptor) {
    $('[data-reader-error]').hidden = false;
    return;
  }

  const song = await loadSong(descriptor, params.get('lang'));
  const bookURL = buildBookURL(book);
  $('[data-reader-back]').href = bookURL;
  $('[data-book-home]').href = bookURL;
  addHistory(getRecordKey(song));
  $('[data-reader]').hidden = false;
  setText('[data-reader-book]', book.title);
  setText('[data-reader-number]', 'Song ' + song.number);

  const languageControl = $('[data-language-control]');
  const languageSelect = $('[data-language-select]');
  if (languageControl && languageSelect) {
    languageSelect.replaceChildren();
    song.availableLanguages.forEach(language => {
      const option = document.createElement('option');
      option.value = language.id;
      option.textContent = language.title + (language.contentStatus === 'title_only' ? ' · title only' : '');
      languageSelect.append(option);
    });
    languageSelect.value = song.language;
    languageControl.hidden = song.availableLanguages.length < 2;
    languageSelect.addEventListener('change', async () => {
      languageSelect.disabled = true;
      try {
        const localizedSong = await loadSong(descriptor, languageSelect.value);
        renderSongContent(localizedSong, book);
        const nextURL = new URL(location.href);
        nextURL.searchParams.set('lang', localizedSong.language);
        history.replaceState({}, '', nextURL);
      } catch (error) {
        console.error('Unable to load selected song language', error);
        toast('That language version could not be loaded.');
      } finally {
        languageSelect.disabled = false;
      }
    });
  }

  renderSongContent(song, book);
  const favorite = $('[data-favorite-button]');
  const recordKey = getRecordKey(song);
  const updateFavorite = () => {
    favorite.textContent = getFavorites().includes(recordKey) ? '★ Favorited' : '☆ Favorite';
  };
  updateFavorite();
  favorite.addEventListener('click', () => {
    const active = toggleFavorite(recordKey);
    updateFavorite();
    toast(active ? 'Added to favorites' : 'Removed from favorites');
  });

  const previous = getPreviousHymn(descriptor);
  const next = getNextHymn(descriptor);
  $('[data-reader-nav]').hidden = false;
  for (const [selector, item, label] of [
    ['[data-previous]', previous, '[data-previous-label]'],
    ['[data-next]', next, '[data-next-label]']
  ]) {
    const link = $(selector);
    if (item) {
      link.href = buildHymnURL(item);
      link.removeAttribute('aria-disabled');
      setText(label, item.number + ' · ' + item.title);
    } else {
      link.setAttribute('aria-disabled', 'true');
      link.removeAttribute('href');
      setText(label, 'End of songbook');
    }
  }

  renderBookFooter(book);
  initPresentationMode();
  $('[data-share-button]').addEventListener('click', async () => {
    try {
      if (navigator.share) await navigator.share({ title: song.title, text: book.title, url: location.href });
      else {
        await navigator.clipboard.writeText(location.href);
        toast('Link copied');
      }
    } catch {
      toast('Unable to share this link');
    }
  });
  $('[data-print-button]').addEventListener('click', () => print());
}

function initKeys() {
  document.addEventListener('keydown', event => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (event.key === '/' && $('[data-search-input]')) {
      event.preventDefault();
      $('[data-search-input]').focus();
    }
    if (event.key.toLowerCase() === 'h') location.href = 'index.html';
    if (document.body.dataset.page === 'reader') {
      if (event.key === 'ArrowLeft' && !$('[data-previous]').getAttribute('aria-disabled')) location.href = $('[data-previous]').href;
      if (event.key === 'ArrowRight' && !$('[data-next]').getAttribute('aria-disabled')) location.href = $('[data-next]').href;
      if (event.key.toLowerCase() === 'f') $('[data-favorite-button]').click();
      if (event.key.toLowerCase() === 'p') $('[data-presentation-button]')?.click();
    }
  });
}

function renderLoadError(error) {
  console.error('Unable to load songbook library', error);
  const message = 'Unable to load this songbook. Check your connection and refresh to try again.';
  const homeError = $('[data-book-list]');
  if (homeError) homeError.replaceChildren(createElement('p', 'error-state', message));
  const table = $('[data-song-table]');
  if (table) {
    const row = document.createElement('tr');
    const cell = createElement('td', 'error-state', message);
    cell.colSpan = 3;
    row.append(cell);
    table.replaceChildren(row);
  }
  const readerError = $('[data-reader-error]');
  if (readerError) {
    readerError.hidden = false;
    readerError.querySelector('h1').textContent = 'Songbook unavailable';
    readerError.querySelector('p').textContent = message;
  }
}

async function init() {
  initSettings();
  initOfflineLibrary();
  initKeys();
  try {
    await loadLibrary();
    if (document.body.dataset.page === 'home') {
      renderHome();
      return;
    }
    await loadBook(selectedBookId());
    document.body.dataset.page === 'book' ? renderBookPage() : await renderReader();
  } catch (error) {
    renderLoadError(error);
  } finally {
    document.querySelector('[data-app-loader]')?.classList.add('is-hidden');
    document.body.classList.remove('app-loading');
  }
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(registration => {
    let updateScheduled = false;
    const checkForUpdates = async () => {
      if (!navigator.onLine) return;
      try {
        await registration.update();
        const worker = navigator.serviceWorker.controller || registration.active;
        worker?.postMessage({ type: 'REFRESH_LIBRARY' });
      } catch (error) {
        console.warn('Online update check failed', error);
      }
    };
    const reloadForUpdate = () => {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    };
    const showUpdate = () => {
      if (updateScheduled) return;
      updateScheduled = true;
      const node = $('[data-update]');
      if (node) {
        node.firstChild.textContent = 'A newer version is ready. Refresh when you are finished reading.';
        node.hidden = false;
        node.querySelector('button')?.addEventListener('click', reloadForUpdate, { once: true });
      }
    };
    if (registration.waiting) showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (worker) worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
      });
    });
    checkForUpdates();
    window.addEventListener('online', checkForUpdates);
  }).catch(error => console.warn('Service worker registration failed', error));
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'NETWORK_ERROR') {
      if (!navigator.onLine) toast('You are offline; this item is not saved yet.');
      else console.warn(`A background request failed while online: ${event.data.url || 'unknown resource'}`);
    }
    if (event.data?.type === 'LIBRARY_UPDATED') {
      toast('New library data is available. Refresh when convenient.');
    }
    if (event.data?.type === 'LIBRARY_REFRESH_FAILED' && navigator.onLine) console.warn(`Library refresh failed: ${event.data.message || 'unknown error'}`);
    if (event.data?.type === 'CACHE_WARNING') console.warn(`${event.data.count} app files could not be saved for offline use.`);
  });
}

initServiceWorker();
init();
