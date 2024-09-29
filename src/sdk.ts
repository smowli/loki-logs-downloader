import { Config, main } from './main';
import {
	createFetcher,
	createFileSystem,
	createLogger,
	createStateStore,
	FileSystemFactory,
	LoggerFactory,
} from './services';

export { createFileSystem as fileSystemFactory, createLogger as loggerFactory } from './services';

export const download = async (options: {
	loggerFactory?: LoggerFactory;
	fileSystemFactory?: FileSystemFactory;
	config: Partial<Config>;
}) =>
	await main({
		loggerFactory: options.loggerFactory || createLogger,
		stateStoreFactory: createStateStore,
		fileSystemFactory: options.fileSystemFactory || createFileSystem,
		fetcherFactory: createFetcher,
		config: options.config as any, // no worries, these are parsed and validated further
	});
