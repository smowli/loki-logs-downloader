## [2.1.1](https://github.com/vosmol/loki-logs-downloader/compare/2.1.0...2.1.1) (2024-10-02)

## [2.1.0](https://github.com/vosmol/loki-logs-downloader/compare/2.0.0...2.1.0) (2024-10-02)

### Features 🚀

- switch to public registry ([9d275a4](https://github.com/vosmol/loki-logs-downloader/commit/9d275a43135c1e7d0a7472afddb6b205873444f7))

## [2.0.0](https://github.com/vosmol/loki-logs-downloader/compare/1.2.0...2.0.0) (2024-10-01)

### ⚠ BREAKING CHANGES

- rename lines to records
- properly parse loki response
- support extra headers in fetcher request
- refactor fs interface

### Features 🚀

- generate config schema from zod ([d91c723](https://github.com/vosmol/loki-logs-downloader/commit/d91c72339a04c7c1edcd22a8e2d7a51f4f1a5c63))
- properly parse loki response ([46fbfb9](https://github.com/vosmol/loki-logs-downloader/commit/46fbfb9e9cfee29ca82f4e1d9bd5e3b7353689cd))
- refactor fs interface ([b6dbfed](https://github.com/vosmol/loki-logs-downloader/commit/b6dbfed279882e7508fc015e5f50df681e9ea4a9))
- rename lines to records ([e8e5a88](https://github.com/vosmol/loki-logs-downloader/commit/e8e5a88cde979b246b2a00aceaaf850ae3571c06))
- support extra headers in fetcher request ([c33b12f](https://github.com/vosmol/loki-logs-downloader/commit/c33b12f78e7191f070fe21a52d0fe8af927d564a))

## 1.2.0 (2024-09-29)

### Features 🚀

- add config file test ([0de194c](https://github.com/vosmol/loki-logs-downloader/commit/0de194c8036af5c220516e67dc2f66cca87b2f70))
- add package metadata to pkg.json ([0a2f69e](https://github.com/vosmol/loki-logs-downloader/commit/0a2f69e34e8a49d46cb2878bf52e400d00627b3a))
- add prettier & eslint with lint staged ([be1f53a](https://github.com/vosmol/loki-logs-downloader/commit/be1f53ab62df1d6e23ef3bf7fc7d534ec79ec9a7))
- add release-it package ([113c8e9](https://github.com/vosmol/loki-logs-downloader/commit/113c8e9bf837d57a93d7ced3ab4b066128a4bd0f))
- enable lintstaged on pre-commit ([8b245e6](https://github.com/vosmol/loki-logs-downloader/commit/8b245e62929c0e55d6ecea66eddaa096edb2e780))
- init code ([b05a90c](https://github.com/vosmol/loki-logs-downloader/commit/b05a90c7adba1a74ccd31a9b81a53bccec7ab518))
- separate loki api code to own client ([896742c](https://github.com/vosmol/loki-logs-downloader/commit/896742c6fc7c9bbf32890a435515c29a6d591f15))
- setup package publishing & test with private registry ([c2902e1](https://github.com/vosmol/loki-logs-downloader/commit/c2902e1b33306123beaadf7547c3fb5dac98afc6))
- use pkg.json fields in cli ([de0bbc4](https://github.com/vosmol/loki-logs-downloader/commit/de0bbc47f3b2558c2b6d9f034544f984adea39cc))

### Bug Fixes 🦗

- remove forgotten it.only in test ([62764f0](https://github.com/vosmol/loki-logs-downloader/commit/62764f0c3377fda76ff948354f72b90ffbebbd47))
- support cjs,esm,ts formats together ([900c4b4](https://github.com/vosmol/loki-logs-downloader/commit/900c4b48f67951773e91461a4748002f211dd22c))
