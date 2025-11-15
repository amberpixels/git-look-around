import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export default defineContentScript({
  matches: ["*://github.com/*", "*://*.github.com/*"],
  main(ctx) {
    console.log("Gitjump content script loaded on GitHub");

    // Create overlay popup
    const overlay = createOverlay(ctx);

    // Listen for hotkey command
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === "TOGGLE_OVERLAY") {
        overlay.toggle();
      }
    });
  },
});

function createOverlay(ctx: ContentScriptContext) {
  let overlayElement: HTMLDivElement | null = null;

  return {
    toggle() {
      if (overlayElement) {
        this.hide();
      } else {
        this.show();
      }
    },

    show() {
      if (overlayElement) return;

      // Create overlay container
      overlayElement = document.createElement("div");
      overlayElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
      `;

      // Create popup box
      const popup = document.createElement("div");
      popup.style.cssText = `
        background: white;
        padding: 40px;
        border-radius: 8px;
        font-size: 24px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;
      popup.textContent = "Hello Github";

      overlayElement.appendChild(popup);

      // Close on click outside or Escape
      overlayElement.addEventListener("click", (e) => {
        if (e.target === overlayElement) {
          this.hide();
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && overlayElement) {
          this.hide();
        }
      });

      document.body.appendChild(overlayElement);
    },

    hide() {
      if (overlayElement) {
        overlayElement.remove();
        overlayElement = null;
      }
    },
  };
}
