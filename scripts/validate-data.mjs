import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const includeSongs = process.argv.includes('--all');
const readLocalJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const fail = message => { throw new Error(message); };
const index = await readLocalJSON(join(root, 'data/songbooks/index.json'));

if (index.schemaVersion !== '3.0' || !Array.isArray(index.books)
    || !index.dataSource?.baseUrl || !index.dataSource?.manifestUrl) {
  fail('Invalid Schema 3.0 application library configuration.');
}

for (const entry of index.books) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(entry.id || '') || entry.directory !== entry.id) {
    fail('Invalid songbook ID in application library: ' + entry.id);
  }
  const metadata = await readLocalJSON(join(root, 'data/songbooks', entry.directory, entry.metadata || 'metadata.json'));
  if (metadata.schemaVersion !== '1.0' || metadata.id !== entry.id
      || !metadata.title || !metadata.intro?.summary || !metadata.credits) {
    fail('Invalid presentation metadata for ' + entry.id);
  }
}

if (!process.argv.includes('--remote') && !includeSongs) {
  console.log('PASS local application index and presentation metadata: ' + index.books.length + ' collections.');
  process.exit(0);
}

const fetchJSON = async (url, label) => {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) fail(label + ': HTTP ' + response.status);
  return response.json();
};
const sourceRoot = index.dataSource.baseUrl.replace(/\/+$/, '') + '/';
const dataURL = path => new URL(path.split('/').map(encodeURIComponent).join('/'), sourceRoot).href;
const manifest = await fetchJSON(index.dataSource.manifestUrl, 'External manifest');

if (manifest.schemaVersion !== '2.1' || !Array.isArray(manifest.collections)
    || manifest.collections.length !== index.books.length
    || manifest.totalSongs !== manifest.collections.reduce((sum, item) => sum + item.songCount, 0)) {
  fail('Invalid external Schema 2.1 manifest.');
}

let total = 0;
let checkedSongFiles = 0;
const songTasks = [];

for (const entry of index.books) {
  const collection = manifest.collections.find(item => item.bookId === entry.id);
  if (!collection || !/^[a-z0-9-]+\/book\.json$/i.test(collection.path)
      || collection.songCount !== entry.songCount) {
    fail('Manifest entry missing or mismatched for ' + entry.id);
  }
  const book = await fetchJSON(dataURL(collection.path), entry.id + ' book index');
  if (book.schemaVersion !== '2.1' || book.bookId !== entry.id
      || !book.contentVersion || !book.defaultLanguage
      || book.songCount !== collection.songCount || !Array.isArray(book.songs)
      || book.songs.length !== collection.songCount) {
    fail('Invalid Schema 2.1 book index for ' + entry.id);
  }

  const ids = new Set();
  const numbers = new Set();
  for (const descriptor of book.songs) {
    if (!descriptor || typeof descriptor.id !== 'string' || !descriptor.id.trim()
        || ids.has(descriptor.id) || !Number.isInteger(descriptor.number)
        || descriptor.number < 1 || numbers.has(descriptor.number)
        || !/^songs\/[a-z0-9][a-z0-9-]*\/song\.json$/i.test(descriptor.path || '')
        || descriptor.path.split('/').includes('..')
        || !descriptor.titles || !Object.keys(descriptor.titles).length) {
      fail('Invalid or duplicate song index entry in ' + entry.id + ': ' + descriptor?.id);
    }
    ids.add(descriptor.id);
    numbers.add(descriptor.number);
    if (includeSongs) songTasks.push({ entry, book, descriptor });
  }
  total += book.songs.length;
  console.log('PASS ' + entry.id + ': ' + book.songs.length + ' indexed songs · Schema 2.1 · unique IDs/numbers.');
}

if (total !== manifest.totalSongs) fail('Total song count does not match the manifest.');

if (includeSongs) {
  let cursor = 0;
  const errors = [];
  const worker = async () => {
    while (cursor < songTasks.length) {
      const task = songTasks[cursor++];
      const url = dataURL(task.entry.id + '/' + task.descriptor.path);
      try {
        const document = await fetchJSON(url, task.entry.id + ' song ' + task.descriptor.number);
        const song = document.song;
        if (document.schemaVersion !== '2.1' || document.bookId !== task.entry.id
            || document.contentVersion !== task.book.contentVersion
            || !song || song.id !== task.descriptor.id || song.number !== task.descriptor.number
            || !song.languages || typeof song.languages !== 'object'
            || !song.editorial || !song.rights) {
          fail('Invalid song document identity, editorial or rights fields.');
        }
        const languages = Object.values(song.languages);
        if (!languages.length || !languages.some(language => language?.contentStatus === 'available'
            && (Array.isArray(language.content?.lines)
              || Array.isArray(language.content?.sections)))) {
          fail('Song has no available lyric content.');
        }
        for (const language of languages) {
          if (language.contentStatus === 'title_only' && language.content !== null) {
            fail('title_only language must have null content.');
          }
          if (language.content?.format === 'source-lines' && !Array.isArray(language.content.lines)) {
            fail('source-lines content must contain a lines array.');
          }
          if (language.content?.format === 'structured' && !Array.isArray(language.content.sections)) {
            fail('structured content must contain sections.');
          }
        }
        checkedSongFiles += 1;
      } catch (error) {
        errors.push(task.entry.id + ' #' + task.descriptor.number + ': ' + error.message);
      }
    }
  };
  await Promise.all(Array.from({ length: 10 }, () => worker()));
  if (errors.length) fail(errors.slice(0, 20).join('\n') + (errors.length > 20 ? '\n…and ' + (errors.length - 20) + ' more errors.' : ''));
}

console.log('PASS remote Schema 2.1 data: ' + total + ' indexed songs; ' + checkedSongFiles + ' individual song documents checked.');
