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
  // Date fields
  created_at: string; // ISO 8601 format
  updated_at: string; // ISO 8601 format
  pushed_at: string | null; // ISO 8601 format, null if never pushed
  // Activity metrics
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  size: number; // Repository size in KB
  // Repository flags
  private: boolean;
  archived: boolean;
  default_branch: string;
}

/**
 * Get user's repositories with pagination
 * Fetches all repositories across multiple pages
 */
export async function getUserRepos(): Promise<GitHubRepo[]> {
  const allRepos: GitHubRepo[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await githubFetch(`/user/repos?per_page=100&sort=pushed&page=${page}`);
    const repos: GitHubRepo[] = await response.json();
    allRepos.push(...repos);

    // Check Link header for rel="next" to determine if there are more pages
    const linkHeader = response.headers.get('link');
    hasMore = linkHeader?.includes('rel="next"') ?? false;
    page++;
  }

  return allRepos;
}
