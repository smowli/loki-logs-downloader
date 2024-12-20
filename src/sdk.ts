import { Config, main, zodConfigSchema } from './main';
import {
	createFetcherFactory,
	createFileSystem,
	createLogger,
	createStateStoreFactory,
	FileSystem,
	Logger,
} from './services';
import { getPkg } from './util';

export { createFileSystem, createLogger } from './services';

// Export error types
export { ZodError } from 'zod';
export { StandardError, UnrecoverableError } from './error';
export { DownloadCancelledByUserError, OutputDirNotEmptyError } from './main';

export const download = async (options: {
	logger?: Logger;
	fileSystem?: FileSystem;
	abortController?: AbortController;
	config: Partial<Config>;
}) => {
	const baseConfig = zodConfigSchema.pick({ prettyLogs: true }).parse(options.config);
	const logger = options.logger || createLogger(undefined, baseConfig.prettyLogs);
	const fileSystem = options.fileSystem || createFileSystem();

	try {
		await main({
			stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
			fetcherFactory: createFetcherFactory(),
			logger,
			fileSystem,
			abortController: options.abortController,
			config: options.config,
			runtime: 'sdk',
			version: getPkg().version,
		});
	} catch (error) {
		throw error;
	}
};
