import { expect, it, vitest } from 'vitest';
import { getNanoseconds, nanosecondsToMilliseconds, retry } from './util';
import { describe } from 'node:test';

describe(retry.name, async () => {
	it('works', async () => {
		const mockFn = vitest.fn();
		const totalRuns = 3;

		let currentRun = totalRuns;
		const fn = async () => {
			mockFn();
			currentRun--;
			// fails until the last run
			if (currentRun > 0) throw new Error('fail');
		};

		await retry(2, fn);

		expect(mockFn).toBeCalledTimes(totalRuns);
	});
});

describe(getNanoseconds.name, () => {
	it('works', () => {
		const date = new Date('2024/9/27');

		expect(getNanoseconds(date)).toBe(1727388000000000000n);
	});
});

describe(nanosecondsToMilliseconds.name, () => {
	it('works', () => {
		expect(nanosecondsToMilliseconds(1727388000000000000n)).toBe(1727388000000);
	});

	it('handles float math inaccuracy', () => {
		// some numbers have decimal numbers after division by 1e6 from float math inaccuracy
		expect(nanosecondsToMilliseconds(1727524289398000000n)).toBe(1727524289398);
	});
});
