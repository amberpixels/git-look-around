import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'GitHub Look-Around',
    description: 'Lightning-fast Github Command Palette to repos, PRs, and issues',
    version: '0.3.2',
    permissions: ['storage'],
    commands: {
      'toggle-overlay': {
        suggested_key: {
          default: 'Ctrl+Shift+K',
          mac: 'Command+Shift+K',
        },
        description: 'Toggle Command Palette',
      },
    },
  },
});
