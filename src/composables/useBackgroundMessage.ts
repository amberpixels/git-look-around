/**
 * Composable for sending messages to background worker
 */
import { MessageType } from '@/src/messages/types';
import type { ExtensionMessage } from '@/src/messages/types';

/**
 * Send a message to the background worker and get typed response
 */
export function useBackgroundMessage() {
  async function sendMessage<T>(type: MessageType, payload?: unknown): Promise<T> {
    const message: ExtensionMessage = { type, payload };
    return new Promise((resolve, reject) => {
      browser.runtime.sendMessage(message, (response) => {
        if (response?.success) {
          resolve(response.data as T);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  }

  return { sendMessage };
}
