# Rongmei Hymnal

**Rongmei Hymnal** is a searchable digital library of Rongmei gospel songbooks and selected English hymn collections, developed by **GLab Enterprise**.

The project is designed for worship, learning, community singing and careful digital preservation. Each collection keeps its own identity, source information, contributor credits, editorial status and rights information.

- **Live application:** https://guang84.github.io/RongmeiHymnal/
- **Developer:** [GLab Enterprise](https://guang84.github.io/)
- **Application repository:** https://github.com/Guang84/RongmeiHymnal
- **Song data repository:** https://github.com/Guang84/Guang84.github.io/tree/83a5b3cbde08e38feab473773291dfa24da18156/data/Products/Rongmei%20Hymnal

## Song data architecture

The application consumes the **Schema 2.1 per-song JSON structure** from the GLab website repository.

```text
data/Products/Rongmei Hymnal/
├── manifest.json
├── README.txt
├── buanthanhlu/
│   ├── book.json
│   └── songs/<number>-<title-slug>/song.json
├── hymdaihlu/
│   ├── book.json
│   └── songs/<number>-<title-slug>/song.json
├── ngai-luzaam/
│   ├── book.json
│   └── songs/<number>-<title-slug>/song.json
└── vbs-songs/
    ├── book.json
    └── songs/<number>-<title-slug>/song.json
```

The application first loads the manifest and lightweight book indexes. It fetches an individual `song.json` only when a reader opens that song or selects a language. This keeps the initial page load small and avoids downloading every lyric file just to browse the library.

The app pins its data source to commit `83a5b3cbde08e38feab473773291dfa24da18156` so that the application release and its song data remain reproducible. A future data release should update the pinned commit and run the full remote validation.

The Schema 2.1 data preserves original line order and blank lines, supports structured verse/chorus sections where the source supplies them, keeps language variants independent, and retains source metadata. Unknown information remains unknown; the application must not invent translations, credits, permissions or editorial approval.

## Collections in the pinned data release

| Collection | Indexed songs |
|---|---:|
| Hymdaihlu | 930 |
| Buanthanhlu | 305 |
| Ngai Luzaam | 294 |
| VBS Songs | 36 |
| **Total** | **1,565** |

## Run locally

Use a local HTTP server because the app loads JavaScript modules and remote JSON data:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

## Quality checks

The project has no runtime npm dependencies and uses Node's built-in test runner.

```bash
npm test
npm run validate:data
npm run validate:data:remote
```

- `npm test` runs search, editorial and Schema 2.1 data-structure tests.
- `npm run validate:data` checks the local application index and collection presentation metadata.
- `npm run validate:data:remote` checks the pinned external manifest, all four book indexes, and all 1,565 individual song documents.

## Offline and PWA behaviour

The offline download explicitly saves the application shell, collection indexes and individual song records. The service worker uses a Rongmei Hymnal-specific cache namespace and only removes its own obsolete caches; it must not delete caches belonging to other GLab projects hosted on the same origin.

The reader uses lazy loading for individual songs. Download the complete library before relying on offline access to every song.

## Attribution and rights

Rongmei Hymnal is developed and technically maintained by **GLab Enterprise**. GLab's role as digital application developer or editor does not make GLab the author, composer, translator, arranger, original compiler or publisher of the underlying songs and printed songbooks.

The Apache License 2.0 applies to the application software, interface, tools and documentation only. Song lyrics, translations, arrangements, source editions, cover art and other third-party content remain subject to their respective rights holders and licences.

The Schema 2.1 export currently records unknown rights where permission has not been established. A record being present in the public data repository does not itself grant permission for public display, offline distribution, printing or commercial use. Review the [Usage Policy](policy.html) and the individual song's rights metadata before redistributing content.

## Project identity

**Rongmei Hymnal — A GLab digital project**

Nature · Technology · Innovation

[GLab Enterprise](https://guang84.github.io/) · [GitHub project](https://github.com/Guang84/RongmeiHymnal)
