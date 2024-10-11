import { readFile, remove } from 'fs-extra';
import { glob } from 'glob';
import { EOL } from 'os';
import { join } from 'path';
import { beforeAll, beforeEach, describe, expect, it, vitest } from 'vitest';
import { DEFAULT_LOKI_URL, FOLDERS } from '../constants';
import { Config, main } from '../main';
import { State, createFileSystem, createLogger, createStateStoreFactory } from '../services';
import { getPkg, retry } from '../util';
import { createTestFetcherFactory } from './test-utils';

const pgk = getPkg();

const ROOT_OUTPUT_DIR = 'test-outputs';
const OUTPUT_NAME = 'download';

beforeAll(async () => {
	await remove(ROOT_OUTPUT_DIR);
});

it(`downloads logs with BACKWARD direction & outputs files with correct data`, async () => {
	/*
		- TESTED CASE: 
			- fetch in batch of 100
			- limit per file is 100
			- we want 140 records to be returned

		- TESTED RESULT:
			- it generates correct files:
				- 1 state file <- 1 run
				- 2 output files <- 140 / 100 (file limit)
			- files contain correct amount of records
				- 100, 40
			- records have correct data
				- check last & first timestamp
			- fetcher is called 2 times <- 1 full + 1 partial result
		*/

	const OUTPUT_DIR = join(ROOT_OUTPUT_DIR, 'single-run-test-forward');

	const testFetcher = createTestFetcherFactory({ totalRecords: 140 });
	const fromDate = new Date();

	const logger = createLogger('error');
	const fileSystem = createFileSystem(OUTPUT_DIR);

	await main({
		fetcherFactory: testFetcher,
		stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
		fileSystem,
		logger,
		version: pgk.version,
		config: {
			outputName: OUTPUT_NAME,
			query: '{app="test"}',
			lokiUrl: DEFAULT_LOKI_URL,
			coolDown: null,
			batchRecordsLimit: 100,
			clearOutputDir: true,
			fileRecordsLimit: 100,
			from: fromDate,
			promptToStart: false,
		},
	});

	const fetcherTestState = testFetcher.testData();

	// ### Check produced files

	const [downloadFilesPaths, stateFilesPath] = await Promise.all([
		glob(`${join(OUTPUT_DIR, FOLDERS.defaultOutputDir, OUTPUT_NAME, '*.txt')}`),
		glob(`${join(OUTPUT_DIR, FOLDERS.internal, FOLDERS.state, '*.json')}`),
	]);

	const sortedDownloadFilesPaths = downloadFilesPaths.sort();

	expect(sortedDownloadFilesPaths.length).toBe(2);
	expect(sortedDownloadFilesPaths[0]).toMatch(/0.txt$/);
	expect(sortedDownloadFilesPaths[1]).toMatch(/1.txt$/);
	expect(stateFilesPath.length).toBe(1);

	// ### Check fetcher state

	expect(fetcherTestState.called).toBe(2);

	// ### Check state file content

	const stateFile = await readFile(stateFilesPath[0]).then(content =>
		JSON.parse(content.toString())
	);

	expect(stateFile).toMatchObject({
		fileNumber: 1,
		queryRecordsExhausted: true,
		startFromTimestamp: fetcherTestState.lastTimestamp?.toString(),
		totalRecords: 140,
	});

	// ### Check downloaded files content

	const downloadFiles = await Promise.all(
		sortedDownloadFilesPaths.map(file =>
			readFile(file).then(content =>
				content
					.toString()
					.split(EOL)
					.filter(record => record.length > 0)
					.map(record => JSON.parse(record))
			)
		)
	);

	expect(downloadFiles[0].length).toBe(100);
	expect(downloadFiles[1].length).toBe(40);

	const [firstFileFirstLine, firstFileLastLine, lastFileFirstLine, lastFileLastLine] = [
		downloadFiles[0][0],
		downloadFiles[0].at(-1),
		downloadFiles[1][0],
		downloadFiles[1].at(-1),
	];

	expect(firstFileFirstLine.record).toContain('log line: 1');
	expect(lastFileLastLine.record).toContain('log line: 140');

	expect(firstFileFirstLine.timestamp).toBe(fromDate.toISOString());
	expect(firstFileFirstLine.timestamp).toBe(fetcherTestState.batchTimestamps[0].from.toISOString());
	expect(firstFileLastLine.timestamp).toBe(fetcherTestState.batchTimestamps[0].to.toISOString());
	expect(lastFileFirstLine.timestamp).toBe(fetcherTestState.batchTimestamps[1].from.toISOString());
	expect(lastFileLastLine.timestamp).toBe(fetcherTestState.batchTimestamps[1].to.toISOString());
});

it(`supports FORWARD direction`, async () => {
	const OUTPUT_DIR = join(ROOT_OUTPUT_DIR, 'single-run-test-backward');

	const testFetcher = createTestFetcherFactory({ totalRecords: 140 });
	const fromDate = new Date();

	const logger = createLogger('error');
	const fileSystem = createFileSystem(OUTPUT_DIR);

	await main({
		fetcherFactory: testFetcher,
		stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
		fileSystem,
		logger,
		version: pgk.version,
		config: {
			outputName: OUTPUT_NAME,
			query: '{app="test"}',
			lokiUrl: DEFAULT_LOKI_URL,
			coolDown: null,
			batchRecordsLimit: 100,
			clearOutputDir: true,
			fileRecordsLimit: 100,
			from: fromDate,
			promptToStart: false,
			startFromOldest: true,
		},
	});

	const fetcherTestState = testFetcher.testData();

	// ### Check produced files

	const [downloadFilesPaths, stateFilesPath] = await Promise.all([
		glob(`${join(OUTPUT_DIR, FOLDERS.defaultOutputDir, OUTPUT_NAME, '*.txt')}`),
		glob(`${join(OUTPUT_DIR, FOLDERS.internal, FOLDERS.state, '*.json')}`),
	]);

	const sortedDownloadFilesPaths = downloadFilesPaths.sort();

	expect(sortedDownloadFilesPaths.length).toBe(2);
	expect(sortedDownloadFilesPaths[0]).toMatch(/0.txt$/);
	expect(sortedDownloadFilesPaths[1]).toMatch(/1.txt$/);
	expect(stateFilesPath.length).toBe(1);

	// ### Check fetcher state

	expect(fetcherTestState.called).toBe(2);

	// ### Check state file content

	const stateFile = await readFile(stateFilesPath[0]).then(content =>
		JSON.parse(content.toString())
	);

	expect(stateFile).toMatchObject({
		fileNumber: 1,
		queryRecordsExhausted: true,
		startFromTimestamp: fetcherTestState.lastTimestamp?.toString(),
		totalRecords: 140,
	});

	// ### Check downloaded files content

	const downloadFiles = await Promise.all(
		sortedDownloadFilesPaths.map(file =>
			readFile(file).then(content =>
				content
					.toString()
					.split(EOL)
					.filter(record => record.length > 0)
					.map(record => JSON.parse(record))
			)
		)
	);

	expect(downloadFiles[0].length).toBe(100);
	expect(downloadFiles[1].length).toBe(40);

	const [firstFileFirstLine, lastFileLastLine] = [downloadFiles[0][0], downloadFiles[1].at(-1)];

	expect(firstFileFirstLine.record).toContain('log line: 140');
	expect(lastFileLastLine.record).toContain('log line: 1');
});

it(`downloads logs & recovers state`, async () => {
	const OUTPUT_DIR = join(ROOT_OUTPUT_DIR, 'retry-run-test');

	const testFetcher = createTestFetcherFactory({
		totalRecords: 590,
		onCalled({ called }) {
			if (called % 2 === 0) {
				throw new Error('fail for retry');
			}
		},
	});

	const logger = createLogger('error');
	const fileSystem = createFileSystem(OUTPUT_DIR);

	const to = new Date();

	await retry(5, () =>
		main({
			fetcherFactory: testFetcher,
			stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
			fileSystem,
			logger,
			version: pgk.version,
			config: {
				outputName: OUTPUT_NAME,
				query: '{app="test"}',
				lokiUrl: DEFAULT_LOKI_URL,
				coolDown: null,
				batchRecordsLimit: 200,
				clearOutputDir: true,
				promptToStart: false,
				fileRecordsLimit: 300,
				to,
			},
		})
	);

	const fetcherTestState = testFetcher.testData();

	// ### Check produced files

	const [downloadFilesPaths, stateFilesPath] = await Promise.all([
		glob(`${join(OUTPUT_DIR, FOLDERS.defaultOutputDir, OUTPUT_NAME, '*.txt')}`),
		glob(`${join(OUTPUT_DIR, FOLDERS.internal, FOLDERS.state, '*.json')}`),
	]);

	const sortedDownloadFilesPaths = downloadFilesPaths.sort();

	expect(sortedDownloadFilesPaths.length).toBe(2);
	expect(stateFilesPath.length).toBe(1);

	// ### Check fetcher state

	expect(fetcherTestState.called).toBe(5);

	// ### Check state file content

	const stateFile = await readFile(stateFilesPath[0]).then(content =>
		JSON.parse(content.toString())
	);

	expect(stateFile).toMatchObject({
		fileNumber: 1,
		queryRecordsExhausted: true,
		startFromTimestamp: fetcherTestState.lastTimestamp?.toString(),
		totalRecords: 590,
	});

	// ### Check downloaded files content

	const downloadFiles = await Promise.all(
		sortedDownloadFilesPaths.map(file =>
			readFile(file).then(content =>
				content
					.toString()
					.split(EOL)
					.filter(record => record.length > 0)
					.map(record => JSON.parse(record))
			)
		)
	);

	expect(downloadFiles[0].length).toBe(300);
	expect(downloadFiles[1].length).toBe(290);
});

it('aborts properly on abort signal', async () => {
	const OUTPUT_DIR = join(ROOT_OUTPUT_DIR, 'abort-test');

	const abortController = new AbortController();

	const testFetcher = createTestFetcherFactory({
		totalRecords: 5000,
		onCalled({ called }) {
			// abort after first call
			if (called > 1) {
				abortController.abort();
			}
		},
	});

	const fileSystem = {
		...createFileSystem(OUTPUT_DIR),
		async saveState(path: string, state: State) {
			resultState = state;
		},
	};
	const logger = createLogger('error');

	let resultState = {};

	await main({
		fetcherFactory: testFetcher,
		stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
		fileSystem,
		logger,
		abortController,
		version: pgk.version,
		config: {
			outputName: OUTPUT_NAME,
			query: '{app="test"}',
			lokiUrl: DEFAULT_LOKI_URL,
			coolDown: null,
			batchRecordsLimit: 1000,
			clearOutputDir: true,
			promptToStart: false,
		},
	});

	const fetcherTestState = testFetcher.testData();

	expect(fetcherTestState.called).toBe(2);

	expect(resultState).toMatchObject({
		fileNumber: 0,
		queryRecordsExhausted: false,
		startFromTimestamp: fetcherTestState.lastTimestamp?.toString(),
		totalRecords: 1000,
	});
});

it('uses config file if option is set', async () => {
	const OUTPUT_DIR = join(ROOT_OUTPUT_DIR, 'config-test');

	const configFilePath = '/app/usr/config.json';

	const logger = createLogger('error');

	const testFs = createFileSystem(OUTPUT_DIR);
	const readConfigMock = vitest.fn().mockImplementation(() => {
		return JSON.stringify({
			query: '{}',
			lokiUrl: DEFAULT_LOKI_URL,
			promptToStart: false,
		});
	});

	const fileSystem = {
		...testFs,
		readConfig: readConfigMock,
	};

	await main({
		fetcherFactory: createTestFetcherFactory({ totalRecords: 0 }),
		stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
		fileSystem,
		logger,
		version: pgk.version,
		config: {
			configFile: configFilePath,
		},
	});

	expect(readConfigMock).toBeCalledTimes(1);
	expect(readConfigMock).toBeCalledWith(configFilePath);
});

describe('different configs', () => {
	const OUTPUT_DIR = join(ROOT_OUTPUT_DIR, 'all-configs-test');

	beforeEach(async () => {
		await remove(OUTPUT_DIR);
	});

	it.each([
		[{ totalRecordsLimit: 500 }, { files: 1, fetcherCalls: 1 }],
		[{ totalRecordsLimit: 5000 }, { files: 1, fetcherCalls: 1 }],
		[{ fileRecordsLimit: 100 }, { files: 10, fetcherCalls: 1 }],
		[{ batchRecordsLimit: 10 }, { files: 1, fetcherCalls: 98 }],
		[{ batchRecordsLimit: 5000 }, { files: 1, fetcherCalls: 1 }],
	] as Array<[Partial<Config>, { files: number; fetcherCalls: 1 }]>)(
		`%s configs behave as expected`,
		async (configs, result) => {
			const testFetcher = createTestFetcherFactory({ totalRecords: 971 });

			const logger = createLogger('error');
			const fileSystem = createFileSystem(OUTPUT_DIR);

			await main({
				fetcherFactory: testFetcher,
				stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
				fileSystem,
				logger,
				version: pgk.version,
				config: {
					outputName: OUTPUT_NAME,
					query: '{app="test"}',
					lokiUrl: DEFAULT_LOKI_URL,
					coolDown: null,
					promptToStart: false,
					...configs,
				},
			});

			const [downloadFilesPaths, stateFilesPath] = await Promise.all([
				glob(`${join(OUTPUT_DIR, FOLDERS.defaultOutputDir, OUTPUT_NAME, '*.txt')}`),
				glob(`${join(OUTPUT_DIR, FOLDERS.internal, FOLDERS.state, '*.json')}`),
			]);

			const sortedDownloadFilesPaths = downloadFilesPaths.sort();
			const fetcherTestState = testFetcher.testData();

			expect(sortedDownloadFilesPaths.length).toBe(result.files);
			expect(stateFilesPath.length).toBe(1);
			expect(fetcherTestState.called).toBe(result.fetcherCalls);
		}
	);
});

describe('state files', () => {
	const OUTPUT_DIR = join(ROOT_OUTPUT_DIR, 'state-files-test');

	beforeEach(async () => {
		await remove(OUTPUT_DIR);
	});

	it.each([
		[
			'outputName', //
			{ outputName: 'a' },
			{ outputName: 'b' },
			{ outputName: 'c' },
			{ outputName: 'd' },
		],
		[
			'outputFolder', //
			{ outputFolder: 'a' },
			{ outputFolder: 'b' },
			{ outputFolder: 'c' },
		],
		[
			'lokiUrl', //
			{ lokiUrl: 'a' },
			{ lokiUrl: 'b' },
		],
		[
			'query', //
			{ query: 'a' },
			{ query: 'b' },
		],
		[
			'from', //
			{ from: new Date().toISOString() },
			{ from: new Date(Date.now() + 1000).toISOString() },
		],
		[
			'to', //
			{ to: new Date().toISOString() },
			{ to: new Date(Date.now() + 1000).toISOString() },
		],
		[
			'fileRecordsLimit', //
			{ fileRecordsLimit: 100 },
			{ fileRecordsLimit: 1000 },
		],
	] as Array<[keyof Config, ...Partial<Config>[]]>)(
		`generates new state file when %s changes`,
		async (...testConfigs) => {
			const [, ...configs] = testConfigs;

			const logger = createLogger('error');
			const fileSystem = createFileSystem(OUTPUT_DIR);

			for (const option of configs) {
				await main({
					fetcherFactory: createTestFetcherFactory({ totalRecords: 0 }),
					stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
					fileSystem,
					logger,
					version: pgk.version,
					config: {
						outputName: OUTPUT_NAME,
						query: '{app="test"}',
						lokiUrl: DEFAULT_LOKI_URL,
						coolDown: null,
						promptToStart: false,
						...option,
					},
				});
			}

			const stateFilesPath = await glob(
				`${join(OUTPUT_DIR, FOLDERS.internal, FOLDERS.state, '*.json')}`
			);

			expect(stateFilesPath.length).toBe(configs.length);
		}
	);
});
