/**
 * Check if authenticated user is a contributor to a repository
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
