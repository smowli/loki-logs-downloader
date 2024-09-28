import { program } from 'commander';
import { main } from './main';
import { createFetcher, createFileSystem, createLogger, createStateStore } from './services';

const toNum = (v: string) => Number(v);

program
	// ==================================================
	.name('loki-logs-downloader')
	.description('CLI for downloading logs from Loki API')
	.version('1.0.0')
	// ==================================================
	.option('-q --query <loki_query>')
	.option('-u --lokiUrl <url>')
	.option('-f --from <date>')
	.option('-t --to <date>')
	.option('-c --configFile <path_to_config>')
	.option('-o --outputFolder <folder>')
	.option('-n --outputName <name>')
	.option(
		'-tll --totalLinesLimit <number>',
		'Limit of total lines to download',
		toNum //
	)
	.option(
		'-fll --fileLinesLimit <number>',
		'Limit of lines outputted to each file',
		toNum //
	)
	.option(
		'-bll --batchLinesLimit <number>',
		'Limit of lines fetched from Loki API in one request',
		toNum //
	)
	.option(
		'--coolDown <timeMs>',
		'Time to wait between fetching next batch of lines from Loki API',
		toNum //
	)
	.option('--clearOutputDir')
	// ==================================================
	.action(async options => {
		await main({
			loggerFactory: createLogger,
			stateStoreFactory: createStateStore,
			fileSystemFactory: createFileSystem,
			fetcherFactory: createFetcher,
			options: options as any, // no worries, these are parsed and validated further
		});
	});

program.parse();
