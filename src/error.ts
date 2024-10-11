export class StandardError extends Error {}

/** Step can't be retried or repeated - usually due to invalid user configuration. Program has to exit. */
export class UnrecoverableError extends StandardError {}

export class OutputDirNotEmptyError extends StandardError {}
