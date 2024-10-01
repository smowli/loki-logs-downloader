import { readFile, remove } from 'fs-extra';
import { glob } from 'glob';
import { EOL } from 'os';
import { join } from 'path';
import { beforeAll, beforeEach, describe, expect, it, vitest } from 'vitest';
import { DEFAULT_LOKI_URL, FOLDERS } from './constants';
import { Config, main } from './main';
import { Fetcher, LokiRecord, createFileSystem, createLogger, createStateStore } from './services';
import { getNanoseconds, nanosecondsToMilliseconds, retry } from './util';

const ROOT_OUTPUT_DIR = 'test-outputs';
const OUTPUT_NAME = 'download';

beforeAll(async () => {
	await remove(ROOT_OUTPUT_DIR);
});

it(`downloads logs & outputs files with correct data`, async () => {
	/*
		- TESTED CASE: 
			- fetch in batch of 100
			- limit per file is 100
			- we want 140 lines to be returned

		- TESTED RESULT:
			- it generates correct files:
				- 1 state file <- 1 run
				- 2 output files <- 140 / 100 (file limit)
			- files contain correct amount of lines
				- 100, 40
			- lines have correct data
				- check last & first timestamp
			- fetcher is called 2 times <- 1 full + 1 partial result
		*/

	const OUTPUT_DIR = join(ROOT_OUTPUT_DIR, 'single-run-test');

	const testFetcher = testFetcherFactory({ totalLines: 140 });
	const fromDate = new Date();

	await main({
		fetcherFactory: () => testFetcher,
		fileSystemFactory: () => createFileSystem(OUTPUT_DIR),
		stateStoreFactory: createStateStore,
		loggerFactory: () => createLogger('error'),
		config: {
			outputName: OUTPUT_NAME,
			query: '{app="test"}',
			lokiUrl: DEFAULT_LOKI_URL,
			coolDown: null,
			batchLinesLimit: 100,
			clearOutputDir: true,
			fileLinesLimit: 100,
			from: fromDate.toISOString(),
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
		queryLinesExhausted: true,
		startFromTimestamp: fetcherTestState.lastTimestamp?.toString(),
		totalLines: 140,
	});

	// ### Check downloaded files content

	const downloadFiles = await Promise.all(
		sortedDownloadFilesPaths.map(file =>
			readFile(file).then(content =>
				content
					.toString()
					.split(EOL)
					.filter(line => line.length > 0)
					.map(line => JSON.parse(line))
			)
		)
	);

	expect(downloadFiles[0].length).toBe(100);
	expect(downloadFiles[1].length).toBe(40);

	const [firstLineFile0, lastLineFile0, firstLineFile1, lastLineFile1] = [
		downloadFiles[0][0],
		downloadFiles[0].at(-1),
		downloadFiles[1][0],
		downloadFiles[1].at(-1),
	];

	expect(firstLineFile0.timestamp).toBe(fromDate.toISOString());
	expect(firstLineFile0.timestamp).toBe(fetcherTestState.batchTimestamps[0].from.toISOString());
	expect(lastLineFile0.timestamp).toBe(fetcherTestState.batchTimestamps[0].to.toISOString());
	expect(firstLineFile1.timestamp).toBe(fetcherTestState.batchTimestamps[1].from.toISOString());
	expect(lastLineFile1.timestamp).toBe(fetcherTestState.batchTimestamps[1].to.toISOString());
});

it(`downloads logs & recovers state`, async () => {
	const OUTPUT_DIR = join(ROOT_OUTPUT_DIR, 'retry-run-test');

	const testFetcher = testFetcherFactory({
		totalLines: 590,
		customHandler({ called }) {
			if (called % 2 === 0) {
				throw new Error('fail for retry');
			}
		},
	});

	await retry(5, () =>
		main({
			fetcherFactory: () => testFetcher,
			fileSystemFactory: () => createFileSystem(OUTPUT_DIR),
			stateStoreFactory: createStateStore,
			loggerFactory: () => createLogger('error'),
			config: {
				outputName: OUTPUT_NAME,
				query: '{app="test"}',
				lokiUrl: DEFAULT_LOKI_URL,
				coolDown: null,
				batchLinesLimit: 200,
				clearOutputDir: true,
				promptToStart: false,
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

	expect(sortedDownloadFilesPaths.length).toBe(1);
	expect(stateFilesPath.length).toBe(1);

	// ### Check fetcher state

	expect(fetcherTestState.called).toBe(5);

	// ### Check state file content

	const stateFile = await readFile(stateFilesPath[0]).then(content =>
		JSON.parse(content.toString())
	);

	expect(stateFile).toMatchObject({
		fileNumber: 0,
		queryLinesExhausted: true,
		startFromTimestamp: fetcherTestState.lastTimestamp?.toString(),
		totalLines: 590,
	});

	// ### Check downloaded files content

	const downloadFiles = await Promise.all(
		sortedDownloadFilesPaths.map(file =>
			readFile(file).then(content =>
				content
					.toString()
					.split(EOL)
					.filter(line => line.length > 0)
					.map(line => JSON.parse(line))
			)
		)
	);

	expect(downloadFiles[0].length).toBe(590);
});

it('uses config file if option is set', async () => {
	const OUTPUT_DIR = join(ROOT_OUTPUT_DIR, 'config-test');

	const configFilePath = '/app/usr/config.json';

	const testFs = createFileSystem(OUTPUT_DIR);
	const readConfigMock = vitest.fn().mockImplementation(() => {
		return JSON.stringify({
			query: '{}',
			lokiUrl: DEFAULT_LOKI_URL,
			promptToStart: false,
		});
	});

	await main({
		fetcherFactory: () => testFetcherFactory({ totalLines: 0 }),
		fileSystemFactory: () => ({
			...testFs,
			readConfig: readConfigMock,
		}),
		stateStoreFactory: createStateStore,
		loggerFactory: () => createLogger('error'),
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
		[{ totalLinesLimit: 500 }, { files: 1, fetcherCalls: 1 }],
		[{ totalLinesLimit: 5000 }, { files: 1, fetcherCalls: 1 }],
		[{ fileLinesLimit: 100 }, { files: 10, fetcherCalls: 1 }],
		[{ batchLinesLimit: 10 }, { files: 1, fetcherCalls: 98 }],
		[{ batchLinesLimit: 5000 }, { files: 1, fetcherCalls: 1 }],
	] as Array<[Partial<Config>, { files: number; fetcherCalls: 1 }]>)(
		`%s configs behave as expected`,
		async (configs, result) => {
			const testFetcher = testFetcherFactory({ totalLines: 971 });

			await main({
				fetcherFactory: () => testFetcher,
				fileSystemFactory: () => createFileSystem(OUTPUT_DIR),
				stateStoreFactory: createStateStore,
				loggerFactory: () => createLogger('error'),
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
			'fileLinesLimit', //
			{ fileLinesLimit: 100 },
			{ fileLinesLimit: 1000 },
		],
	] as Array<[keyof Config, ...Partial<Config>[]]>)(
		`generates new state file when %s changes`,
		async (...testConfigs) => {
			const [, ...configs] = testConfigs;

			for (const option of configs) {
				await main({
					fetcherFactory: () => testFetcherFactory({ totalLines: 0 }),
					fileSystemFactory: () => createFileSystem(OUTPUT_DIR),
					stateStoreFactory: createStateStore,
					loggerFactory: () => createLogger('error'),
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

function testFetcherFactory(options: {
	totalLines: number;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	customHandler?: (state: { called: number }) => any;
}): {
	init: (options: { lokiUrl: string }) => Fetcher;
	testData: () => {
		lastTimestamp: bigint | undefined;
		batchTimestamps: { from: Date; to: Date }[];
		called: number;
	};
} {
	let lastTimestamp: bigint | undefined;
	let called = 0;
	const batchTimestamps: { from: Date; to: Date }[] = [];
	let remainingLines = options.totalLines;

	return {
		testData: () => ({
			called,
			lastTimestamp,
			batchTimestamps,
		}),
		init() {
			return async ({ from, limit }) => {
				called++;

				if (remainingLines === 0) return { returnedLines: [] };

				const lineCount = Math.min(limit, remainingLines);

				const getRecord = (increment = 0) => {
					const date = new Date(Number(nanosecondsToMilliseconds(from)) + increment);
					return {
						line: '-',
						rawTimestamp: getNanoseconds(date),
						timestamp: date,
					};
				};

				const lines: LokiRecord[] = Array.from({ length: lineCount }).map((_, index) =>
					getRecord(index)
				);

				const pointer = lineCount === limit ? getRecord(limit + 1) : lines.at(-1)!;

				batchTimestamps.push({
					from: lines[0].timestamp,
					to: lines.at(-1)!.timestamp,
				});

				const data = options.customHandler?.({ called }) || {
					returnedLines: lines,
					pointer: pointer,
				};

				lastTimestamp = pointer.rawTimestamp;
				remainingLines -= lineCount;

				return data;
			};
		},
	};
}
