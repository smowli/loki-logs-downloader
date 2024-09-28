export class BaseError extends Error {}

export class UnrecoverableError extends BaseError {}

export class MaxEntriesLimitPerQueryExceeded extends UnrecoverableError {
	message = 'max entries limit per query exceeded';
}

export const LOKI_API_ERRORS = {
	queryMaxLimit: 'max entries limit per query exceeded',
};
