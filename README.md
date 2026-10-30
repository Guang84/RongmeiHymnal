# Rongmei Hymnal

Rongmei Hymnal is a searchable digital library of Rongmei gospel songbooks, created for worship, learning, and community singing. Each collection keeps its own identity, credits, sources, and rights information.

Live site: https://guang84.github.io/RongmeiHymnal/

## Run locally

Use a local HTTP server because the app loads JavaScript modules and songbook data:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>.

## Quality checks

The project uses Node's built-in test runner and has no runtime npm dependencies.

```sh
npm test
npm run validate:data
npm run validate:data:remote
```

The local validator checks collections stored in this repository. The remote validator also downloads Buanthanhlu and Hymdaihlu from their declared source URLs and checks expected record counts, unique digital IDs/numbers, lyric structure, and required credits/rights metadata.

## Rights

The Apache License 2.0 applies to the project software, interface, tools, and documentation only. Song lyrics, editions, arrangements, cover art, and other content remain subject to their respective owners' rights. See [LICENSE](LICENSE) and the [Usage Policy](policy.html). These application changes do not edit song content or book metadata.
