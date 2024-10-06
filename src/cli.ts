#!/usr/bin/env node

import { program } from 'commander';
import { Config, main, readConfig } from './main';
import {
	createFetcherFactory,
	createFileSystem,
	createLogger,
	createStateStoreFactory,
} from './services';

import configJsonSchema from '../config-schema.json';
import pkg from '../package.json';

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
	.option('-tll --totalRecordsLimit <number>', configSchema.totalRecordsLimit.description, toNumber)
	.option('-fll --fileRecordsLimit <number>', configSchema.fileRecordsLimit.description, toNumber)
	.option('-bll --batchRecordsLimit <number>', configSchema.batchRecordsLimit.description, toNumber)
	.option('--coolDown <timeMs>', configSchema.coolDown.description, toNumber)
	.option('--clearOutputDir', configSchema.clearOutputDir.description)
	.option('--orgId <name>', configSchema.orgId.description)
	.option('--headers [headers...]', configSchema.headers.description)
	.option('--queryTags [tags...]', configSchema.queryTags.description)
	.option('--no-prettyLogs', configSchema.prettyLogs.description)
	// ==================================================
	.action(async (params: Partial<Config>) => {
		const fileSystem = createFileSystem();
		const config = await readConfig(params, fileSystem);
		const logger = createLogger(undefined, config.prettyLogs);

		await main({
			stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
			fetcherFactory: createFetcherFactory(),
			logger,
			fileSystem,
			config,
		});
	});

program.parse();
