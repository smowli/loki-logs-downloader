import {
	appendFile,
	emptyDir,
	ensureDir,
	exists,
	pathExists,
	readJson,
	readdir,
	writeFile,
} from 'fs-extra';
import { dirname, join } from 'path';
import { FOLDERS } from './constants';
import { createLokiClient } from './loki';
import md5 from 'md5';

interface State {
	startFromTimestamp: string;
	totalLines: number;
	queryLinesExhausted: boolean;
	fileNumber: number;
	iteration: number;
}

export interface StateStore {
	load: () => Promise<State | undefined>;
	/* save state to continue from if terminated */
	save: (state: State) => Promise<void>;
}

export type StateStoreFactory = (params: { fs: FileSystem; logger: Logger }) => {
	init: (...inputs: string[]) => StateStore;
};

export const createStateStore: StateStoreFactory = ({ fs, logger }) => {
	return {
		init(...inputs) {
			const integrityKey = md5(inputs.join('-'));
			const statePath = join(FOLDERS.internal, FOLDERS.state, `${integrityKey}.json`);

			return {
				async load() {
					if (!(await fs.exists(statePath))) return;

					const state = (await fs.readJson(statePath)) as State;

					logger.info(
						`Found previous state ${JSON.stringify(
							state
						)} at ${statePath}. Continuing where left off.`
					);

					return state;
				},
				async save(state) {
					await fs.saveFile(statePath, JSON.stringify({ ...state }));
				},
			};
		},
	};
};

export interface Logger {
	error: (...args: any[]) => void;
	info: (...args: any[]) => void;
}

export type LogLevel = 'info' | 'error';

export type LoggerFactory = (level?: LogLevel) => Logger;

const logLevelMap: Record<LogLevel, number> = {
	info: 1,
	error: 0,
};

export const createLogger: LoggerFactory = (level = 'info') => {
	const isLowerLogLevel = (level: LogLevel, compareTo: LogLevel) =>
		logLevelMap[level] < logLevelMap[compareTo];

	return {
		error(...args) {
			if (isLowerLogLevel(level, 'error')) return;
			console.error('[ERROR]', ...args);
		},
		info(...args) {
			if (isLowerLogLevel(level, 'info')) return;
			console.log('[INFO]', ...args);
		},
	};
};

export interface FileSystem {
	saveFile: (path: string, data: string, options?: { append?: boolean }) => Promise<void>;
	readJson: (path: string) => Promise<object>;
	emptyDir: (path: string) => Promise<void>;
	exists: (path: string) => Promise<boolean>;
	getDirData: (path: string) => Promise<{ exists: boolean; isEmpty: boolean }>;
}

export type FileSystemFactory = (rootDir?: string) => FileSystem;

export const createFileSystem: FileSystemFactory = (rootDir = '') => {
	const getFullPath = (path: string) => join(rootDir, path);

	return {
		async saveFile(path, data, options) {
			const fullPath = getFullPath(path);

			await ensureDir(dirname(fullPath));

			const method = options?.append ? appendFile : writeFile;

			await method(fullPath, data);
		},
		async readJson(path) {
			const fullPath = getFullPath(path);

			return readJson(fullPath);
		},
		async emptyDir(path) {
			const fullPath = getFullPath(path);

			return emptyDir(fullPath);
		},
		async exists(path) {
			const fullPath = getFullPath(path);

			return exists(fullPath);
		},
		async getDirData(path) {
			const fullPath = getFullPath(path);

			const dirPath = dirname(fullPath);

			const exists = await pathExists(dirPath);

			if (!exists) {
				return { exists: false, isEmpty: false };
			}

			const contents = await readdir(dirPath);

			return {
				exists,
				isEmpty: contents.length === 0,
			};
		},
	};
};

export interface LokiRecord {
	timestamp: Date;
	rawTimestamp: bigint;
	line: string;
}

export interface Fetcher {
	(options: { from: bigint; to: Date; query: string; limit: number }): Promise<{
		returnedLines: LokiRecord[];
		pointer?: LokiRecord;
	}>;
}

export type FetcherFactory = () => Promise<{
	init: (options: { lokiUrl: string }) => Fetcher;
}>;

export const createFetcher: FetcherFactory = async () => {
	return {
		init({ lokiUrl }) {
			const lokiClient = createLokiClient(lokiUrl);

			return async ({ query, limit, from, to }) => {
				const lineCount = limit + 1; // +1 for pointer

				const data = await lokiClient.query_range({ query, limit: lineCount, from, to });

				const output = data.data.result.flatMap((stream: any) => {
					return stream.values.flatMap(([timestamp, line]: any) => {
						return {
							timestamp: new Date(timestamp / 1000 / 1000).toISOString(),
							rawTimestamp: BigInt(timestamp),
							line,
						};
					});
				});

				const pointer = output.at(-1) as LokiRecord;
				const returnedLines = output.slice(0, limit) as LokiRecord[];

				return { returnedLines, pointer };
			};
		},
	};
};
