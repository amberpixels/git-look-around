/**
 * GitHub API client with authentication
 */

import { getGitHubToken } from './storage';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Make authenticated request to GitHub API
 */
export async function githubFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getGitHubToken();

  if (!token) {
    throw new Error('No GitHub token found. Please authenticate in extension settings.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `token ${token}`);
  headers.set('Accept', 'application/vnd.github.v3+json');

  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid GitHub token. Please update in extension settings.');
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response;
}

/**
 * Get authenticated user info
 */
export async function getAuthenticatedUser() {
  const response = await githubFetch('/user');
  return response.json();
}

/**
 * Test if token is valid
 */
export async function validateToken(): Promise<boolean> {
  try {
    await getAuthenticatedUser();
    return true;
  } catch {
    return false;
  }
}

/**
 * GitHub Repository interface
 */
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  owner: {
    login: string;
  };
}

/**
 * Get user's repositories
 */
export async function getUserRepos(perPage = 10): Promise<GitHubRepo[]> {
  const response = await githubFetch(`/user/repos?per_page=${perPage}&sort=updated`);
  return response.json();
}
