import { writeFile } from 'fs/promises';
import { configSchema } from '../src/main';
import { zodToJsonSchema } from 'zod-to-json-schema';

(async () => {
	await writeFile(
		'./config-schema.json',
		JSON.stringify(
			zodToJsonSchema(configSchema, {
				$refStrategy: 'none',
				dateStrategy: 'format:date-time',
			}),
			null,
			2
		)
	);
})();
