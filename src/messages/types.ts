/**
 * Message types for communication between extension components
 */
export const MessageType = {
  TOGGLE_OVERLAY: 'TOGGLE_OVERLAY',
  GET_IMPORT_STATUS: 'GET_IMPORT_STATUS',
  GET_RATE_LIMIT: 'GET_RATE_LIMIT',
  GET_ALL_REPOS: 'GET_ALL_REPOS',
  GET_ISSUES_BY_REPO: 'GET_ISSUES_BY_REPO',
  GET_PRS_BY_REPO: 'GET_PRS_BY_REPO',
  FORCE_IMPORT: 'FORCE_IMPORT',
  RECORD_VISIT: 'RECORD_VISIT',
  SET_REPO_INDEXED: 'SET_REPO_INDEXED',
  SET_QUICK_CHECK_BROWSING: 'SET_QUICK_CHECK_BROWSING',
  SET_QUICK_CHECK_IDLE: 'SET_QUICK_CHECK_IDLE',
  SEARCH: 'SEARCH',
  DEBUG_SEARCH: 'DEBUG_SEARCH',
  CACHE_UPDATED: 'CACHE_UPDATED',
  FETCH_AND_SAVE_PR: 'FETCH_AND_SAVE_PR',
  FETCH_AND_SAVE_ISSUE: 'FETCH_AND_SAVE_ISSUE',
  TOKEN_SAVED: 'TOKEN_SAVED',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/**
 * Message structure for extension communication
 */
export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}
