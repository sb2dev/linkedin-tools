import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // A port implementation returns a Promise because the interface says so, awaited or not.
      '@typescript-eslint/require-await': 'off',
      // Comparing a status number against HttpStatus is how Nest itself reads.
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // Tests feed deliberately malformed input, which is the point of them.
    files: ['**/*.spec.ts', 'src/test/**'],
    rules: {
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
