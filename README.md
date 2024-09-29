# 🗃️ Loki Logs Downloader

Unofficial tool for downloading large amounts of logs from Grafana Loki API 📖

## Table of contents

- [✨ Introduction](#introduction)
- [🏃 Getting running](#getting-running)
  - [Installing](#installing)
    - [CLI](#cli)
    - [SDK](#sdk)
  - [Configuration](#configuration)
- [⌨️ Contributing](#contributing)

## ✨ Introduction

So... you want to download or migrate all the logs of a certain query from Loki, huh? 🙈

You can somewhat use logCLI - the official CLI for Loki. It is a good general CLI, but when it comes to downloading logs, it can be cumbersome and inefficient:

- https://community.grafana.com/t/how-to-gather-all-logs-for-annual-reports/99854/3
- https://community.grafana.com/t/how-can-i-download-loki-logs/70304
- https://stackoverflow.com/questions/64693913/download-logs-from-loki
- https://github.com/grafana/loki/issues/2122

Well, look no further! This is the tool you are most likely searching for, because it can download these logs like there's no tomorrow! 😎

...
<br>

On a more serious note though 🗿, this tool is optimized to download all or part of queried logs with the least possible load on the Loki server, so you don't bomb 💥 the production. This is achieved in a few ways:

- It stores the download state. If the download is not finished and you run the tool again, it continues where it previously left off = no repeated queries.
- It queries the server in smaller batches that are easier to process.
- It allows you to tweak key options affecting the server load. For example:
  - `batchLines` - the number of lines returned in a single API call (the `limit` parameter of the standard Loki API)
  - `coolDown` - the time to wait before fetching the next batch of lines
  - `totalLinesLimit` - the total limit of lines that will be fetched from the API

It also comes in both **CLI and SDK flavors**. You can run it as-is, but advanced use cases are also possible. For example, you can plug in your custom file system interface and implement things like:

- Backing up logs to remote file storage, like S3
- Migrating logs to another log management system

## 🏃 Getting running

### Installing

#### CLI:

```
npx loki-logs-downloader <...cli_params[]>
```

#### SDK:

```
npm install loki-logs-downloader
```

And check [this file](./npm-check/sdk.ts) to see simple usage - there is also **cjs** and **mjs** version right next to it

### Configuration

## ⌨️ Contributing

If something is missing or not working as expected, feel free to open an issue - PR with tests included is welcomed. 🫶

### Local development

1. Use node version `20>=` - you can run `nvm use` if you use nvm
2. Run `npm install`
3. If you want to do a test driven development run `npm run test:dev` to start tests in watch mode or `npm run test` for single test run. The majority of tests run against mocked version of Loki API.
4. If you wan't to develop against real Loki API you will need to provide your own `lokiUrl` or start Loki locally on `port 3100` with this [docker compose file](./docker-compose.yaml) by running `docker compose up -d`
5. If you wan't test against real Loki API there is a [integration test for that](./src/integration.spec.ts) which you can run with `npm run test:integration`.
   - **⚠️ Watch out, the integration test will try to push plenty of logs to the Loki API on localhost:3100 (DEFAULT_LOKI_URL) ⚠️**
6. To start dev environment:
   1. run `cp ./config.example.json ./config.json` which has `promptToStart` option (it will prompt you for a keyboard confirm before anything happens)
   2. here set `lokiUrl` to the running server
   3. run `npm run exec:dev`
