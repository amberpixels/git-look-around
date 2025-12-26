/**
 * GitHub OAuth Device Flow Service
 *
 * Handles Device Flow authentication for browser extensions
 */

import {
  requestDeviceCode,
  pollForAccessToken,
  type DeviceCodeResponse as _DeviceCodeResponse,
  type AccessTokenResponse as _AccessTokenResponse,
} from './oauth-config';
import {
  saveGitHubToken,
  saveAuthMetadata,
  removeGitHubToken,
  removeAuthMetadata,
} from '@/src/storage/chrome';
import { validateToken } from '@/src/api/github';
import { debugLog } from '@/src/utils/debug';

export interface DeviceFlowResult {
  success: boolean;
  token?: string;
  error?: string;
  userCode?: string;
  verificationUri?: string;
  expiresIn?: number;
  deviceCode?: string;
  interval?: number;
}

/**
 * Start Device Flow: Request device code from GitHub
 *
 * @returns Device code info to show to user
 */
export async function startDeviceFlow(): Promise<DeviceFlowResult> {
  try {
    void debugLog('[Device Flow] Requesting device code...');

    const deviceCodeResponse = await requestDeviceCode();

    void debugLog('[Device Flow] Device code received');
    void debugLog('[Device Flow] User code:', deviceCodeResponse.user_code);
    void debugLog('[Device Flow] Verification URI:', deviceCodeResponse.verification_uri);
    void debugLog('[Device Flow] Expires in:', deviceCodeResponse.expires_in, 'seconds');

    return {
      success: true,
      userCode: deviceCodeResponse.user_code,
      verificationUri: deviceCodeResponse.verification_uri,
      expiresIn: deviceCodeResponse.expires_in,
      deviceCode: deviceCodeResponse.device_code,
      interval: deviceCodeResponse.interval,
    };
  } catch (error) {
    console.error('[Device Flow] Failed to start device flow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start device flow',
    };
  }
}

/**
 * Complete Device Flow: Poll for access token
 *
 * This function polls GitHub until the user authorizes or the code expires.
 *
 * @param deviceCode The device_code from startDeviceFlow()
 * @param interval Polling interval in seconds
 * @param expiresIn Expiration time in seconds
 * @param onProgress Callback for progress updates
 * @returns Access token or error
 */
export async function completeDeviceFlow(
  deviceCode: string,
  interval: number,
  expiresIn: number,
  onProgress?: (status: string) => void,
): Promise<DeviceFlowResult> {
  const startTime = Date.now();
  const expirationTime = startTime + expiresIn * 1000;
  let pollInterval = interval * 1000; // Convert to milliseconds

  void debugLog('[Device Flow] Starting to poll for authorization...');
  void debugLog('[Device Flow] Poll interval:', interval, 'seconds');
  void debugLog('[Device Flow] Expires in:', expiresIn, 'seconds');

  while (Date.now() < expirationTime) {
    try {
      onProgress?.('Waiting for authorization...');

      const response = await pollForAccessToken(deviceCode);

      // Success - got access token
      if (response.access_token) {
        void debugLog('[Device Flow] Access token received!');

        // Save token
        await saveGitHubToken(response.access_token);

        // Validate token
        const isValid = await validateToken();
        if (!isValid) {
          console.error('[Device Flow] Token validation failed');
          await removeGitHubToken();
          return {
            success: false,
            error: 'Token validation failed',
          };
        }

        // Save metadata
        await saveAuthMetadata({
          method: 'oauth',
          authenticatedAt: Date.now(),
        });

        void debugLog('[Device Flow] Authentication successful!');

        return {
          success: true,
          token: response.access_token,
        };
      }

      // Handle errors
      if (response.error) {
        switch (response.error) {
          case 'authorization_pending':
            // User hasn't authorized yet - continue polling
            void debugLog('[Device Flow] Authorization pending, continuing to poll...');
            break;

          case 'slow_down':
            // GitHub wants us to slow down polling
            pollInterval += 5000; // Add 5 seconds to interval
            void debugLog(
              '[Device Flow] Slowing down poll interval to:',
              pollInterval / 1000,
              'seconds',
            );
            break;

          case 'expired_token':
            console.error('[Device Flow] Device code expired');
            return {
              success: false,
              error: 'Device code expired. Please try again.',
            };

          case 'access_denied':
            console.error('[Device Flow] User denied authorization');
            return {
              success: false,
              error: 'Authorization denied',
            };

          default:
            console.error('[Device Flow] Unknown error:', response.error);
            return {
              success: false,
              error: response.error_description || response.error,
            };
        }
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('[Device Flow] Polling error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Polling failed',
      };
    }
  }

  // Timeout - code expired
  console.error('[Device Flow] Polling timeout - code expired');
  return {
    success: false,
    error: 'Authentication timeout. Please try again.',
  };
}

/**
 * Sign out and clear OAuth token and metadata
 */
export async function signOut(): Promise<void> {
  await removeGitHubToken();
  await removeAuthMetadata();

  void debugLog('[Device Flow] Signed out successfully');
}
