/**
 * GitHub OAuth Device Flow configuration
 *
 * Device Flow is designed for apps that can't securely store a client secret,
 * such as browser extensions, CLI tools, and desktop apps.
 *
 * Flow:
 * 1. Request device code from GitHub
 * 2. Show user the code and verification URL
 * 3. User visits github.com/login/device and enters code
 * 4. Poll GitHub for access token
 * 5. Receive token once user authorizes
 */

// Environment detection
const isDevelopment = import.meta.env.MODE === 'development';

// GitHub OAuth Client IDs
const GITHUB_OAUTH_CLIENT_ID_DEV = 'Ov23li6ZFZqbR6ELZ2kW';
const GITHUB_OAUTH_CLIENT_ID_PROD = 'Ov23liNIryeGDg0Tb6Hg';

// Device Flow endpoints
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/**
 * Get the OAuth Client ID for the current environment
 */
export function getOAuthClientId(): string {
  return isDevelopment ? GITHUB_OAUTH_CLIENT_ID_DEV : GITHUB_OAUTH_CLIENT_ID_PROD;
}

/**
 * Device Flow: Request a device code from GitHub
 *
 * @returns Device code response with user_code, verification_uri, etc.
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const clientId = getOAuthClientId();
  const scopes = 'repo read:user read:org';

  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: scopes,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to request device code: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Device Flow: Poll for access token
 *
 * @param deviceCode The device_code from requestDeviceCode()
 * @returns Access token response or pending/error status
 */
export async function pollForAccessToken(deviceCode: string): Promise<AccessTokenResponse> {
  const clientId = getOAuthClientId();

  const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to poll for access token: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Device code response from GitHub
 */
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/**
 * Access token response from GitHub
 */
export interface AccessTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string; // "authorization_pending", "slow_down", "expired_token", "access_denied"
  error_description?: string;
}
