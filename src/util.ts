import { UnrecoverableError } from './error';
import { Config } from './main';

export async function wait(time: number) {
	return new Promise(res => {
		setTimeout(() => {
			res(undefined);
		}, time);
	});
}

export function configKey<T extends keyof Config>(key: T) {
	return key;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function retry<T extends (...args: any) => any>(
	maxRetries: number,
	cb: T,
	options?: {
		attempt?: number;
		retryDelay?: number;
		increaseDelay?: boolean;
		onRetry?: (
			error: unknown,
			data: { remainingAttempts: number; delay: number | undefined }
		) => void;
	}
): Promise<ReturnType<T>> {
	let attempt = options?.attempt || 0;

	try {
		return await cb();
	} catch (error) {
		if (error instanceof UnrecoverableError) {
			throw error;
		}

		if (attempt === maxRetries) {
			throw error;
		}

		attempt++;

		const delay =
			options?.retryDelay &&
			(options.increaseDelay ? attempt * options.retryDelay : options.retryDelay);

		options?.onRetry?.(error, { remainingAttempts: maxRetries - attempt, delay });

		if (delay) {
			await wait(delay);
		}

		return await retry(maxRetries, cb, { ...options, attempt });
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
