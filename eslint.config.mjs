import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
	{
		files: ['**/*.{js,mjs,cjs,ts}'],
	},
	{
		ignores: ['dev/npm-check/**/*', 'dist/**/*', 'test-outputs/**/*', 'output/**/*'],
	},
	{ languageOptions: { globals: globals.node } },
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	eslintConfigPrettier,
	{
		rules: {
			'no-useless-catch': 'off',
		},
	},
];
