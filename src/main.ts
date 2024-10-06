import { join } from 'path';
import prompts from 'prompts';
import { z, ZodError } from 'zod';
import { fromError } from 'zod-validation-error';
import { ABORT_SIGNAL, FOLDERS } from './constants';
import { FetcherFactory, FileSystem, Logger, StateStoreFactory } from './services';
import { getNanoseconds, hoursToMs, wait } from './util';

const dateString = z.preprocess((v: unknown) => {
	if (typeof v === 'string') return new Date(v);
	return v;
}, z.date());

export const zodConfigSchema = z.object({
	configFile: z
		.string()
		.min(1)
		.optional()
		.describe(
			'Path to the JSON configuration file. If provided, all listed options will be read from this file instead'
		),
	from: dateString
		.optional()
		.describe(
			'Represents the starting timestamp from which to query the logs. Defaults to (now OR "to" field) - 1 hour'
		),
	to: dateString
		.optional()
		.describe(
			'Represents the ending timestamp until which the logs will be queried. Defaults to now'
		),
	clearOutputDir: z
		.boolean()
		.default(false)
		.describe('If true, empties the specified output directory without prompting for confirmation'),
	outputFolder: z
		.string()
		.min(1)
		.default(FOLDERS.defaultOutputDir)
		.describe('Path to a folder that will contain subfolders for separate query downloads'),
	outputName: z
		.string()
		.min(1)
		.default(FOLDERS.defaultDownloadsDir)
		.describe('Name of the folder that will contain the downloaded files'),
	query: z.string().min(1).describe('A Loki query written in standard format.'),
	lokiUrl: z.string().min(1).describe('Base URL of Loki API instance'),
	coolDown: z
		.number()
		.nullable()
		.default(5_000)
		.describe('Time to wait between fetching the next batch of records from the Loki API'),
	totalRecordsLimit: z
		.number()
		.min(1)
		.optional()
		.describe('Limit on the total number of records to download'),
	fileRecordsLimit: z
		.number()
		.min(1)
		.optional()
		.describe('Limit on the number of records outputted to each file'),
	batchRecordsLimit: z
		.number()
		.min(1)
		.default(2_000)
		.describe('Limit on the number of records fetched from the Loki API in a single request'),
	promptToStart: z
		.boolean()
		.default(true)
		.describe('Ask for confirmation before the download starts'),
	orgId: z
		.string()
		.min(1)
		.optional()
		.describe('Adds X-Scope-OrgID header to API requests for representing tenant ID'),
	headers: z
		.array(z.string())
		.optional()
		.describe(
			'Additional request headers that will be present in every Loki API request. Can be used to provide authorization header'
		),
	queryTags: z
		.array(z.string())
		.optional()
		.describe('Adds X-Query-Tags header to API requests for tracking the query'),
	prettyLogs: z.boolean().default(true).describe('Use to enable/disable progress logs with emojis'),
});

export type Config = z.infer<typeof zodConfigSchema>;

export interface MainOptions {
	logger: Logger;
	fileSystem: FileSystem;
	stateStoreFactory: StateStoreFactory;
	fetcherFactory: FetcherFactory;
	config: Partial<Config>;
	abortController?: AbortController;
}

/** use json config file instead cmd params if configured */
export async function readConfig(config: Partial<Config>, fs: FileSystem): Promise<Config> {
	const { configFile } = zodConfigSchema
		.pick({ configFile: true })
		.parse({ configFile: config?.configFile });

	const fileConfig = configFile && JSON.parse(await fs.readConfig(configFile));

	return zodConfigSchema.parse(fileConfig || config);
}

export function catchZodError(error: unknown, logger: Logger) {
	if (error instanceof ZodError) {
		const readableError = fromError(error);

		// TODO: This also catches loki api parsing errors and similar stuff

		logger.error(
			'🛑',
			'Some provided options are invalid:',
			readableError.toString().replace('Validation error:', '').trim()
		);

		process.exit(1);
	}
}

export async function main({
	logger,
	fileSystem: fs,
	stateStoreFactory,
	fetcherFactory,
	config,
	abortController: ownAbortController,
}: MainOptions) {
	// ### setup graceful shutdown

	const abortController = ownAbortController || new AbortController();

	const shutDown = (signal: NodeJS.Signals) => {
		logger.info('🛑', `${signal} signal received. Shutting down...`);

		abortController.abort(ABORT_SIGNAL);

		cleanUpListeners();
	};

	process.addListener('SIGTERM', shutDown);
	process.addListener('SIGINT', shutDown);

	const cleanUpListeners = () => {
		process.removeListener('SIGTERM', shutDown);
		process.removeListener('SIGINT', shutDown);
	};

	try {
		const {
			from,
			to,
			query,
			lokiUrl,
			fileRecordsLimit,
			outputName,
			coolDown,
			totalRecordsLimit: limit,
			batchRecordsLimit, // split file into multiple requests to ease the load to api
			outputFolder,
			clearOutputDir,
			promptToStart,
			orgId,
			queryTags,
			headers,
		} = await readConfig(config, fs);

		// ### remap variables

		const requestHeaders = headers?.map(header => header.split('='));

		const totalRecordsLimit = limit || Infinity;
		const recordsLimitPerFile = fileRecordsLimit || Infinity;

		const toDate = to || new Date();
		const fromDate = new Date(from?.getTime() || (to?.getTime() || Date.now()) - hoursToMs(1));

		// ### prompt before starting the script

		if (promptToStart) {
			const startDownload = await prompts({
				type: 'confirm',
				name: 'start',
				message: `Start the download?`,
			});

			if (!startDownload.start) process.exit(1);
		}

		// ### loop variables

		let startFromTimestamp = getNanoseconds(fromDate);
		let fileNumber = 0;
		let totalRecords = 0;
		let iteration = 0;
		let queryRecordsExhausted = false;
		let prevSavedRecordsInFile = 0;

		// ### state recovery

		const stateStore = stateStoreFactory.create(
			fromDate.toISOString(),
			toDate.toISOString(),
			query,
			lokiUrl,
			recordsLimitPerFile.toString(),
			outputName,
			outputFolder
		);

		const prevState = await stateStore.load();

		if (prevState) {
			startFromTimestamp = BigInt(prevState.startFromTimestamp);
			fileNumber = prevState.fileNumber;
			totalRecords = prevState.totalRecords;
			iteration = prevState.iteration;
			queryRecordsExhausted = prevState.queryRecordsExhausted;
			prevSavedRecordsInFile = prevState.prevSavedRecordsInFile;
		}

		// ### output directory cleanup

		const outputDirPath = join(outputFolder, outputName);

		const { exists: outputDirExists, isEmpty: outputDirIsEmpty } =
			await fs.readOutputDir(outputDirPath);

		if (
			outputDirExists &&
			!outputDirIsEmpty &&
			!prevState // if prevState found, do not clean dir and continue in download instead
		) {
			if (!clearOutputDir) {
				const response = await prompts({
					type: 'confirm',
					name: 'delete',
					message: `Output directory at ${outputDirPath} already exists with some files. All files in this directory will be deleted in order to progress. Do you want to continue?`,
				});

				if (!response.delete) {
					logger.info(
						'🚧',
						`can't progress without emptying the ${outputDirPath} directory. Please backup the files somewhere else and run the command again`
					);
					process.exit(1);
				}
			}

			logger.info('🗑️', `removing files in ${outputDirPath} directory`);

			await fs.emptyOutputDir(outputDirPath);
		}

		// ### main processing loop

		const fetchRecords = fetcherFactory.create({
			lokiUrl,
			getAdditionalHeaders: () => {
				const customHeaders = requestHeaders && Object.fromEntries(requestHeaders);

				const headers = new Headers(customHeaders);

				if (orgId) headers.set('X-Scope-OrgID', orgId);
				if (queryTags) headers.set('X-Query-Tags', queryTags.join(', '));

				return headers;
			},
		});

		while (
			totalRecords < totalRecordsLimit &&
			!queryRecordsExhausted &&
			abortController.signal.aborted === false
		) {
			if (iteration !== 0 && coolDown) {
				logger.info(
					'⏳',
					`coolDown configured, waiting for ${coolDown}ms before fetching next records`
				);

				await wait(coolDown);

				if (abortController.signal.aborted) {
					throw ABORT_SIGNAL;
				}
			}

			// ### record fetching

			const remainingRecords = totalRecordsLimit - totalRecords;

			const fetchRecordCount = Math.min(remainingRecords, batchRecordsLimit);

			logger.info('⬇️', `fetching next ${fetchRecordCount} records`);

			const { returnedRecords, pointer } = await fetchRecords({
				from: startFromTimestamp,
				to: toDate,
				limit: fetchRecordCount,
				query: query,
				abort: abortController.signal,
			});

			// ### split records to files

			const files = [];
			let savedRecords = 0;
			const returnedRecordsCount = returnedRecords.length;

			while (savedRecords !== returnedRecordsCount && abortController.signal.aborted === false) {
				const fileSpace = recordsLimitPerFile - prevSavedRecordsInFile;

				const remainingRecords = returnedRecordsCount - savedRecords;

				if (!fileSpace) {
					fileNumber++;
					prevSavedRecordsInFile = 0;
					continue;
				}

				const slice = Math.min(fileSpace, remainingRecords);

				const usedRecords = returnedRecords.slice(savedRecords, savedRecords + slice);

				const filename = join(outputDirPath, `${fileNumber}.txt`);

				files.push({ filename, usedRecords });

				savedRecords += usedRecords.length;
				prevSavedRecordsInFile = prevSavedRecordsInFile + usedRecords.length;
			}

			if (abortController.signal.aborted) {
				// Do not save partial state and files just to be safe - rather repeat the download
				throw ABORT_SIGNAL;
			}

			// ### save files, but only IF NOT ABORTED!

			for (const { filename, usedRecords } of files) {
				logger.info('🗃️', `saving ${usedRecords.length} records to ${filename}`);

				await fs.outputLogs(filename, usedRecords);
			}

			// ### store state

			if (pointer) {
				startFromTimestamp = pointer.rawTimestamp;
			}

			totalRecords += returnedRecordsCount;
			queryRecordsExhausted = returnedRecordsCount < fetchRecordCount;
			iteration++;

			await stateStore.save({
				startFromTimestamp: startFromTimestamp.toString(),
				totalRecords,
				queryRecordsExhausted,
				fileNumber,
				iteration,
				prevSavedRecordsInFile,
			});
		}

		logger.info('✅', `all query results were downloaded, exiting now`);
	} catch (error) {
		if (error === ABORT_SIGNAL) {
			return;
		}

		// TODO: Better error handling

		catchZodError(error, logger);

		throw error;
	} finally {
		cleanUpListeners();
	}
}
