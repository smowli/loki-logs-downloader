import {
	appendFile,
	emptyDir,
	ensureDir,
	exists,
	pathExists,
	readFile,
	readdir,
	writeFile,
} from 'fs-extra';
import md5 from 'md5';
import { EOL } from 'os';
import { dirname, join } from 'path';
import { z } from 'zod';
import { ABORT_SIGNAL, FOLDERS } from './constants';
import { createLokiClient } from './loki';
import { nanosecondsToMilliseconds, secondsToMilliseconds } from './util';

const stateSchema = z.object({
	startFromTimestamp: z.string(),
	totalRecords: z.number(),
	queryRecordsExhausted: z.boolean(),
	fileNumber: z.number(),
	iteration: z.number(),
	prevSavedRecordsInFile: z.number(),
});

export type State = z.infer<typeof stateSchema>;

export interface StateStore {
	load: () => Promise<State | undefined>;
	/* save state to continue from if terminated */
	save: (state: State) => Promise<void>;
}

export type StateStoreFactory = {
	create: (...inputs: string[]) => StateStore;
};

export const createStateStoreFactory = ({
	fileSystem: fs,
	logger,
}: {
	fileSystem: FileSystem;
	logger: Logger;
}): StateStoreFactory => {
	return {
		create(...inputs) {
			const integrityKey = md5(inputs.join('-'));
			const statePath = join(FOLDERS.internal, FOLDERS.state, `${integrityKey}.json`);

			return {
				async load() {
					const state = await fs.loadState(statePath);

					if (!state) return;

					logger.info(
						'🚀',
						`found previous state under ${integrityKey}. Continuing where left off`
					);

					return stateSchema.parse(JSON.parse(state));
				},
				async save(state) {
					await fs.saveState(statePath, state);
				},
			};
		},
	};
};

export interface Logger {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	error: (emoji: string | null, ...args: any[]) => void;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	info: (emoji: string | null, ...args: any[]) => void;
}

export type LogLevel = 'info' | 'error';

const logLevelMap: Record<LogLevel, number> = {
	info: 1,
	error: 0,
};

export const createLogger = (level: LogLevel = 'error', pretty: boolean = true): Logger => {
	const isLowerLogLevel = (level: LogLevel, compareTo: LogLevel) =>
		logLevelMap[level] < logLevelMap[compareTo];

	return {
		error(...[emoji, ...args]) {
			if (isLowerLogLevel(level, 'error')) return;

			if (pretty) {
				console.error('[ERROR]', ...[emoji, ...args]);
				return;
			}

			console.error('[ERROR]', ...args);
		},
		info(...[emoji, ...args]) {
			if (isLowerLogLevel(level, 'info')) return;

			if (pretty) {
				console.error('[INFO]', ...[emoji, ...args]);
				return;
			}

			console.log('[INFO]', ...args);
		},
	};
};

export interface FileSystem {
	readOutputDir: (path: string) => Promise<{ exists: boolean; isEmpty: boolean }>;
	outputLogs: (fileName: string, logs: LokiRecord[]) => Promise<void>;
	emptyOutputDir: (path: string) => Promise<void>;
	readConfig: (path: string) => Promise<string>;
	saveState: (path: string, state: State) => Promise<void>;
	loadState: (path: string) => Promise<string | undefined>;
}

export const createFileSystem = (rootDir: string = ''): FileSystem => {
	const getFullPath = (path: string) => join(rootDir, path);

	async function getDirData(path: string) {
		const dirPath = dirname(path);

		const exists = await pathExists(dirPath);

		if (!exists) {
			return { exists: false, isEmpty: false };
		}

		const contents = await readdir(dirPath);

		return {
			exists,
			isEmpty: contents.length === 0,
		};
	}

	async function saveFile(path: string, data: string, options?: { append: boolean }) {
		const fullPath = getFullPath(path);

		await ensureDir(dirname(fullPath));

		const method = options?.append ? appendFile : writeFile;

		await method(fullPath, data);
	}

	return {
		async readOutputDir(path) {
			const fullPath = getFullPath(path);

			return getDirData(fullPath);
		},
		async emptyOutputDir(path) {
			const fullPath = getFullPath(path);

			return emptyDir(fullPath);
		},
		async outputLogs(fileName, logs) {
			return saveFile(
				fileName,
				`${logs
					.map(data =>
						JSON.stringify({
							...data,
							rawTimestamp: data.rawTimestamp.toString(),
						})
					)
					.join(EOL)}${EOL}`,
				{ append: true }
			);
		},
		async readConfig(path) {
			const fullPath = getFullPath(path);

			return (await readFile(fullPath)).toString();
		},
		async loadState(path) {
			const fullPath = getFullPath(path);

			if (!(await exists(fullPath))) return;

			return (await readFile(fullPath)).toString();
		},
		async saveState(path, state) {
			return saveFile(path, JSON.stringify(state));
		},
	};
};

export interface LokiRecord {
	timestamp: Date;
	rawTimestamp: bigint;
	record: string;
}

export interface FetcherResult {
	returnedRecords: LokiRecord[];
	pointer: LokiRecord | undefined;
}

export interface Fetcher {
	(options: {
		from: bigint;
		to: Date;
		query: string;
		limit: number;
		abort: AbortSignal;
	}): Promise<FetcherResult>;
}

export type FetcherFactory = {
	create: (options: { lokiUrl: string; getAdditionalHeaders?: () => Headers }) => Fetcher;
};

export const createFetcherFactory = (): FetcherFactory => {
	return {
		create({ lokiUrl, getAdditionalHeaders }) {
			const lokiClient = createLokiClient(lokiUrl);

			return async ({ query, limit, from, to, abort }) => {
				const recordCount = limit + 1; // +1 for pointer

				const additionalHeaders = getAdditionalHeaders?.();

				const data = await lokiClient.query_range({
					query,
					limit: recordCount,
					from,
					to,
					additionalHeaders,
					abort,
				});

				if (data === ABORT_SIGNAL) {
					return { returnedRecords: [], pointer: undefined };
				}

				const output = data.data.result.flatMap(result => {
					return result.values.flatMap(([timestamp, record]): LokiRecord => {
						// loki API returns different format for each resultType
						const date = new Date(
							data.data.resultType === 'matrix'
								? secondsToMilliseconds(Number(timestamp))
								: nanosecondsToMilliseconds(Number(timestamp))
						);

						return {
							timestamp: date,
							rawTimestamp: BigInt(timestamp),
							record,
						};
					});
				});

				const pointer = output.at(-1) as LokiRecord | undefined;
				const returnedRecords = output.slice(0, limit) as LokiRecord[];

				return { returnedRecords, pointer };
			};
		},
	};
};
