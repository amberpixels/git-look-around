/**
 * Message types for communication between extension components
 */
export const MessageType = {
  TOGGLE_OVERLAY: 'TOGGLE_OVERLAY',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/**
 * Message structure for extension communication
 */
export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}
