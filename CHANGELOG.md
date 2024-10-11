## [4.0.0](https://github.com/smowli/loki-logs-downloader/compare/3.2.0...4.0.0) (2024-10-11)

### ⚠ BREAKING CHANGES

- use release version in state integrity key
- same errors don't log and straight throw
- improve error handling
- support both query directions

### refactor

- same errors don't log and straight throw ([e3397f7](https://github.com/smowli/loki-logs-downloader/commit/e3397f70af3bac6ea4234fc01d15242a425e2e75))

### Features 🚀

- improve error handling ([bc5772c](https://github.com/smowli/loki-logs-downloader/commit/bc5772cf8e8fb672f20f10b52a46e7d9f2f38e82))
- support both query directions ([5031488](https://github.com/smowli/loki-logs-downloader/commit/5031488283c91b2f9af8971ce0d49da444fbf5f6))
- use release version in state integrity key ([2eb59f0](https://github.com/smowli/loki-logs-downloader/commit/2eb59f01a9091c47473b708b5fbd7072b14c462a))

## [3.2.0](https://github.com/smowli/loki-logs-downloader/compare/3.1.0...3.2.0) (2024-10-10)

### Features 🚀

- update username reference ([3b535bf](https://github.com/smowli/loki-logs-downloader/commit/3b535bf0c14a8db8f464f8ed0b1f5abe816a6939))

### Bug Fixes 🦗

- correct test path ([b58b5ab](https://github.com/smowli/loki-logs-downloader/commit/b58b5ab56d2ccac10ebc37edf997236f619e49cb))
- forward abort controller argument ([b309297](https://github.com/smowli/loki-logs-downloader/commit/b309297a1d5e7be67268b0e8db23e81c57d9f59a))

## [3.1.0](https://github.com/smowli/loki-logs-downloader/compare/3.0.7...3.1.0) (2024-10-06)

### Features 🚀

- add user friendly zod error handler ([e9e8e8f](https://github.com/smowli/loki-logs-downloader/commit/e9e8e8f2f6b16cc3815e88d37be10b946c2d79b7))

### Bug Fixes 🦗

- sdk not using provided logger & fs from outside ([f928818](https://github.com/smowli/loki-logs-downloader/commit/f928818b7d877dd931b22ec1620d9aa4b49f21c8))
