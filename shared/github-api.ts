/**
 * GitHub API client with authentication
 */

import { getGitHubToken } from './storage';
import { getMeta, setMeta } from './db';
import type { GitHubRepo, GitHubIssue, GitHubPullRequest } from './types';

const GITHUB_API_BASE = 'https://api.github.com';
const RATE_LIMIT_META_KEY = 'rate_limit_info';

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  used: number;
  reset: number; // Unix timestamp
}

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

  // Extract rate limit info from headers
  const limit = response.headers.get('x-ratelimit-limit');
  const remaining = response.headers.get('x-ratelimit-remaining');
  const used = response.headers.get('x-ratelimit-used');
  const reset = response.headers.get('x-ratelimit-reset');

  if (limit && remaining && used && reset) {
    const rateLimitInfo: RateLimitInfo = {
      limit: parseInt(limit, 10),
      remaining: parseInt(remaining, 10),
      used: parseInt(used, 10),
      reset: parseInt(reset, 10),
    };
    // Store in IndexedDB so it's accessible from all contexts (popup, content script)
    await setMeta(RATE_LIMIT_META_KEY, rateLimitInfo);
    console.warn('[GitHub API] Rate limit updated:', rateLimitInfo);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid GitHub token. Please update in extension settings.');
    }
    if (response.status === 403 && remaining === '0') {
      const resetDate = reset ? new Date(parseInt(reset, 10) * 1000) : null;
      throw new Error(
        `GitHub API rate limit exceeded. Resets at ${resetDate?.toLocaleTimeString() || 'unknown'}`,
      );
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response;
}

/**
 * Get the last known rate limit info from IndexedDB
 */
export async function getLastRateLimit(): Promise<RateLimitInfo | null> {
  const value = await getMeta(RATE_LIMIT_META_KEY);
  return value as RateLimitInfo | null;
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

/**
 * Get all issues for a repository
 * Note: GitHub's API returns PRs in the issues endpoint, so we filter them out
 */
export async function getRepoIssues(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'all',
): Promise<GitHubIssue[]> {
  const allIssues: GitHubIssue[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await githubFetch(
      `/repos/${owner}/${repo}/issues?per_page=100&state=${state}&page=${page}`,
    );
    const issues: GitHubIssue[] = await response.json();

    // Filter out pull requests (they have a pull_request field)
    const actualIssues = issues.filter((issue) => !issue.pull_request);
    allIssues.push(...actualIssues);

    const linkHeader = response.headers.get('link');
    hasMore = linkHeader?.includes('rel="next"') ?? false;
    page++;
  }

  return allIssues;
}

/**
 * Get pull requests for a repository
 * Fetches open PRs and last 50 closed PRs (sorted by recently updated)
 */
export async function getRepoPullRequests(
  owner: string,
  repo: string,
): Promise<GitHubPullRequest[]> {
  const allPRs: GitHubPullRequest[] = [];

  // Fetch all open PRs
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const response = await githubFetch(
      `/repos/${owner}/${repo}/pulls?per_page=100&state=open&page=${page}`,
    );
    const prs: GitHubPullRequest[] = await response.json();
    allPRs.push(...prs);

    const linkHeader = response.headers.get('link');
    hasMore = linkHeader?.includes('rel="next"') ?? false;
    page++;
  }

  // Fetch last 50 closed PRs (sorted by recently updated)
  const closedResponse = await githubFetch(
    `/repos/${owner}/${repo}/pulls?per_page=50&state=closed&sort=updated&direction=desc`,
  );
  const closedPRs: GitHubPullRequest[] = await closedResponse.json();
  allPRs.push(...closedPRs);

  return allPRs;
}
