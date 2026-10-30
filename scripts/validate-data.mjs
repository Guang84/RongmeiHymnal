import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const includeRemote = process.argv.includes('--all');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const fail = message => { throw new Error(message); };
const index = await readJSON(join(root, 'data/songbooks/index.json'));
if (!Array.isArray(index.books) || index.books.length !== 4) fail('Expected four registered songbooks.');

let checked = 0, skipped = 0;
for (const entry of index.books) {
  const metadata = await readJSON(join(root, 'data/songbooks', entry.directory, entry.metadata || 'metadata.json'));
  if (metadata.id !== entry.id || metadata.schemaVersion !== '1.0') fail(`Invalid metadata identity/schema: ${entry.id}`);
  for (const key of ['editor', 'compiledBy', 'publisher', 'year', 'rights']) {
    if (typeof metadata.credits?.[key] !== 'string' || !metadata.credits[key].trim()) fail(`${entry.id}: missing credits.${key}`);
  }
  if (metadata.songs?.count !== entry.songCount) fail(`${entry.id}: index and metadata counts differ.`);
  let data;
  if (metadata.songs?.file) {
    data = await readJSON(join(root, 'data/songbooks', entry.directory, metadata.songs.file));
  } else if (includeRemote && metadata.songs?.url) {
    const response = await fetch(metadata.songs.url);
    if (!response.ok) fail(`${entry.id}: source fetch failed with HTTP ${response.status}`);
    data = await response.json();
  } else {
    skipped += 1;
    console.log(`SKIP remote source (run with --all): ${entry.id}`);
    continue;
  }
  if (!Array.isArray(data.songs) || data.songs.length !== metadata.songs.count) fail(`${entry.id}: expected ${metadata.songs.count} song records.`);
  const ids = new Set(), numbers = new Set();
  for (const [position, song] of data.songs.entries()) {
    if (!song || typeof song.id !== 'string' || !song.id.trim()) fail(`${entry.id}: missing ID at record ${position + 1}.`);
    if (ids.has(song.id)) fail(`${entry.id}: duplicate digital ID ${song.id}.`);
    if (!Number.isInteger(song.number) || song.number < 1) fail(`${entry.id}: invalid digital number at record ${position + 1}.`);
    if (numbers.has(song.number)) fail(`${entry.id}: duplicate digital number ${song.number}.`);
    if (typeof song.title !== 'string' || !song.title.trim()) fail(`${entry.id}: missing title at record ${position + 1}.`);
    const lines = Array.isArray(song.content?.lines) && song.content.lines.length > 0;
    const sections = Array.isArray(song.content?.sections) && song.content.sections.some(section => Array.isArray(section.lines) && section.lines.length > 0);
    if (!lines && !sections) fail(`${entry.id}: missing lyric structure at record ${position + 1}.`);
    ids.add(song.id); numbers.add(song.number);
  }
  checked += data.songs.length;
  console.log(`PASS ${entry.id}: ${data.songs.length} songs; unique IDs/numbers; lyric structure and credits present.`);
}
console.log(`Validated ${checked} song records; ${skipped} remote datasets skipped.`);
