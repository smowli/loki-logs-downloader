import { z } from 'zod';
import { ABORT_SIGNAL } from './constants';
import { BaseError, UnrecoverableError } from './error';

export const LOKI_API_ERRORS = {
	queryMaxLimit: 'max entries limit per query exceeded',
};

export class LokiApiError extends BaseError {}

export class UnrecoverableLokiApiError extends UnrecoverableError {}

export class MaxEntriesLimitPerQueryExceeded extends UnrecoverableLokiApiError {
	message = 'max entries limit per query exceeded';
}

export enum LokiFetchDirection {
	'FORWARD' = 'FORWARD',
	'BACKWARD' = 'BACKWARD',
}

const lokiStatusSchema = z.union([z.literal('success'), z.literal('error')]);

/** https://grafana.com/docs/loki/latest/reference/loki-http-api/#statistics */
const lokiStatsSchema = z.object({}).passthrough();

const lokiApiResponseSchema = z.union([
	z.object({
		status: lokiStatusSchema,
		data: z.object({
			resultType: z.literal('matrix'),
			result: z.array(
				z.object({
					metric: z.object({}).passthrough(), // TODO: What to do with labels
					values: z.array(z.tuple([z.number(), z.string()])), //  [<number: second unix epoch>, <string: value>]
				})
			),
			stats: lokiStatsSchema,
		}),
	}),
	z.object({
		status: lokiStatusSchema,
		data: z.object({
			resultType: z.literal('streams'),
			result: z.array(
				z.object({
					stream: z.object({}).passthrough(), // TODO: What to do with labels
					values: z.array(z.tuple([z.string(), z.string()])), // [<string: nanosecond unix epoch>, <string: log line>],
				})
			),
			stats: lokiStatsSchema,
		}),
	}),
]);

const timestampUrlValue = (value: Date | bigint | number) =>
	value instanceof Date ? value.toISOString() : value.toString();

export const createLokiClient = (lokiUrl: string) => {
	return {
		/** https://grafana.com/docs/loki/latest/reference/loki-http-api/#query-logs-within-a-range-of-time */
		query_range: async ({
			query,
			limit,
			from,
			to,
			additionalHeaders,
			abort = null,
			fetchDirection,
		}: {
			query: string;
			limit?: number;
			from?: Date | bigint | number;
			to?: Date | bigint | number;
			additionalHeaders?: Headers | undefined;
			abort?: AbortSignal | null | undefined;
			fetchDirection: LokiFetchDirection;
		}) => {
			try {
				const url = new URL(`${lokiUrl}/loki/api/v1/query_range`);

				url.searchParams.set('direction', fetchDirection);
				url.searchParams.set('query', query);
				if (limit) url.searchParams.set('limit', limit.toString());
				if (from) url.searchParams.set('start', timestampUrlValue(from));
				if (to) url.searchParams.set('end', timestampUrlValue(to));

				const headers = new Headers(additionalHeaders);

				const response = await fetch(url, { headers, signal: abort });

				if (!response.ok) {
					const responseText = await response.text();
					if (responseText.includes(LOKI_API_ERRORS.queryMaxLimit)) {
						throw new MaxEntriesLimitPerQueryExceeded();
					}

					throw new LokiApiError(responseText);
				}

				const rawData = await response.json();

				const parsedData = lokiApiResponseSchema.parse(rawData);

				return parsedData;
			} catch (error) {
				if (error === ABORT_SIGNAL) {
					return ABORT_SIGNAL;
				}

				throw error;
			}
		},
		isReady: async () => {
			const url = new URL(`${lokiUrl}/ready`);

			const response = await fetch(url);
			const responseText = await response.text();

			return !responseText.includes('Ingester not ready');
		},
		/** https://grafana.com/docs/loki/latest/reference/loki-http-api/#ingest-logs */
		push: async (data: unknown) => {
			const url = new URL(`${lokiUrl}/loki/api/v1/push`);

			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data),
			});

			if (!response.ok) {
				const responseText = await response.text();

				throw new LokiApiError(responseText);
			}

			return;
		},
	};
};
