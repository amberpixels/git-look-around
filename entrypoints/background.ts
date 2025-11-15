export default defineBackground(() => {
  console.log('Gitjump background initialized', { id: browser.runtime.id });

  // Listen for keyboard command
  browser.commands.onCommand.addListener((command) => {
    if (command === 'toggle-overlay') {
      // Send message to active tab's content script
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs[0]?.id) {
          browser.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_OVERLAY' });
        }
      });
    }
  });
});
