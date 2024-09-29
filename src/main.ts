import { EOL } from 'os';
import { join } from 'path';
import { exit } from 'process';
import prompts from 'prompts';
import { z } from 'zod';
import { END_OF_TODAY, FOLDERS, START_OF_TODAY } from './constants';
import { FetcherFactory, FileSystemFactory, LoggerFactory, StateStoreFactory } from './services';
import { getNanoseconds, wait } from './util';

const dateString = z.preprocess((v: unknown) => {
	if (typeof v === 'string') return new Date(v);
}, z.date());

const configSchema = z.object({
	from: dateString.default(START_OF_TODAY.toISOString()),
	to: dateString.default(END_OF_TODAY.toISOString()),
	configFile: z.string().min(1).optional(),
	clearOutputDir: z.boolean().default(false),
	outputFolder: z.string().min(1).default(FOLDERS.defaultOutputDir),
	outputName: z.string().min(1).default(FOLDERS.defaultDownloadsDir),
	query: z.string({ required_error: 'query param is required' }).min(1),
	lokiUrl: z.string().min(1),
	coolDown: z.number().nullable().default(10_000),
	totalLinesLimit: z.number().min(1).optional(),
	fileLinesLimit: z.number().min(1).optional(),
	batchLinesLimit: z.number().min(1).default(2000),
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

		if (configFile) {
			config = (await fs.readJson(configFile)) as Config;
		}

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
		} = configSchema.parse(config);

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
			await fs.getDirData(outputDirPath);

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

			await fs.emptyDir(outputDirPath);
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

				await fs.saveFile(
					filename,
					`${usedLines
						.map(data =>
							JSON.stringify({
								...data,
								rawTimestamp: data.rawTimestamp.toString(),
							})
						)
						.join(EOL)}${EOL}`,
					{ append: true }
				);

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
