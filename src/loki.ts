import { BaseError, UnrecoverableError } from './error';

export const LOKI_API_ERRORS = {
	queryMaxLimit: 'max entries limit per query exceeded',
};

export class LokiApiError extends BaseError {}

export class UnrecoverableLokiApiError extends UnrecoverableError {}

export class MaxEntriesLimitPerQueryExceeded extends UnrecoverableLokiApiError {
	message = 'max entries limit per query exceeded';
}

const timestampUrlValue = (value: Date | bigint | number) =>
	value instanceof Date ? value.toISOString() : value.toString();

export const createLokiClient = (lokiUrl: string) => {
	return {
		query_range: async ({
			query,
			limit,
			from,
			to,
		}: {
			query: string;
			limit?: number;
			from?: Date | bigint | number;
			to?: Date | bigint | number;
		}) => {
			const url = new URL(`${lokiUrl}/loki/api/v1/query_range`);

			url.searchParams.set('direction', 'FORWARD');
			url.searchParams.set('query', query);
			if (limit) url.searchParams.set('limit', limit.toString());
			if (from) url.searchParams.set('start', timestampUrlValue(from));
			if (to) url.searchParams.set('end', timestampUrlValue(to));

			const response = await fetch(url);

			if (!response.ok) {
				const responseText = await response.text();
				if (responseText.includes(LOKI_API_ERRORS.queryMaxLimit)) {
					throw new MaxEntriesLimitPerQueryExceeded();
				}

				throw new LokiApiError(responseText);
			}

			// TODO: Parse & type response -> remove any types

			return response.json();
		},
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
