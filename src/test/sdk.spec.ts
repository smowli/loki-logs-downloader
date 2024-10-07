import { expect, it, vi } from 'vitest';
import { DEFAULT_LOKI_URL } from '../constants';
import { download } from '../sdk';
import { FileSystem } from '../services';
import { getNanoseconds } from '../util';

it('it calls custom fileSystem & logger', async () => {
	const fetchSpy = vi.spyOn(globalThis, 'fetch');

	const abortController = new AbortController();

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
				// fetch super slow, so first fetch is triggered, but then we have time to abort
				fileRecordsLimit: 1,
				batchRecordsLimit: 1,
				coolDown: 2_000,
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

	fetchSpy.mockImplementation(async (url, init) => {
		return new Promise((res, rej) => {
			if (init?.signal) {
				init.signal.addEventListener('abort', ev => {
					rej(ev);
				});
			}

			res(
				new Response(
					JSON.stringify({
						status: 'success',
						data: {
							resultType: 'streams',
							result: [
								{
									stream: {},
									values: [
										[String(getNanoseconds()), 'log line 1'],
										[String(getNanoseconds()), 'log line 2'],
									],
								},
							],

							stats: {},
						},
					})
				)
			);
		});
	});

	const pending = download({
		logger,
		fileSystem,
		abortController,
		config: {
			configFile: './config.json',
		},
	});

	setTimeout(() => abortController.abort(), 500);

	await pending;

	expect(abortController.signal.aborted).toBe(true);

	expect(logger.info).toBeCalled();

	expect(fileSystem.readConfig).toBeCalled();
	expect(fileSystem.readOutputDir).toBeCalled();
	expect(fileSystem.emptyOutputDir).toBeCalled();
	expect(fileSystem.loadState).toBeCalled();
	expect(fileSystem.outputLogs).toBeCalled();
	expect(fileSystem.saveState).toBeCalled();

	expect(fetchSpy).toBeCalledTimes(1);
});
