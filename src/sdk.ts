import { main, MainOptions } from './main';
import { createFetcher, createFileSystem, createLogger, createStateStore } from './services';

export { createFileSystem as fileSystemFactory, createLogger as loggerFactory } from './services';

export type SdkOptions = Pick<
	MainOptions,
	'fileSystemFactory' | 'loggerFactory' | 'config' | 'abortController'
>;

export const download = async (options: SdkOptions) =>
	await main({
		loggerFactory: options.loggerFactory || createLogger,
		stateStoreFactory: createStateStore,
		fileSystemFactory: options.fileSystemFactory || createFileSystem,
		fetcherFactory: createFetcher,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		config: options.config as any, // no worries, these are parsed and validated further
	});
