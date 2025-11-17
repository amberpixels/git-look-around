import { createApp } from 'vue';
import App from './App.vue';
import { MessageType } from '@/shared/messages';
import type { ExtensionMessage } from '@/shared/messages';

export default defineContentScript({
  matches: ['*://github.com/*', '*://*.github.com/*'],
  main(_ctx) {
    console.warn('[Gitjump] Content script loaded on GitHub');

    // Create container for Vue app
    const container = document.createElement('div');
    container.id = 'gitjump-root';
    document.body.appendChild(container);

    // Mount Vue app
    const app = createApp(App);
    const vm = app.mount(container) as InstanceType<typeof App>;

    // Listen for messages from background script
    browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
      if (message.type === MessageType.TOGGLE_OVERLAY) {
        vm.toggle();
      }
    });

    // Debug commands removed - sync now happens in background worker
    // Use the command palette to manually trigger sync if needed
  },
});
