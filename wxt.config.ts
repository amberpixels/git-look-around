import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Git Look Around',
    description: 'GitHub fuzzy finder for quick navigation to repos, PRs, and issues',
    version: '0.1.0',
    permissions: ['storage'],
    commands: {
      'toggle-overlay': {
        suggested_key: {
          default: 'Ctrl+Shift+K',
          mac: 'Command+Shift+K',
        },
        description: 'Toggle Git-Look-Around overlay',
      },
    },
  },
});
