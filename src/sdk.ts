import { Config, main, readConfig } from './main';
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
	const fileSystem = options.fileSystem || createFileSystem();
	const config = await readConfig(options.config, fileSystem);
	const logger = options.logger || createLogger(undefined, config.prettyLogs);

	await main({
		stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
		fetcherFactory: createFetcherFactory(),
		logger,
		fileSystem,
		config: options.config,
	});
};
