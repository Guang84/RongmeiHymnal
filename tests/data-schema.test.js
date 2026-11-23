import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateManifest,
  validateBookIndex,
  validateSongDocument,
  getSongSections
} from '../js/data.js';

const libraryIndex = {
  books: [{ id: 'sample-book' }]
};
const collection = { bookId: 'sample-book', songCount: 1, path: 'sample-book/book.json' };
const book = {
  schemaVersion: '2.1',
  bookId: 'sample-book',
  title: 'Sample Book',
  contentVersion: '1.0.0',
  updatedAt: '2026-11-23',
  songCount: 1,
  defaultLanguage: 'rongmei',
  songs: [{
    id: 'sample-001',
    number: 1,
    path: 'songs/0001-sample-song/song.json',
    titles: { rongmei: 'Sample Rongmei title', english: 'Sample English title' }
  }]
};
const songDocument = {
  schemaVersion: '2.1',
  bookId: 'sample-book',
  contentVersion: '1.0.0',
  defaultLanguage: 'rongmei',
  song: {
    id: 'sample-001',
    number: 1,
    source: { printedNumber: 4, sourceBook: 'Printed Sample Book' },
    details: { author: null, composer: null },
    languages: {
      rongmei: {
        language: 'rongmei',
        title: 'Sample Rongmei title',
        contentStatus: 'available',
        content: { format: 'source-lines', lines: ['Line one', '', ' Line two  '] }
      },
      english: {
        language: 'english',
        title: 'Sample English title',
        contentStatus: 'title_only',
        content: null
      }
    },
    editorial: { status: 'not_reviewed', reviewedBy: null, reviewedAt: null, notes: [] },
    rights: { status: 'unknown', languageRights: {} },
    search: { keywords: [] }
  }
};

test('accepts a matching Schema 2.1 manifest', () => {
  const manifest = { schemaVersion: '2.1', totalSongs: 1, collections: [collection] };
  assert.doesNotThrow(() => validateManifest(manifest, libraryIndex));
});

test('rejects a manifest with an inconsistent song total', () => {
  const manifest = { schemaVersion: '2.1', totalSongs: 2, collections: [collection] };
  assert.throws(() => validateManifest(manifest, libraryIndex), /total is inconsistent/);
});

test('accepts the per-song Schema 2.1 book index', () => {
  assert.doesNotThrow(() => validateBookIndex(book, { id: 'sample-book' }, collection));
});

test('rejects unsafe per-song paths', () => {
  const invalid = structuredClone(book);
  invalid.songs[0].path = 'songs/../../outside.json';
  assert.throws(() => validateBookIndex(invalid, { id: 'sample-book' }, collection), /invalid or duplicate/);
});

test('accepts source-lines song documents and title-only language variants', () => {
  assert.doesNotThrow(() => validateSongDocument(songDocument, book, book.songs[0]));
});

test('rejects a song document with mismatched index identity', () => {
  const invalid = structuredClone(songDocument);
  invalid.song.id = 'different-id';
  assert.throws(() => validateSongDocument(invalid, book, book.songs[0]), /invalid Schema 2.1 song document/);
});

test('preserves blank lines and original spacing in Schema 2.1 source-lines', () => {
  const normalized = {
    content: { format: 'source-lines', lines: ['First line', '', '  Indented line  '] }
  };
  assert.deepEqual(getSongSections(normalized), [{
    type: 'source-lines',
    label: '',
    lines: ['First line', '', '  Indented line  ']
  }]);
});

test('keeps structured chorus sections and repeat references', () => {
  const normalized = {
    content: {
      format: 'structured',
      sections: [
        { type: 'verse', label: 'Verse 1', lines: ['First verse'] },
        { type: 'chorus', label: 'Chorus', lines: ['Shared refrain'] },
        { type: 'chorus', label: 'Repeat chorus', repeatOf: 'chorus-1', lines: ['Shared refrain'] }
      ]
    }
  };
  const sections = getSongSections(normalized);
  assert.equal(sections[1].type, 'chorus');
  assert.equal(sections[2].repeatOf, 'chorus-1');
});
