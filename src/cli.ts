#!/usr/bin/env node

import { program } from 'commander';
import { main } from './main';
import { createFetcher, createFileSystem, createLogger, createStateStore } from './services';
import pkg from '../package.json';

const toNumber = (v: string) => Number(v);

console.log(`\n=== Loki log downloader version: ${pkg.version} 👋 ===\n`);

program
	// ==================================================
	.name(pkg.name)
	.description(pkg.description)
	.version(pkg.version)
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
		toNumber //
	)
	.option(
		'-fll --fileLinesLimit <number>',
		'Limit of lines outputted to each file',
		toNumber //
	)
	.option(
		'-bll --batchLinesLimit <number>',
		'Limit of lines fetched from Loki API in one request',
		toNumber //
	)
	.option(
		'--coolDown <timeMs>',
		'Time to wait between fetching next batch of lines from Loki API',
		toNumber //
	)
	.option('--clearOutputDir')
	// ==================================================
	.action(async params => {
		await main({
			loggerFactory: createLogger,
			stateStoreFactory: createStateStore,
			fileSystemFactory: createFileSystem,
			fetcherFactory: createFetcher,
			config: params as any, // no worries, these are parsed and validated further
		});
	});

program.parse();
