import eslint from '@eslint/js'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      'coverage/**',
      'eslint.config.mjs',
      'node_modules/**',
      'playwright-report/**',
      'test-results*/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'vue/block-lang': ['error', { script: { lang: 'ts' } }],
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'vue',
                'wxt',
                'wxt/*',
                '**/application/**',
                '**/platform/**',
                '**/storage/**',
                '**/ui/**',
                '@/application/*',
                '@/platform/*',
                '@/storage/*',
                '@/ui/*',
              ],
              message: 'The domain layer must remain framework and platform independent.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vue', 'wxt', 'wxt/*', '**/platform/**', '**/ui/**'],
              message:
                'Application services may depend on domain and abstract ports, not browser or UI implementations.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/storage/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vue', '**/platform/**', '**/ui/**'],
              message: 'Storage implementations must not depend on browser platform or UI modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.ts', 'src/ui/**/*.vue', 'entrypoints/**/*.vue'],
    languageOptions: {
      globals: {
        document: 'readonly',
        history: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/platform/**'],
              message:
                'UI modules must use application-facing clients instead of platform adapters.',
            },
          ],
        },
      ],
      'vue/no-bare-strings-in-template': 'error',
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['scripts/**/*.mjs', 'tests/e2e/fixtures/control-extension/*.js', 'tests/soak/**/*.mjs'],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
)
