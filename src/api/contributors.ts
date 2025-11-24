/**
 * Check if authenticated user is a contributor to a repository
 * and get the date of their last contribution
 */

import { githubFetch } from './github';

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
