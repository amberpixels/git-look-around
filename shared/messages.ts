/**
 * Message types for communication between extension components
 */
export const MessageType = {
  TOGGLE_OVERLAY: 'TOGGLE_OVERLAY',
  GET_SYNC_STATUS: 'GET_SYNC_STATUS',
  GET_RATE_LIMIT: 'GET_RATE_LIMIT',
  GET_ALL_REPOS: 'GET_ALL_REPOS',
  GET_ISSUES_BY_REPO: 'GET_ISSUES_BY_REPO',
  GET_PRS_BY_REPO: 'GET_PRS_BY_REPO',
  FORCE_SYNC: 'FORCE_SYNC',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/**
 * Message structure for extension communication
 */
export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}
