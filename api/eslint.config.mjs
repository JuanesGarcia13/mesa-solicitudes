import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
      'max-depth': ['error', 3],
      'max-params': ['error', 5],
      complexity: ['error', 10],
    },
  },
  {
    files: ['src/scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
