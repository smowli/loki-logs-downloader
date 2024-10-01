import { readFile, remove } from 'fs-extra';
import { glob } from 'glob';
import { EOL } from 'os';
import { join } from 'path';
import { beforeAll, expect, it } from 'vitest';
import { DEFAULT_LOKI_URL, FOLDERS } from './constants';
import { createLokiClient } from './loki';
import { main } from './main';
import { createFetcher, createFileSystem, createLogger, createStateStore } from './services';
import { getNanoseconds } from './util';
import assert from 'assert';

const lokiUrl = DEFAULT_LOKI_URL;
const LABELS = { app: 'test' };
const QUERY_LABELS = Object.entries(LABELS).flatMap(([key, value]) => `${key}="${value}"`);
const TEST_QUERY = `{${QUERY_LABELS}}`;
const OUTPUT_DIR = join('test-outputs', 'integration-test');

beforeAll(async () => {
	await remove(OUTPUT_DIR);

	await setupLoki({
		recordCount: 8000,
		labels: LABELS,
		lokiUrl,
		findQuery: TEST_QUERY,
	});
});

it('Downloads logs from real loki API', {}, async () => {
	const totalRecordsLimit = 6103;

	await main({
		fetcherFactory: createFetcher,
		fileSystemFactory: () => createFileSystem(OUTPUT_DIR),
		stateStoreFactory: createStateStore,
		loggerFactory: () => createLogger('error'),
		config: {
			query: TEST_QUERY,
			lokiUrl: lokiUrl,
			coolDown: 300,
			clearOutputDir: true,
			totalRecordsLimit: totalRecordsLimit,
			batchRecordsLimit: 1005,
			fileRecordsLimit: 1234,
			promptToStart: false,
		},
	});

	const [downloadFilesPaths, stateFilesPath] = await Promise.all([
		glob(`${join(OUTPUT_DIR, FOLDERS.defaultOutputDir, FOLDERS.defaultDownloadsDir, '*.txt')}`),
		glob(`${join(OUTPUT_DIR, FOLDERS.internal, FOLDERS.state, '*.json')}`),
	]);

	const sortedDownloadFilesPaths = downloadFilesPaths.sort();

	expect(sortedDownloadFilesPaths.length).toBe(5);
	expect(stateFilesPath.length).toBe(1);

	const lastDownloadFile = await readFile(sortedDownloadFilesPaths.at(-1)!).then(content =>
		content
			.toString()
			.split(EOL)
			.filter(record => record.length > 0)
	);

	const lastRecord = lastDownloadFile.at(-1);

	expect(lastRecord).toContain(`log line: ${totalRecordsLimit}`);
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

	const existingData = await lokiClient.query_range({ query: findQuery });

	assert(existingData.status === 'success');

	const dataExists = existingData.data.result.some(record => record.values.length !== 0);

	if (!dataExists) {
		console.log('pushing test logs to loki');

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
	}
}
