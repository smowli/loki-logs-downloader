export async function wait(time: number) {
	return new Promise(res => {
		setTimeout(() => {
			res(undefined);
		}, time);
	});
}

export async function retry(maxRetries: number, cb: () => Promise<void>) {
	try {
		await cb();
	} catch (error) {
		if (maxRetries === 0) throw error;

		await retry(maxRetries - 1, cb);
	}
}

export function getNanoseconds(date?: Date) {
	const nowMs = BigInt((date || new Date()).getTime());
	const nowNs = date ? 0 : process.hrtime()[1]; // don't add nanoseconds if fixed date is provided
	return nowMs * BigInt(1e6) + BigInt(nowNs);
}

export function nanosecondsToMilliseconds(nanoseconds: number | bigint) {
	// we have to round, sometimes there is float math inaccuracy which leads to off 1 errors
	return Math.round(Number(nanoseconds) / 1e6);
}

export function secondsToMilliseconds(seconds: number) {
	return seconds * 1000;
}

export function hoursToMs(hours: number) {
	return hours * 60 * 60 * 1000;
}
