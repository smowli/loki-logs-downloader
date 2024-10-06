import { expect, it, vi } from 'vitest';
import { DEFAULT_LOKI_URL } from '../constants';
import { download } from '../sdk';
import { FileSystem } from '../services';
import { getNanoseconds } from '../util';

it('it calls custom fileSystem & logger', async () => {
	const fetchSpy = vi.spyOn(globalThis, 'fetch');

	const logger = {
		info: vi.fn(),
		error: vi.fn(),
	};

	const fileSystem = {
		readConfig: vi.fn().mockImplementation((async () => {
			return JSON.stringify({
				outputName: 'output',
				query: '{app="test"}',
				lokiUrl: DEFAULT_LOKI_URL,
				promptToStart: false,
				clearOutputDir: true,
			});
		}) as FileSystem['readConfig']),

		readOutputDir: vi.fn().mockImplementation((async () => ({
			exists: true,
			isEmpty: false,
		})) as FileSystem['readOutputDir']),

		emptyOutputDir: vi.fn().mockImplementation((async () => {
			return;
		}) as FileSystem['emptyOutputDir']),

		loadState: vi.fn().mockImplementation((async () => {
			return;
		}) as FileSystem['loadState']),

		outputLogs: vi.fn().mockImplementation((async () => {
			return;
		}) as FileSystem['outputLogs']),

		saveState: vi.fn().mockImplementation((async () => {
			return;
		}) as FileSystem['saveState']),
	};

	fetchSpy.mockResolvedValueOnce(
		new Response(
			JSON.stringify({
				status: 'success',
				data: {
					resultType: 'streams',
					result: [
						{
							stream: {},
							values: [[String(getNanoseconds()), 'log line']],
						},
					],

					stats: {},
				},
			})
		)
	);

	await download({
		logger,
		fileSystem,
		config: {
			configFile: './config.json',
		},
	});

	expect(logger.info).toBeCalled();

	expect(fileSystem.readConfig).toBeCalled();
	expect(fileSystem.readOutputDir).toBeCalled();
	expect(fileSystem.emptyOutputDir).toBeCalled();
	expect(fileSystem.loadState).toBeCalled();
	expect(fileSystem.outputLogs).toBeCalled();
	expect(fileSystem.saveState).toBeCalled();
});
