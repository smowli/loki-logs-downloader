import { catchZodError, Config, main, zodConfigSchema } from './main';
import {
	createFetcherFactory,
	createFileSystem,
	createLogger,
	createStateStoreFactory,
	FileSystem,
	Logger,
} from './services';

export { createFileSystem, createLogger } from './services';

export const download = async (options: {
	logger?: Logger;
	fileSystem?: FileSystem;
	abortController?: AbortController;
	config: Partial<Config>;
}) => {
	const baseConfig = zodConfigSchema.pick({ prettyLogs: true }).parse(options.config);
	const logger = createLogger(undefined, baseConfig.prettyLogs);
	const fileSystem = createFileSystem();

	try {
		await main({
			stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
			fetcherFactory: createFetcherFactory(),
			logger,
			fileSystem,
			config: options.config,
		});
	} catch (error) {
		catchZodError(error, logger);

		// TODO: Better error handling

		throw error;
	}
};
