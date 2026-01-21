import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Vue recommended rules
  ...pluginVue.configs['flat/recommended'],

  // Prettier integration (must be last to override formatting rules)
  prettier,

  // Custom configuration
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,vue}'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Browser globals
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        performance: 'readonly',
        // TypeScript types
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        // Browser extension APIs
        browser: 'readonly',
        chrome: 'readonly',
      },
    },
    rules: {
      // Vue-specific rules
      'vue/multi-word-component-names': 'off', // Allow single-word components like App.vue
      'vue/no-v-html': 'warn', // Warn about XSS risks

      // TypeScript rules
      '@typescript-eslint/no-explicit-any': 'warn', // Warn instead of error
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // General code quality
      'no-console': 'off', // Allow all console logs for debugging
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Ignore patterns
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      'dist/**',
      'node_modules/**',
      '*.config.js',
      '*.config.ts',
      'output-dev',
    ],
  },
);
