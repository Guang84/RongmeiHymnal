
/** Shared search helpers; these functions never mutate song records. */
export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}
export function matchesSearch(query, searchableText) {
  const tokens = normalizeSearch(query).split(' ').filter(Boolean);
  if (!tokens.length) return false;
  const haystack = normalizeSearch(searchableText);
  return tokens.every(token => haystack.includes(token));
}
/** Describe the saved editorial state without upgrading or changing it. */
export function verificationMessage(song, bookTitle = 'this songbook') {
  const status = normalizeSearch(song?.verification?.status).replace(/[ _]+/g, '-');
  const note = String(song?.verification?.note ?? '').trim();
  const suffix = note ? ` · ${note}` : '';
  if (status === 'verified') return `Editor-reviewed${suffix}`;
  if (['needs-correction', 'correction-requested', 'needs-correcting'].includes(status))
    return `Correction requested; not approved as a final edition${suffix}`;
  if (['incomplete', 'source-incomplete', 'transcription-incomplete'].includes(status))
    return `Source transcription incomplete${suffix}`;
  if (['pending', 'needs-review', 'awaiting-review', 'unverified'].includes(status))
    return `Not yet editor-reviewed${suffix}`;
  return note || `Editorial status not recorded for ${bookTitle}.`;
}
