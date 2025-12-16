/**
 * GitHub API client with authentication
 */

import { getGitHubToken } from '@/src/storage/chrome';
import { getMeta, setMeta } from '@/src/storage/db';
import type { GitHubRepo, GitHubIssue, GitHubPullRequest, GitHubOrg } from '@/src/types';

const GITHUB_API_BASE = 'https://api.github.com';
const RATE_LIMIT_META_KEY = 'rate_limit_info';
let userInvolvedSearchDisabled = false; // Disable search-based PR fetch once it fails in a session

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
 * Get repository details by full name (owner/repo)
 * Useful to resolve parent info for forks
 */
export async function getRepoByFullName(fullName: string): Promise<GitHubRepo> {
  const response = await githubFetch(`/repos/${fullName}`);
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
 * Get a single issue by number
 * Useful for fetching issues that might not be in the initial sync
 */
export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GitHubIssue> {
  const response = await githubFetch(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  return response.json() as Promise<GitHubIssue>;
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

/**
 * Get a single pull request by number
 * Useful for fetching PRs that aren't in the top 50 closed PRs
 */
export async function getPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GitHubPullRequest> {
  const response = await githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  return response.json() as Promise<GitHubPullRequest>;
}

/**
 * Get pull requests where the user is involved (author, assignee, or reviewer)
 * Uses the search API to avoid pulling every PR from large upstream repos
 */
export async function getUserInvolvedPullRequests(
  owner: string,
  repo: string,
  username: string,
): Promise<GitHubPullRequest[]> {
  const prNumbers = new Set<number>();
  let searchErrored = false;

  if (userInvolvedSearchDisabled) {
    console.warn(
      `[GitHub API] Skipping search (disabled after previous failures); using fallback for ${owner}/${repo}`,
    );
    return getRepoPullRequests(owner, repo).then((allPRs) =>
      allPRs.filter((pr) => isUserInvolvedInPR(pr, username)),
    );
  }

  async function searchPRs(query: string): Promise<void> {
    let page = 1;
    let hasMore = true;
    let matchesThisQuery = 0;

    while (hasMore) {
      const response = await githubFetch(
        `/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}`,
      );
      const data = await response.json();
      const items = (data.items || []) as Array<{ number: number }>;

      for (const item of items) {
        if (item?.number) {
          matchesThisQuery++;
          prNumbers.add(item.number);
        }
      }

      const linkHeader = response.headers.get('link');
      hasMore = linkHeader?.includes('rel="next"') ?? false;
      page++;
    }

    console.warn(
      `[GitHub API] Search PRs query="${query}" -> found ${matchesThisQuery} (running total: ${prNumbers.size})`,
    );
  }

  // Collect PR numbers from involvement queries
  const baseQuery = `repo:${owner}/${repo}+is:pr`;
  // Use narrower queries (author/assignee/review-requested) to avoid 1000-result search caps on large repos
  const queries = [
    `${baseQuery}+is:open+author:${username}`,
    `${baseQuery}+is:closed+author:${username}`,
    `${baseQuery}+is:open+assignee:${username}`,
    `${baseQuery}+is:closed+assignee:${username}`,
    `${baseQuery}+is:open+review-requested:${username}`,
    `${baseQuery}+is:closed+review-requested:${username}`,
  ];

  for (const query of queries) {
    try {
      await searchPRs(query);
    } catch (error) {
      searchErrored = true;
      userInvolvedSearchDisabled = true; // Disable for rest of session to avoid repeated 422s
      console.warn(
        `[GitHub API] Search PRs query="${query}" failed, will consider fallback. Error:`,
        error,
      );
      break;
    }
  }

  if (prNumbers.size > 0) {
    console.warn(
      `[GitHub API] Fetching full PR details for ${prNumbers.size} involved PRs in ${owner}/${repo}`,
    );

    // Fetch full PR details for each matched number
    const prs = await Promise.all(
      Array.from(prNumbers).map(async (number) => {
        const response = await githubFetch(`/repos/${owner}/${repo}/pulls/${number}`);
        return response.json() as Promise<GitHubPullRequest>;
      }),
    );

    return prs;
  }

  // Fallback: search failed or returned nothing—fetch repo PRs and filter for involvement
  console.warn(
    `[GitHub API] Falling back to full PR fetch for ${owner}/${repo} (searchErrored=${searchErrored} searchDisabled=${userInvolvedSearchDisabled})`,
  );
  const allPRs = await getRepoPullRequests(owner, repo);
  return allPRs.filter((pr) => isUserInvolvedInPR(pr, username));
}

function isUserInvolvedInPR(pr: GitHubPullRequest, username: string): boolean {
  if (pr.user?.login === username) return true;
  if (pr.assignee?.login === username) return true;
  if (pr.assignees?.some((assignee) => assignee.login === username)) return true;
  if (pr.requested_reviewers?.some((reviewer) => reviewer.login === username)) return true;
  return false;
}

/**
 * Get user's organizations
 */
export async function getUserOrganizations(): Promise<GitHubOrg[]> {
  const response = await githubFetch('/user/orgs?per_page=100');
  const orgs: GitHubOrg[] = await response.json();
  return orgs;
}

/**
 * Get repositories for a specific organization
 */
export async function getOrgRepos(orgName: string): Promise<GitHubRepo[]> {
  const allRepos: GitHubRepo[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await githubFetch(
      `/orgs/${orgName}/repos?per_page=100&sort=pushed&page=${page}`,
    );
    const repos: GitHubRepo[] = await response.json();
    allRepos.push(...repos);

    // Check Link header for rel="next"
    const linkHeader = response.headers.get('link');
    hasMore = linkHeader?.includes('rel="next"') ?? false;
    page++;
  }

  return allRepos;
}

/**
 * Get all repositories (user repos + all organization repos)
 */
export async function getAllAccessibleRepos(currentUserLogin?: string): Promise<{
  repos: GitHubRepo[];
  personalForkParentRepoIds: number[];
}> {
  // Fetch user's personal repos
  const userRepos = await getUserRepos();

  // Fetch user's organizations
  const orgs = await getUserOrganizations();

  // Fetch repos for each organization
  const orgReposPromises = orgs.map((org) => getOrgRepos(org.login));
  const orgReposArrays = await Promise.all(orgReposPromises);

  // Flatten all org repos
  const allOrgRepos = orgReposArrays.flat();

  // Resolve original repos for personal forks so PRs on upstreams are discoverable
  const personalForks =
    currentUserLogin != null
      ? userRepos.filter((repo) => repo.fork && repo.owner.login === currentUserLogin)
      : [];

  const forkParents = (
    await Promise.all(
      personalForks.map(async (fork) => {
        try {
          // The list endpoint may include parent; if not, fetch the repo to resolve it
          if (fork.parent) {
            return fork.parent;
          }

          const detailedRepo = await getRepoByFullName(fork.full_name);
          return detailedRepo.parent || null;
        } catch (error) {
          console.warn(`[GitHub API] Failed to resolve parent for fork ${fork.full_name}:`, error);
          return null;
        }
      }),
    )
  ).filter((parent): parent is GitHubRepo => parent !== null);

  // Combine and deduplicate (user might have forked an org repo)
  const allRepos = [...userRepos, ...allOrgRepos, ...forkParents];
  const uniqueRepos = Array.from(new Map(allRepos.map((repo) => [repo.id, repo])).values());

  return {
    repos: uniqueRepos,
    personalForkParentRepoIds: forkParents.map((repo) => repo.id),
  };
}

/**
 * Get only the first page of recently pushed repos (lightweight for quick checks)
 * Returns top N repos sorted by most recently pushed
 */
export async function getRecentlyPushedRepos(limit: number = 20): Promise<GitHubRepo[]> {
  const allRepos: GitHubRepo[] = [];

  // Fetch first page of user repos (sorted by pushed)
  const userReposResponse = await githubFetch(`/user/repos?per_page=${limit}&sort=pushed&page=1`);
  const userRepos: GitHubRepo[] = await userReposResponse.json();
  allRepos.push(...userRepos);

  // Fetch first page of org repos for each org
  const orgs = await getUserOrganizations();
  const orgReposPromises = orgs.map(async (org) => {
    const response = await githubFetch(
      `/orgs/${org.login}/repos?per_page=${limit}&sort=pushed&page=1`,
    );
    return response.json() as Promise<GitHubRepo[]>;
  });
  const orgReposArrays = await Promise.all(orgReposPromises);
  const allOrgRepos = orgReposArrays.flat();
  allRepos.push(...allOrgRepos);

  // Deduplicate and sort by pushed_at (most recent first)
  const uniqueRepos = Array.from(new Map(allRepos.map((repo) => [repo.id, repo])).values());
  uniqueRepos.sort((a, b) => {
    const dateA = a.pushed_at ? new Date(a.pushed_at).getTime() : 0;
    const dateB = b.pushed_at ? new Date(b.pushed_at).getTime() : 0;
    return dateB - dateA; // Descending order (most recent first)
  });

  // Return top N repos
  return uniqueRepos.slice(0, limit);
}

/**
 * Get top N recently updated PRs for a repo (lightweight for quick checks)
 */
export async function getRecentlyUpdatedPRs(
  owner: string,
  repo: string,
  limit: number = 10,
): Promise<GitHubPullRequest[]> {
  const response = await githubFetch(
    `/repos/${owner}/${repo}/pulls?per_page=${limit}&state=all&sort=updated&direction=desc`,
  );
  return response.json();
}

/**
 * Check if the authenticated user is a contributor to a specific repo
 * This checks commits, not just organization membership
 */
export async function isUserContributor(
  owner: string,
  repo: string,
  username: string,
): Promise<boolean> {
  try {
    // Try to get the user from the contributors list
    // Using pagination to check first page (top 100 contributors)
    const response = await githubFetch(`/repos/${owner}/${repo}/contributors?per_page=100`);
    const contributors = await response.json();

    // Check if our username is in the contributors list
    return contributors.some((contributor: { login: string }) => contributor.login === username);
  } catch (error) {
    // If we get a 404 or error, assume not a contributor
    console.warn(`[isUserContributor] Could not check contributors for ${owner}/${repo}:`, error);
    return false;
  }
}

/**
 * Get the date of the user's last commit to a repo
 * Returns ISO 8601 date string or null if no commits found
 */
export async function getLastContributionDate(
  owner: string,
  repo: string,
  username: string,
): Promise<string | null> {
  try {
    // Get the most recent commit by this user
    const response = await githubFetch(
      `/repos/${owner}/${repo}/commits?author=${username}&per_page=1`,
    );
    const commits = await response.json();

    if (commits.length > 0 && commits[0]?.commit?.author?.date) {
      return commits[0].commit.author.date;
    }

    return null;
  } catch (error) {
    console.warn(
      `[getLastContributionDate] Could not get last contribution for ${owner}/${repo}:`,
      error,
    );
    return null;
  }
}
