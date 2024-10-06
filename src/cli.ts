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

const wrap = (...messages: string[]) => `${messages.join('\n')}\n\n`;

console.log(`\n=== Loki log downloader version: ${pkg.version} 👋 ===\n`);

program
	// ==================================================
	.name(pkg.name)
	.description(pkg.description)
	.version(pkg.version)
	// ==================================================
	.option(
		'-q --query <loki_query>',
		wrap(configSchema.query.description, `Example: -q '{app="test"}'`)
	)
	.option(
		'-u --lokiUrl <url>',
		wrap(configSchema.lokiUrl.description, `Example: -u http://localhost:3100`)
	)
	.option(
		'-f --from <date>',
		wrap(configSchema.from.description, `Example: -f 2024-10-06T00:00:00.000Z`)
	)
	.option(
		'-t --to <date>',
		wrap(configSchema.to.description, `Example: -t 2024-10-06T24:00:00.000Z`)
	)
	.option(
		'-c --configFile <path_to_config>',
		wrap(configSchema.configFile.description, `Example: -c ./config.json`)
	)
	.option('-o --outputFolder <folder>', wrap(configSchema.outputFolder.description))
	.option('-n --outputName <name>', wrap(configSchema.outputName.description))
	.option(
		'-tll --totalRecordsLimit <number>',
		wrap(configSchema.totalRecordsLimit.description),
		toNumber
	)
	.option(
		'-fll --fileRecordsLimit <number>',
		wrap(configSchema.fileRecordsLimit.description),
		toNumber
	)
	.option(
		'-bll --batchRecordsLimit <number>',
		wrap(configSchema.batchRecordsLimit.description),
		toNumber
	)
	.option('--coolDown <timeMs>', wrap(configSchema.coolDown.description), toNumber)
	.option('--clearOutputDir', wrap(configSchema.clearOutputDir.description))
	.option('--orgId <name>', wrap(configSchema.orgId.description))
	.option(
		'--headers [headers...]',
		wrap(
			configSchema.headers.description,
			`Example: --headers authorization=user:pwd --headers x-custom=123`
		)
	)
	.option('--queryTags [tags...]', wrap(configSchema.queryTags.description))
	.option('--no-prettyLogs', wrap(configSchema.prettyLogs.description))
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
