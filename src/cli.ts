#!/usr/bin/env node

import { program } from 'commander';
import { EOL } from 'os';
import { ZodError } from 'zod';
import configJsonSchema from '../config-schema.json';
import { Config, main, zodConfigSchema } from './main';
import {
	createFetcherFactory,
	createFileSystem,
	createLogger,
	createStateStoreFactory,
} from './services';
import { getPkg, retrieveZodError } from './util';

const schema = configJsonSchema.properties;

const toNumber = (v: string) => Number(v);

const wrap = (...messages: string[]) => `${messages.join(EOL)}${EOL}${EOL}`;

const pkg = getPkg();

console.log(`${EOL}=== Loki log downloader version: ${pkg.version} 👋 ===${EOL}`);

program
	// ==================================================
	.name(pkg.name)
	.description(pkg.description)
	.version(pkg.version)
	// ==================================================
	.option('-q --query <loki_query>', wrap(schema.query.description, `Example: -q '{app="test"}'`))
	.option(
		'-u --lokiUrl <url>',
		wrap(schema.lokiUrl.description, `Example: -u http://localhost:3100`)
	)
	.option('-f --from <date>', wrap(schema.from.description, `Example: -f 2024-10-06T00:00:00.000Z`))
	.option('-t --to <date>', wrap(schema.to.description, `Example: -t 2024-10-06T24:00:00.000Z`))
	.option(
		'-c --configFile <path_to_config>',
		wrap(schema.configFile.description, `Example: -c ./config.json`)
	)
	.option(
		'-o --outputFolder <folder>',
		wrap(
			schema.outputFolder.description,
			`Final file structure: <outputFolder>/<outputName>/logFile.txt`
		)
	)
	.option(
		'-n --outputName <name>',
		wrap(
			schema.outputName.description,
			`Final file structure: <outputFolder>/<outputName>/logFile.txt`
		)
	)
	.option('-tll --totalRecordsLimit <number>', wrap(schema.totalRecordsLimit.description), toNumber)
	.option('-fll --fileRecordsLimit <number>', wrap(schema.fileRecordsLimit.description), toNumber)
	.option('-bll --batchRecordsLimit <number>', wrap(schema.batchRecordsLimit.description), toNumber)
	.option('--startFromOldest', wrap(schema.startFromOldest.description))
	.option('--coolDown <timeMs>', wrap(schema.coolDown.description), toNumber)
	.option('--clearOutputDir', wrap(schema.clearOutputDir.description))
	.option('--orgId <name>', wrap(schema.orgId.description))
	.option(
		'--headers [headers...]',
		wrap(
			schema.headers.description,
			`Example: --headers authorization=user:pwd --headers x-custom=123`
		)
	)
	.option('--queryTags [tags...]', wrap(schema.queryTags.description))
	.option('--no-prettyLogs', wrap(schema.prettyLogs.description))
	// ==================================================
	.action(async (params: Partial<Config>) => {
		const baseConfig = zodConfigSchema.pick({ prettyLogs: true }).parse(params);
		const logger = createLogger(undefined, baseConfig.prettyLogs);
		const fileSystem = createFileSystem();

		try {
			await main({
				stateStoreFactory: createStateStoreFactory({ fileSystem, logger }),
				fetcherFactory: createFetcherFactory(),
				logger,
				fileSystem,
				config: params,
				runtime: 'cli',
				version: pkg.version,
			});
		} catch (error) {
			if (error instanceof ZodError) {
				logger.error('🛑', 'Some provided options are invalid:', retrieveZodError(error));

				process.exit(1);
			}

			throw error;
		}
	});

program.parse();
