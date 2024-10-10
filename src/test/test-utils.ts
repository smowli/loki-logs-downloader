import { LokiFetchDirection } from '../loki';
import { FetcherResult, LokiRecord, FetcherFactory } from '../services';
import { nanosecondsToMilliseconds, getNanoseconds } from '../util';

export function createTestFetcherFactory(options: {
	totalRecords: number;
	customData?: (state: { called: number }) => FetcherResult;
	onCalled?: (state: { called: number }) => void;
}): {
	create: FetcherFactory['create'];
	testData: () => {
		lastTimestamp: bigint | undefined;
		batchTimestamps: { from: Date; to: Date }[];
		called: number;
	};
} {
	let lastTimestamp: bigint | undefined;
	let called = 0;
	const batchTimestamps: { from: Date; to: Date }[] = [];
	const aborted = false;
	let generatedRecords = 0;

	return {
		testData: () => ({
			called,
			lastTimestamp,
			batchTimestamps,
			aborted,
		}),
		create({ fetchDirection }) {
			return async ({ from, limit, abort }) => {
				called++;
				options?.onCalled?.({ called });

				if (abort.aborted) {
					return { returnedRecords: [], pointer: undefined };
				}

				const remainingRecords = options.totalRecords - generatedRecords;

				if (options.totalRecords - generatedRecords === 0) {
					return { returnedRecords: [], pointer: undefined };
				}

				const recordCount = Math.min(limit, remainingRecords);

				const getRecord = (increment = 0) => {
					const date = new Date(Number(nanosecondsToMilliseconds(from)) + increment);
					return {
						record:
							fetchDirection === LokiFetchDirection.FORWARD
								? `log line: ${remainingRecords - increment}`
								: `log line: ${generatedRecords + increment + 1}`,
						rawTimestamp: getNanoseconds(date),
						timestamp: date,
					};
				};

				const records: LokiRecord[] = Array.from({ length: recordCount }).map((_, index) =>
					getRecord(index)
				);

				const pointer = recordCount === limit ? getRecord(limit + 1) : records.at(-1)!;

				batchTimestamps.push({
					from: records[0].timestamp,
					to: records.at(-1)!.timestamp,
				});

				const data = options.customData?.({ called }) || {
					returnedRecords: records,
					pointer: pointer,
				};

				lastTimestamp = pointer.rawTimestamp;
				generatedRecords += recordCount;

				return data;
			};
		},
	};
}
