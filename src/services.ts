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
import { dirname, join } from 'path';
import { FOLDERS } from './constants';
import { createLokiClient } from './loki';
import { EOL } from 'os';
import { z } from 'zod';

const stateSchema = z.object({
	startFromTimestamp: z.string(),
	totalLines: z.number(),
	queryLinesExhausted: z.boolean(),
	fileNumber: z.number(),
	iteration: z.number(),
});

type State = z.infer<typeof stateSchema>;

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
					const state = await fs.loadState(statePath);

					if (!state) return;

					logger.info(
						`Found previous state ${JSON.stringify(
							state
						)} at ${statePath}. Continuing where left off.`
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
	readOutputDir: (path: string) => Promise<{ exists: boolean; isEmpty: boolean }>;
	outputLogs: (fileName: string, logs: LokiRecord[]) => Promise<void>;
	emptyOutputDir: (path: string) => Promise<void>;
	readConfig: (path: string) => Promise<string>;
	saveState: (path: string, state: State) => Promise<void>;
	loadState: (path: string) => Promise<string | undefined>;
}

export type FileSystemFactory = (rootDir?: string) => FileSystem;

export const createFileSystem: FileSystemFactory = (rootDir = '') => {
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
