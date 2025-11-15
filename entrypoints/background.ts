import { MessageType } from '@/shared/messages';
import type { ExtensionMessage } from '@/shared/messages';

export default defineBackground(() => {
  console.log('Gitjump background initialized', { id: browser.runtime.id });

  // Listen for keyboard command
  browser.commands.onCommand.addListener((command) => {
    if (command === 'toggle-overlay') {
      // Send message to active tab's content script
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs[0]?.id) {
          const message: ExtensionMessage = {
            type: MessageType.TOGGLE_OVERLAY,
          };
          browser.tabs.sendMessage(tabs[0].id, message);
        }
      });
    }
  });
});
