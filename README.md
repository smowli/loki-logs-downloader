# 🗃️ Loki Logs Downloader

Unofficial tool for downloading large amounts of logs from the Grafana Loki API 📖

> ⚠️ This tool is still under active development. It is quite capable, but some features might still be missing. There also may be changes to the API and the behavior in the future. ⚠️

## Table of contents

- [✨ Introduction](#-introduction)
- [🏃 Getting started](#-getting-started)
  - [Installation](#installation)
    - [CLI](#cli)
    - [SDK](#sdk)
  - [Configuration](#configuration)
- [⌨️ Contributing](#️-contributing)

## ✨ Introduction

So... you want to download or migrate all the logs of a certain query from Loki, huh? 🙈

You can somewhat use logCLI - the official CLI for Loki. It is a good general CLI, but when it comes to downloading logs, it can be cumbersome and inefficient:

- https://community.grafana.com/t/how-to-gather-all-logs-for-annual-reports/99854/3
- https://community.grafana.com/t/how-can-i-download-loki-logs/70304
- https://stackoverflow.com/questions/64693913/download-logs-from-loki
- https://github.com/grafana/loki/issues/2122

Well, look no further! This is the tool you are most likely searching for because it can download these logs like there’s no tomorrow! 😎

...
<br>

On a more serious note, though 🗿, this tool is optimized to download all or part of queried logs with the least possible load on the Loki server, so you don't bomb 💥 the production. This is achieved in a few ways:

- It stores the download state. If the download is not finished and you run the tool again with the same params it continues from where it previously left off = no repeated queries. Watch out for `from` & `to` options! If not set, default time [now - 1h] range will be different per run.
- It queries the server in smaller batches that are easier to process.
- It allows you to tweak key options affecting server load. For example:
  - `batchRecords` - the number of records returned in a single API call (the `limit` parameter of the standard Loki API)
  - `coolDown` - the time to wait before fetching the next batch of records
  - `totalRecordsLimit` - the total limit of records that will be fetched from the API

It also comes in both **CLI and SDK flavors**. You can run it as-is, but advanced use cases are also possible. For example, you can plug in your custom file system interface and implement things like:

- Backing up logs to remote file storage, like S3
- Migrating logs to another log management system

## 🏃 Getting Started

### Installation & Usage

The package is published at [npm](https://www.npmjs.com/package/loki-logs-downloader)

#### CLI:

Execute it through npx

```bash
npx loki-logs-downloader <...cli_params[]>
```

##### Examples

For list of all params use -h, --help flag:

```bash
npx loki-logs-downloader -h
```

Download logs for a whole day:

```bash
npx loki-logs-downloader \
  --lokiUrl http://localhost:3100 \
  --query '{app="test"}' \
  --from 2024-10-03T00:00:00.000Z \
  --to 2024-10-03T24:00:00.000Z \
  --fileRecordsLimit 1000 \
  --coolDown 1000
```

You can also provide same params with a json config file:

```bash
echo '{
"lokiUrl": "http://localhost:3100",
"query": "{app=\"test\"}",
"from": "2024-10-03T00:00:00.000Z",
"to": "2024-10-03T24:00:00.000Z",
"fileRecordsLimit": 1000,
"coolDown": 1000
}' > ./config.json

npx loki-logs-downloader --configFile ./config.json
```

#### SDK:

```bash
npm install loki-logs-downloader
```

And check [./dev/npm-check/sdk.ts](./dev/npm-check/sdk.ts) to see simple usage. There are also **cjs** and **mjs** versions right next to it.

### Configuration

Both CLI and SDK have same options. You can run the CLI with -h flag to see more information and flag aliases.

To see all available config options refer to [./config-schema.json](./config-schema.json)

## ⌨️ Contributing

If something is missing or not working as expected, feel free to open an issue—PRs with tests included are welcomed. 🫶

### Local Development & Testing

1. Use Node version `20>=` - you can run `nvm use` if you use nvm.
2. Run `npm install`
3. If you want to do test-driven development, run `npm run test:dev` to start tests in watch mode or `npm run test` for a single test run. The majority of tests run against a mocked version of the Loki API.
4. If you want to develop against the real Loki API, you will need to provide your own `lokiUrl` or start Loki locally on `port 3100` with this [docker compose file](./docker-compose.yaml) by running `docker compose up -d`
5. If you want to test against the real Loki API, there is an [integration test for that](./src/integration.spec.ts) which you can run with `npm run test:integration`
   - **⚠️ Watch out: the integration test will try to push plenty of logs to the Loki API on localhost:3100 (DEFAULT_LOKI_URL) ⚠️**
6. To start the dev environment:

   1. Run `cp ./config.example.json ./config.json`, which has the `promptToStart` option (it will prompt you for keyboard confirmation before anything happens).
   2. Here in the `config.json` set `lokiUrl` to the running server.
   3. Run `npm run exec:dev`
