# Rongmei Hymnal

Rongmei Hymnal is a searchable digital library of Rongmei gospel songbooks, created for worship, learning, and community singing. Each collection keeps its own identity, credits, sources, and rights information.
- *Link* : https://guang84.github.io/RongmeiHymnal/
## Upgraded offline-first version

The current release is an installable Progressive Web App (PWA) designed for phones, tablets, and computers. It adds explicit full-library downloads, persistent device storage where the browser permits it, installation-ready PNG icons, storage and download status, and light and dark presentation modes. The home-page brand now uses the application icon.

## Features

- Search across all available songbooks.
- Browse 1,271 songs in three collections: Buanthanhlu, Hymdaihlu, and a 36-song public-domain English VBS songbook.

## Run locally

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>.

## Documentation

See [Project Documentation](docs/PROJECT_DOCUMENTATION.md) for the architecture, songbook data format, publishing workflow, validation rules, and offline behavior.

## Rights

The Apache License 2.0 License applies to the project software, interface, tools, and documentation only. Song lyrics, editions, arrangements, cover art, and other content remain subject to their respective owners' rights. See [LICENSE](LICENSE) and the [Usage Policy](policy.html).
