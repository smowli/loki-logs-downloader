import assert from 'assert';
import { readFile, remove } from 'fs-extra';
import { glob } from 'glob';
import { EOL } from 'os';
import { join } from 'path';
import { beforeAll, expect, it } from 'vitest';
import { ABORT_SIGNAL, DEFAULT_LOKI_URL, FOLDERS } from '../constants';
import { createLokiClient, LokiFetchDirection } from '../loki';
import { main } from '../main';
import {
	createFetcherFactory,
	createFileSystem,
	createLogger,
	createStateStoreFactory,
} from '../services';
import { getNanoseconds, retry, wait } from '../util';

const lokiUrl = DEFAULT_LOKI_URL;
const LABELS = { app: 'test' };
const QUERY_LABELS = Object.entries(LABELS).flatMap(([key, value]) => `${key}="${value}"`);
const TEST_QUERY = `{${QUERY_LABELS}}`;
const OUTPUT_DIR = join('test-outputs', 'integration-test');
const FETCH_DIRECTION = LokiFetchDirection.FORWARD;
const RECORD_COUNT = 8000;
const FILE_RECORDS_LIMIT = 1234;
const TOTAL_RECORDS_LIMIT = 6103;

beforeAll(async () => {
	await remove(OUTPUT_DIR);

	await setupLoki({
		recordCount: RECORD_COUNT,
		labels: LABELS,
		lokiUrl,
		findQuery: TEST_QUERY,
	});
}, 60_000);

it('Downloads logs from real loki API', async () => {
	const logger = createLogger('error');
	const fileSystem = createFileSystem(OUTPUT_DIR);

	await main({
		fetcherFactory: createFetcherFactory(),
		stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
		fileSystem,
		logger,
		config: {
			query: TEST_QUERY,
			lokiUrl: lokiUrl,
			coolDown: 300,
			clearOutputDir: true,
			batchRecordsLimit: 1005,
			fileRecordsLimit: FILE_RECORDS_LIMIT,
			promptToStart: false,
			totalRecordsLimit: TOTAL_RECORDS_LIMIT,
			startFromOldest: true,
		},
	});

	const [downloadFilesPaths, stateFilesPath] = await Promise.all([
		glob(`${join(OUTPUT_DIR, FOLDERS.defaultOutputDir, FOLDERS.defaultDownloadsDir, '*.txt')}`),
		glob(`${join(OUTPUT_DIR, FOLDERS.internal, FOLDERS.state, '*.json')}`),
	]);

	const sortedDownloadFilesPaths = downloadFilesPaths.sort();

	expect(sortedDownloadFilesPaths.length).toBe(5);
	expect(stateFilesPath.length).toBe(1);

	const downloadFiles = await Promise.all(
		sortedDownloadFilesPaths.map(file =>
			readFile(file).then(content =>
				content
					.toString()
					.split(EOL)
					.filter(record => record.length > 0)
			)
		)
	);

	const lastRecord = downloadFiles.at(-1)?.at(-1);

	expect(lastRecord).toContain(`log line: ${TOTAL_RECORDS_LIMIT}`);
});

async function setupLoki({
	recordCount,
	labels,
	lokiUrl,
	findQuery,
}: {
	recordCount: number;
	labels: Record<string, string>;
	lokiUrl: string;
	findQuery: string;
}) {
	const lokiClient = createLokiClient(lokiUrl);

	await retry(20, async () => {
		const isReady = await lokiClient.isReady();

		if (!isReady) {
			await wait(2000);
			throw new Error('Loki API not ready yet. Waiting...');
		}
	});

	const checkData = async () => {
		const response = await lokiClient.query_range({
			query: findQuery,
			fetchDirection: FETCH_DIRECTION,
		});

		assert(response !== ABORT_SIGNAL);
		assert(response.status === 'success');

		const dataExists = response.data.result.some(record => record.values.length !== 0);

		return dataExists;
	};

	const dataExists = await checkData();

	if (dataExists) return;

	const batchSize = 1000;
	const batches = Math.ceil(recordCount / batchSize);

	for (let batchNumber = 0; batchNumber < batches; batchNumber++) {
		await lokiClient.push({
			streams: [
				{
					stream: labels,
					values: Array.from({ length: 1000 }).map((_, index) => {
						return [
							getNanoseconds().toString(),
							`log line: ${batchNumber * batchSize + (index + 1)}`,
						];
					}),
				},
			],
		});
	}

	await retry(20, async () => {
		const dataExists = await checkData();

		if (!dataExists) {
			await wait(2000);
			throw new Error('Data not propagated yet. Waiting...');
		}
	});
}
