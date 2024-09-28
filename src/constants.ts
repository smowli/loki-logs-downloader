export const START_OF_TODAY = new Date();
START_OF_TODAY.setUTCHours(0, 0, 0, 0);

export const END_OF_TODAY = new Date();
END_OF_TODAY.setUTCHours(23, 59, 59, 999);

export const FOLDERS = {
	internal: '.internal',
	defaultOutputDir: 'output',
	defaultDownloadsDir: 'download',
	state: 'state',
};

export const DEFAULT_LOKI_URL = 'http://localhost:3100';
