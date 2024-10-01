import { join } from 'path';
import { exit } from 'process';
import prompts from 'prompts';
import { z } from 'zod';
import { FOLDERS } from './constants';
import { FetcherFactory, FileSystemFactory, LoggerFactory, StateStoreFactory } from './services';
import { getNanoseconds, hoursToMs, wait } from './util';

const dateString = z.preprocess((v: unknown) => {
	if (typeof v === 'string') return new Date(v);
}, z.date());

export const configSchema = z.object({
	configFile: z
		.string()
		.min(1)
		.optional()
		.describe(
			'Path to the JSON configuration file. If provided, all listed options will be read from this file instead.'
		),
	from: dateString
		.default(new Date(Date.now() - hoursToMs(1)).toISOString())
		.describe(
			'Represents the starting timestamp from which to query the logs. Defaults to now - 1 hour.'
		),
	to: dateString
		.default(new Date().toISOString())
		.describe(
			'Represents the ending timestamp until which the logs will be queried. Defaults to now.'
		),
	clearOutputDir: z
		.boolean()
		.default(false)
		.describe('If true, clears the specified output directory without prompting.'),
	outputFolder: z
		.string()
		.min(1)
		.default(FOLDERS.defaultOutputDir)
		.describe('Path to a folder that will contain subfolders for separate query downloads.'),
	outputName: z
		.string()
		.min(1)
		.default(FOLDERS.defaultDownloadsDir)
		.describe('Name of the folder that will contain the downloaded files.'),
	query: z
		.string({ required_error: 'query param is required' })
		.min(1)
		.describe('A Loki query written in standard format.'),
	lokiUrl: z.string().min(1).describe('Base URL of Loki API instance.'),
	coolDown: z
		.number()
		.nullable()
		.default(10_000)
		.describe('Time to wait between fetching the next batch of lines from the Loki API.'),
	totalLinesLimit: z
		.number()
		.min(1)
		.optional()
		.describe('Limit on the total number of lines to download.'),
	fileLinesLimit: z
		.number()
		.min(1)
		.optional()
		.describe('Limit on the number of lines outputted to each file.'),
	batchLinesLimit: z
		.number()
		.min(1)
		.default(2000)
		.describe('Limit on the number of lines fetched from the Loki API in a single request.'),
	promptToStart: z
		.boolean()
		.default(true)
		.describe('Ask for confirmation before the download starts.'),
});

export type Config = Omit<z.infer<typeof configSchema>, 'from' | 'to'> & {
	from: string;
	to: string;
};

export async function main({
	loggerFactory,
	stateStoreFactory,
	fileSystemFactory,
	fetcherFactory,
	config,
}: {
	loggerFactory: LoggerFactory;
	stateStoreFactory: StateStoreFactory;
	fileSystemFactory: FileSystemFactory;
	fetcherFactory: FetcherFactory;
	config: Partial<Config>;
}) {
	try {
		const logger = loggerFactory();
		const fs = fileSystemFactory();
		const stateStoreInstance = stateStoreFactory({ fs, logger });
		const fetcherInstance = await fetcherFactory();

		// ### use json config file instead cmd params if configured

		const { configFile } = configSchema
			.pick({ configFile: true })
			.parse({ configFile: config.configFile });

		const fileConfig = configFile && (await fs.readConfig(configFile));

		// ### validate config

		const {
			from: fromDate,
			to: toDate,
			query,
			lokiUrl,
			fileLinesLimit,
			outputName,
			coolDown,
			totalLinesLimit: limit,
			batchLinesLimit, // split file into multiple requests to ease the load to api
			outputFolder,
			clearOutputDir: forceClearOutput,
			promptToStart,
		} = configSchema.parse(fileConfig || config);

		if (promptToStart) {
			const startDownload = await prompts({
				type: 'confirm',
				name: 'start',
				message: `Start the download?`,
			});

			if (!startDownload.start) {
				throw new Error('TODO');
				// TODO: Do exit instead of error
			}
		}

		// ### loop variables

		const totalLinesLimit = limit || Infinity;
		const linesLimitPerFile = fileLinesLimit || Infinity;

		let startFromTimestamp = getNanoseconds(fromDate);
		let fileNumber = 0;
		let totalLines = 0;
		let iteration = 0;
		let queryLinesExhausted = false;

		// ### state recovery

		const stateStore = stateStoreInstance.init(
			fromDate.toISOString(),
			toDate.toISOString(),
			query,
			lokiUrl,
			linesLimitPerFile.toString(),
			outputName,
			outputFolder
		);

		const prevState = await stateStore.load();

		if (prevState) {
			startFromTimestamp = BigInt(prevState.startFromTimestamp);
			fileNumber = prevState.fileNumber;
			totalLines = prevState.totalLines;
			iteration = prevState.iteration;
			queryLinesExhausted = prevState.queryLinesExhausted;
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
			if (!forceClearOutput) {
				const response = await prompts({
					type: 'confirm',
					name: 'delete',
					message: `Output directory at ${outputDirPath} already exists with some files. All files in this directory will be deleted in order to progress. Do you want to continue?`,
				});

				if (!response.delete) {
					logger.info(
						`Can't progress without emptying the ${outputDirPath} directory. Please backup the files somewhere else and run the command again.`
					);
					exit();
				}
			}

			logger.info(`removing files in ${outputDirPath} directory`);

			await fs.emptyOutputDir(outputDirPath);
		}

		// ### main processing loop

		const fetchLines = fetcherInstance.init({
			lokiUrl,
		});

		let prevSavedLinesInFile = 0;

		while (totalLines < totalLinesLimit && !queryLinesExhausted) {
			if (iteration !== 0 && coolDown) {
				logger.info(`coolDown configured, waiting for ${coolDown}ms before fetching next lines`);
				await wait(coolDown);
			}

			// # line fetching

			const remainingLines = totalLinesLimit - totalLines;

			const fetchLineCount = Math.min(remainingLines, batchLinesLimit);

			logger.info(`fetching next ${fetchLineCount} lines`);

			const { returnedLines, pointer } = await fetchLines({
				from: startFromTimestamp,
				to: toDate,
				limit: fetchLineCount,
				query: query,
			});

			// # split lines to files

			const returnedLinesCount = returnedLines.length;

			let savedLines = 0;

			while (savedLines !== returnedLinesCount) {
				const fileSpace = linesLimitPerFile - prevSavedLinesInFile;

				const remainingLines = returnedLinesCount - savedLines;

				if (!fileSpace) {
					fileNumber++;
					prevSavedLinesInFile = 0;
					continue;
				}

				const slice = Math.min(fileSpace, remainingLines);

				const usedLines = returnedLines.slice(savedLines, savedLines + slice);

				const filename = join(outputDirPath, `${fileNumber}.txt`);

				logger.info(`saving ${usedLines.length} lines to ${filename}`);

				await fs.outputLogs(filename, usedLines);

				savedLines += usedLines.length;
				prevSavedLinesInFile = prevSavedLinesInFile + usedLines.length;
			}

			if (pointer) {
				startFromTimestamp = pointer.rawTimestamp;
			}

			totalLines += returnedLinesCount;
			queryLinesExhausted = returnedLinesCount < fetchLineCount;
			iteration++;

			await stateStore.save({
				startFromTimestamp: startFromTimestamp.toString(),
				totalLines,
				queryLinesExhausted,
				fileNumber,
				iteration,
			});
		}

		logger.info(`all query results were downloaded, exiting now`);
	} catch (error) {
		// TODO: Better error handling
		throw error;
	}
}
