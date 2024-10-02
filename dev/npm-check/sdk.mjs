import { download } from 'loki-logs-downloader'

async function main() {
	await download({
		config: {
			lokiUrl: 'http://localhost:3100',
			query: '{app="test"}',
			coolDown: 1000,
		},
	});
}

main();
