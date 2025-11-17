import { createApp } from 'vue';
import App from './App.vue';
import { MessageType } from '@/shared/messages';
import type { ExtensionMessage } from '@/shared/messages';
import { runSync, forceSync, resetSync, getSyncStatus } from '@/shared/sync-engine';

export default defineContentScript({
  matches: ['*://github.com/*', '*://*.github.com/*'],
  main(_ctx) {
    console.log('[Gitjump] Content script loaded on GitHub');

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

    // Expose debug functions via custom events
    // This works around CSP by using DOM events instead of direct script injection

    // Listen for custom events from console
    document.addEventListener('gitjump:forceSync', () => {
      console.log('[Gitjump] Force sync triggered from console');
      forceSync().catch((err) => console.error('[Gitjump] Force sync failed:', err));
    });

    document.addEventListener('gitjump:resetSync', () => {
      console.log('[Gitjump] Reset sync triggered from console');
      resetSync().catch((err) => console.error('[Gitjump] Reset sync failed:', err));
    });

    document.addEventListener('gitjump:getSyncStatus', async () => {
      const status = await getSyncStatus();
      console.log('[Gitjump] Sync Status:', status);
      document.dispatchEvent(new CustomEvent('gitjump:syncStatusResponse', { detail: status }));
    });

    document.addEventListener('gitjump:runSync', () => {
      console.log('[Gitjump] Manual sync triggered from console');
      runSync().catch((err) => console.error('[Gitjump] Manual sync failed:', err));
    });

    console.log(
      `
╔═══════════════════════════════════════════════════════════════╗
║          Gitjump Debug Commands (Copy & Paste):               ║
╠═══════════════════════════════════════════════════════════════╣
║  Force sync:                                                  ║
║  document.dispatchEvent(new Event('gitjump:forceSync'))       ║
║                                                               ║
║  Reset sync:                                                  ║
║  document.dispatchEvent(new Event('gitjump:resetSync'))       ║
║                                                               ║
║  Check status:                                                ║
║  document.dispatchEvent(new Event('gitjump:getSyncStatus'))   ║
║                                                               ║
║  Normal sync:                                                 ║
║  document.dispatchEvent(new Event('gitjump:runSync'))         ║
╚═══════════════════════════════════════════════════════════════╝
    `.trim(),
    );

    // Trigger sync in the background (non-blocking)
    // This will check if sync is needed and run it if appropriate
    runSync().catch((err) => {
      console.error('[Gitjump] Background sync failed:', err);
    });
  },
});
