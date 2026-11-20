import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['lib/**', 'dist/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tsParser },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
  },
];
