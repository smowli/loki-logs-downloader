#!/usr/bin/env node

import { program } from 'commander';
import { main } from './main';
import { createFetcher, createFileSystem, createLogger, createStateStore } from './services';

import pkg from '../package.json';
import configJsonSchema from '../config-schema.json';

const configSchema = configJsonSchema.properties;

const toNumber = (v: string) => Number(v);

console.log(`\n=== Loki log downloader version: ${pkg.version} 👋 ===\n`);

program
	// ==================================================
	.name(pkg.name)
	.description(pkg.description)
	.version(pkg.version)
	// ==================================================
	.option('-q --query <loki_query>', configSchema.query.description)
	.option('-u --lokiUrl <url>', configSchema.lokiUrl.description)
	.option('-f --from <date>', configSchema.from.description)
	.option('-t --to <date>', configSchema.to.description)
	.option('-c --configFile <path_to_config>', configSchema.configFile.description)
	.option('-o --outputFolder <folder>', configSchema.outputFolder.description)
	.option('-n --outputName <name>', configSchema.outputName.description)
	.option('-tll --totalLinesLimit <number>', configSchema.totalLinesLimit.description, toNumber)
	.option('-fll --fileLinesLimit <number>', configSchema.fileLinesLimit.description, toNumber)
	.option('-bll --batchLinesLimit <number>', configSchema.batchLinesLimit.description, toNumber)
	.option('--coolDown <timeMs>', configSchema.coolDown.description, toNumber)
	.option('--clearOutputDir', configSchema.clearOutputDir.description)
	.option('--orgId <name>', configSchema.orgId.description)
	.option('--headers [headers...]', configSchema.headers.description)
	.option('--queryTags [tags...]', configSchema.queryTags.description)
	// ==================================================
	.action(async params => {
		await main({
			loggerFactory: createLogger,
			stateStoreFactory: createStateStore,
			fileSystemFactory: createFileSystem,
			fetcherFactory: createFetcher,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			config: params as any, // no worries, these are parsed and validated further
		});
	});

program.parse();
