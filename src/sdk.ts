import { ZodError } from 'zod';
import { Config, InvalidConfigError, main, retrieveAndLogZodError, zodConfigSchema } from './main';
import {
	createFetcherFactory,
	createFileSystem,
	createLogger,
	createStateStoreFactory,
	FileSystem,
	Logger,
} from './services';

export { createFileSystem, createLogger } from './services';

// Export error types
export { StandardError, UnrecoverableError } from './error';
export { InvalidConfigError, OutputDirNotEmptyError, DownloadCancelledByUserError } from './main';

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
		});
	} catch (error) {
		if (error instanceof ZodError) {
			throw new InvalidConfigError(retrieveAndLogZodError(error, logger));
		}

		throw error;
	}
};
