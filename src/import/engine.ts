/**
 * Import Engine - Handles importing data from GitHub to IndexedDB
 * Completely decoupled from UI - runs independently and saves in chunks
 */

import {
  getAllAccessibleRepos,
  getRepoIssues,
  getRepoPullRequests,
  getUserInvolvedPullRequests,
  getAuthenticatedUser,
  getRecentlyPushedRepos,
  getRecentlyUpdatedPRs,
} from '@/src/api/github';

import {
  saveRepos,
  saveIssues,
  savePullRequests,
  getMeta,
  setMeta,
  getRepo,
} from '@/src/storage/db';

import { getImportPreferences } from '@/src/storage/chrome';
import { isUserContributor, getLastContributionDate } from '@/src/api/github';
import type { IssueRecord, PullRequestRecord } from '@/src/types';

// Repos with last update older than 6 months are NOT indexed by default
// (unless manually indexed or me_contributing is true)
const INDEXED_ACTIVITY_THRESHOLD_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months

// Maximum number of "repos of interest" to index (to avoid excessive importing)
const MAX_INDEXED_REPOS = 100;

/**
 * Import status stored in IndexedDB meta
 */
export interface ImportStatus {
  isRunning: boolean;
  lastStartedAt: number | null;
  lastCompletedAt: number | null;
  lastError: string | null;
  accountLogin: string | null; // GitHub username (e.g. "amberpixels")
  progress: {
    totalRepos: number; // Total repos
    indexedRepos: number; // Number of indexed repos (actively imported)
    nonIndexedRepos: number; // Number of non-indexed repos (skipped)
    issuesProgress: number; // How many indexed repos have issues imported
    prsProgress: number; // How many indexed repos have PRs imported
    currentRepo: string | null;
  };
}

const IMPORT_STATUS_KEY = 'import_status';
const MIN_IMPORT_INTERVAL_MS = 3 * 60 * 1000; // Don't import more often than every 3 minutes

/**
 * Get current import status
 */
export async function getImportStatus(): Promise<ImportStatus> {
  const status = await getMeta(IMPORT_STATUS_KEY);
  return (
    (status as ImportStatus) || {
      isRunning: false,
      lastStartedAt: null,
      lastCompletedAt: null,
      lastError: null,
      accountLogin: null,
      progress: {
        totalRepos: 0,
        indexedRepos: 0,
        nonIndexedRepos: 0,
        issuesProgress: 0,
        prsProgress: 0,
        currentRepo: null,
      },
    }
  );
}

/**
 * Update import status
 * Exported for use in background initialization to clear stuck states
 */
export async function updateImportStatus(updates: Partial<ImportStatus>): Promise<void> {
  const current = await getImportStatus();
  const newStatus = { ...current, ...updates };
  await setMeta(IMPORT_STATUS_KEY, newStatus);
}

/**
 * Check if we should run a import (not running, enough time passed)
 */
export async function shouldRunImport(): Promise<boolean> {
  const status = await getImportStatus();

  // Check if import is stuck (running for more than 30 minutes)
  const STUCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  if (status.isRunning && status.lastStartedAt) {
    const runningSince = Date.now() - status.lastStartedAt;
    if (runningSince > STUCK_TIMEOUT_MS) {
      console.warn(
        `[Import] Import appears stuck (running for ${Math.round(runningSince / 1000 / 60)}min), forcing reset...`,
      );
      // Force reset the stuck import
      await updateImportStatus({
        isRunning: false,
        lastError: 'Import timeout - automatically reset',
      });
    } else {
      console.warn('[Import] Already running, skipping...');
      return false;
    }
  } else if (status.isRunning) {
    // isRunning but no lastStartedAt? Something is wrong, reset it
    console.warn('[Import] Inconsistent state detected (running but no start time), resetting...');
    await updateImportStatus({
      isRunning: false,
      lastError: 'Inconsistent state - automatically reset',
    });
  }

  // Check if enough time has passed since last import
  if (status.lastCompletedAt) {
    const timeSinceLastSync = Date.now() - status.lastCompletedAt;
    if (timeSinceLastSync < MIN_IMPORT_INTERVAL_MS) {
      console.warn(
        `[Import]Last import was ${Math.round(timeSinceLastSync / 1000)}s ago, skipping...`,
      );
      return false;
    }
  }

  return true;
}

/**
 * Determine if repo is a "repo of interest" (should be indexed/imported with issues/PRs)
 *
 * A repo is "of interest" if:
 * 1. Manually indexed (indexed_manually = true) - always included
 * 2. You own the repo (owner.login === currentUser) - your personal repos
 * 3. You're a contributor (me_contributing = true) - even if old/inactive
 * 4. Has recent activity (pushed within last 6 months)
 *
 * Note: We'll apply a limit of MAX_INDEXED_REPOS to avoid excessive importing
 */
function isRepoOfInterest(repo: {
  pushed_at: string | null;
  me_contributing?: boolean;
  indexed_manually?: boolean;
  is_owned_by_me?: boolean;
  is_parent_of_my_fork?: boolean;
}): boolean {
  // Manual override always wins
  if (repo.indexed_manually) {
    return true;
  }

  // You own the repo = always of interest (personal repos)
  if (repo.is_owned_by_me) {
    return true;
  }

  // Upstream of my fork (we need its PRs)
  if (repo.is_parent_of_my_fork) {
    return true;
  }

  // You're contributing = always of interest (even if old)
  if (repo.me_contributing === true) {
    return true;
  }

  // Has recent activity (within 6 months) = of interest
  if (repo.pushed_at) {
    const lastPush = new Date(repo.pushed_at).getTime();
    const now = Date.now();
    if (now - lastPush <= INDEXED_ACTIVITY_THRESHOLD_MS) {
      return true;
    }
  }

  console.info('Skipping ');
  // Default: not of interest
  return false;
}

/**
 * Main import function - imports all data from GitHub to IndexedDB
 * Saves data in chunks as it fetches, so UI can display partial results
 */
export async function runImport(): Promise<void> {
  const canRun = await shouldRunImport();
  if (!canRun) {
    console.warn('[Import] Skipping import - shouldRunImport returned false');
    return;
  }

  console.warn('[Import] Starting import...');

  try {
    // Step 0: Get import preferences and user info
    const preferences = await getImportPreferences();
    const user = await getAuthenticatedUser();
    const accountLogin = user.login || null;
    console.warn(`[Import] Importing account: ${accountLogin}`);
    console.warn(
      `[Import]Preferences: Issues=${preferences.importIssues}, PRs=${preferences.importPullRequests}`,
    );

    // Mark import as running
    await updateImportStatus({
      isRunning: true,
      lastStartedAt: Date.now(),
      lastError: null,
      accountLogin,
      progress: {
        totalRepos: 0,
        indexedRepos: 0,
        nonIndexedRepos: 0,
        issuesProgress: 0,
        prsProgress: 0,
        currentRepo: null,
      },
    });

    // Step 1: Fetch all repos (user + organizations) and count them
    console.warn('[Import] Fetching repositories (user + organizations)...');
    const { repos: allRepos, personalForkParentRepoIds } = await getAllAccessibleRepos(
      accountLogin || undefined,
    );
    const forkParentRepoIds = new Set(personalForkParentRepoIds);
    console.warn(
      `[Import] Found ${allRepos.length} total repositories (${forkParentRepoIds.size} upstream(s) of your forks)`,
    );

    // Check contributor status and determine "repos of interest"
    console.warn('[Import] Checking contributor status and repos of interest...');
    const repoRecords = await Promise.all(
      allRepos.map(async (repo) => {
        const [owner, repoName] = repo.full_name.split('/');
        let meContributing = false;
        let lastContributedAt: string | null = null;

        try {
          meContributing = await isUserContributor(owner, repoName, accountLogin);

          // If user is a contributor, get the date of their last contribution
          if (meContributing) {
            lastContributedAt = await getLastContributionDate(owner, repoName, accountLogin);
          }
        } catch (err) {
          console.warn(`[Import]Could not check contributor status for ${repo.full_name}:`, err);
        }

        // Get existing repo to preserve indexed_manually flag AND visit tracking
        const existingRepo = await getRepo(repo.id);
        const indexedManually = existingRepo?.indexed_manually || false;

        // Check if user owns this repo (personal repos)
        const isOwnedByMe = accountLogin ? repo.owner.login === accountLogin : false;
        const isParentOfMyFork = forkParentRepoIds.has(repo.id);

        // Determine if this is a "repo of interest"
        const indexed = isRepoOfInterest({
          pushed_at: repo.pushed_at,
          me_contributing: meContributing,
          indexed_manually: indexedManually,
          is_owned_by_me: isOwnedByMe,
          is_parent_of_my_fork: isParentOfMyFork,
        });

        return {
          ...repo,
          last_fetched_at: Date.now(),
          me_contributing: meContributing,
          last_contributed_at: lastContributedAt || undefined,
          indexed_manually: indexedManually,
          is_parent_of_my_fork: isParentOfMyFork,
          prs_only_my_involvement: isParentOfMyFork,
          indexed,
          // Preserve visit tracking from existing record
          visit_count: existingRepo?.visit_count,
          last_visited_at: existingRepo?.last_visited_at,
          first_visited_at: existingRepo?.first_visited_at,
        };
      }),
    );

    // Save all repos immediately (so UI can show them)
    await saveRepos(repoRecords);

    // Get repos of interest (candidates for indexing)
    const reposOfInterest = repoRecords.filter((repo) => repo.indexed);

    // Apply limit: take top MAX_INDEXED_REPOS
    // Sort by: Personal repos → Own organizations → External organizations
    // Within each category: manually indexed → contributing → recent activity
    const indexedRepos = reposOfInterest
      .sort((a, b) => {
        // Helper function to get organization category
        const getOrgCategory = (repo: typeof a): number => {
          const owner = repo.full_name.split('/')[0];
          // Personal repos (owner === current user): priority 0
          if (accountLogin && owner === accountLogin) return 0;
          // Own orgs (NOT fork parents): priority 1
          if (!repo.is_parent_of_my_fork) return 1;
          // External orgs (fork parents only): priority 2
          return 2;
        };

        const categoryA = getOrgCategory(a);
        const categoryB = getOrgCategory(b);

        // Sort by category first (personal → own orgs → external orgs)
        if (categoryA !== categoryB) return categoryA - categoryB;

        // Within same category, apply existing priority logic:

        // Manually indexed first
        if (a.indexed_manually && !b.indexed_manually) return -1;
        if (!a.indexed_manually && b.indexed_manually) return 1;

        // Contributing repos second
        if (a.me_contributing && !b.me_contributing) return -1;
        if (!a.me_contributing && b.me_contributing) return 1;

        // Then by most recent activity
        const pushA = a.pushed_at ? new Date(a.pushed_at).getTime() : 0;
        const pushB = b.pushed_at ? new Date(b.pushed_at).getTime() : 0;
        return pushB - pushA;
      })
      .slice(0, MAX_INDEXED_REPOS);

    // Update indexed flag for repos that made the cut
    const finalRepoRecords = repoRecords.map((repo) => ({
      ...repo,
      indexed: indexedRepos.includes(repo),
    }));

    // Save updated indexed flags
    await saveRepos(finalRepoRecords);

    const nonIndexedRepos = finalRepoRecords.filter((repo) => !repo.indexed);

    console.warn(
      `[Import] ✓ Saved ${allRepos.length} repos to DB (${repoRecords.filter((r) => r.me_contributing).length} where you contribute)`,
    );
    console.warn(
      `[Import]✓ Selected ${indexedRepos.length}/${reposOfInterest.length} repos of interest for indexing (limit: ${MAX_INDEXED_REPOS})`,
    );

    console.warn(
      `[Import] Indexed repos: ${indexedRepos.length}, Non-indexed repos: ${nonIndexedRepos.length} (skipping import)`,
    );

    // Update progress with repo counts
    await updateImportStatus({
      accountLogin,
      progress: {
        totalRepos: allRepos.length,
        indexedRepos: indexedRepos.length,
        nonIndexedRepos: nonIndexedRepos.length,
        issuesProgress: 0,
        prsProgress: 0,
        currentRepo: null,
      },
    });

    // Step 2: Fetch issues and PRs for indexed repos only (based on preferences)
    const importTargets = [];
    if (preferences.importIssues) importTargets.push('issues');
    if (preferences.importPullRequests) importTargets.push('PRs');

    if (importTargets.length > 0) {
      console.warn(
        `[Import]Syncing ${importTargets.join(' and ')} for ${indexedRepos.length} indexed repos...`,
      );
    } else {
      console.warn('[Import] Skipping issues and PRs (disabled in preferences)');
    }

    let issuesCount = 0;
    let prsCount = 0;

    for (const repo of indexedRepos) {
      try {
        const [owner, repoName] = repo.full_name.split('/');

        // Update current repo in progress
        await updateImportStatus({
          progress: {
            totalRepos: allRepos.length,
            indexedRepos: indexedRepos.length,
            nonIndexedRepos: nonIndexedRepos.length,
            issuesProgress: issuesCount,
            prsProgress: prsCount,
            currentRepo: repo.full_name,
          },
        });

        console.warn(
          `[Import] [${Math.max(issuesCount, prsCount) + 1}/${indexedRepos.length}] Processing ${repo.full_name}...`,
        );

        // Build promises array based on preferences
        const promises: Promise<number>[] = [];
        const shouldLimitToMyPRs = !!(repo.prs_only_my_involvement && accountLogin);

        // Fetch issues if enabled
        if (preferences.importIssues) {
          promises.push(
            getRepoIssues(owner, repoName, 'all')
              .then(async (issues) => {
                // Get existing issues to preserve visit tracking
                const { getIssuesByRepo: getExistingIssues } = await import('@/src/storage/db');
                const existingIssues = await getExistingIssues(repo.id);
                const existingIssuesMap = new Map(existingIssues.map((i) => [i.id, i]));

                const issueRecords: IssueRecord[] = issues.map((issue) => {
                  const existing = existingIssuesMap.get(issue.id);
                  return {
                    ...issue,
                    repo_id: repo.id,
                    last_fetched_at: Date.now(),
                    // Preserve visit tracking from existing record
                    visit_count: existing?.visit_count,
                    last_visited_at: existing?.last_visited_at,
                    first_visited_at: existing?.first_visited_at,
                  };
                });
                return saveIssues(issueRecords).then(() => {
                  issuesCount++;
                  console.warn(`[Import] ✓ ${repo.full_name}: ${issues.length} issues`);
                  // Update progress after issues saved
                  updateImportStatus({
                    progress: {
                      totalRepos: allRepos.length,
                      indexedRepos: indexedRepos.length,
                      nonIndexedRepos: nonIndexedRepos.length,
                      issuesProgress: issuesCount,
                      prsProgress: prsCount,
                      currentRepo: repo.full_name,
                    },
                  });
                  return issues.length;
                });
              })
              .catch((err) => {
                console.error(`[Import]✗ Failed to fetch issues for ${repo.full_name}:`, err);
                issuesCount++; // Still increment to keep progress moving
                return 0;
              }),
          );
        } else {
          // If not importing issues, increment count to match indexedRepos
          issuesCount++;
        }

        // Fetch PRs if enabled
        if (preferences.importPullRequests) {
          promises.push(
            (shouldLimitToMyPRs
              ? getUserInvolvedPullRequests(owner, repoName, accountLogin!)
              : getRepoPullRequests(owner, repoName)
            )
              .then(async (prs) => {
                // Get existing PRs to preserve visit tracking
                const { getPullRequestsByRepo: getExistingPRs } = await import('@/src/storage/db');
                const existingPRs = await getExistingPRs(repo.id);
                const existingPRsMap = new Map(existingPRs.map((pr) => [pr.id, pr]));

                const prRecords: PullRequestRecord[] = prs.map((pr) => {
                  const existing = existingPRsMap.get(pr.id);
                  return {
                    ...pr,
                    merged: pr.merged_at !== null, // Compute merged from merged_at
                    repo_id: repo.id,
                    last_fetched_at: Date.now(),
                    // Preserve visit tracking from existing record
                    visit_count: existing?.visit_count,
                    last_visited_at: existing?.last_visited_at,
                    first_visited_at: existing?.first_visited_at,
                  };
                });
                return savePullRequests(prRecords).then(() => {
                  prsCount++;
                  console.warn(`[Import] ✓ ${repo.full_name}: ${prs.length} PRs`);
                  // Update progress after PRs saved
                  updateImportStatus({
                    progress: {
                      totalRepos: allRepos.length,
                      indexedRepos: indexedRepos.length,
                      nonIndexedRepos: nonIndexedRepos.length,
                      issuesProgress: issuesCount,
                      prsProgress: prsCount,
                      currentRepo: repo.full_name,
                    },
                  });
                  return prs.length;
                });
              })
              .catch((err) => {
                console.error(`[Import]✗ Failed to fetch PRs for ${repo.full_name}:`, err);
                prsCount++; // Still increment to keep progress moving
                return 0;
              }),
          );
        } else {
          // If not importing PRs, increment count to match indexedRepos
          prsCount++;
        }

        // Wait for all enabled fetches to complete (they won't throw since we catch errors individually)
        await Promise.all(promises);
      } catch (err) {
        // This should rarely be reached now, but keep as safety net
        console.error(`[Import] ✗ Unexpected error for ${repo.full_name}:`, err);
        // Ensure counters are incremented so we don't get stuck
        if (issuesCount < indexedRepos.length) issuesCount++;
        if (prsCount < indexedRepos.length) prsCount++;
      }
    }

    // Mark import as completed successfully
    await updateImportStatus({
      isRunning: false,
      lastCompletedAt: Date.now(),
      lastError: null,
      accountLogin,
      progress: {
        totalRepos: allRepos.length,
        indexedRepos: indexedRepos.length,
        nonIndexedRepos: nonIndexedRepos.length,
        issuesProgress: issuesCount,
        prsProgress: prsCount,
        currentRepo: null,
      },
    });

    console.warn(
      `[Import]✓ Import completed: ${indexedRepos.length} indexed repos, ${nonIndexedRepos.length} non-indexed (skipped)`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Import] ✗ Import failed:', errorMessage);

    // Mark import as failed
    await updateImportStatus({
      isRunning: false,
      lastError: errorMessage,
    });

    throw error;
  }
}

/**
 * Force an import even if one recently completed
 */
export async function forceImport(): Promise<void> {
  console.warn('[Import] Force import requested');

  // Reset the import state completely to allow immediate import
  await updateImportStatus({
    isRunning: false,
    lastCompletedAt: null,
    lastError: null,
  });

  return runImport();
}

/**
 * Reset stuck import (for manual recovery)
 */
export async function resetImport(): Promise<void> {
  console.warn('[Import] Manual import reset requested');

  await updateImportStatus({
    isRunning: false,
    lastError: 'Manually reset by user',
    progress: {
      totalRepos: 0,
      indexedRepos: 0,
      nonIndexedRepos: 0,
      issuesProgress: 0,
      prsProgress: 0,
      currentRepo: null,
    },
  });
}

/**
 * Quick-check for recently updated repos
 * Lightweight polling function that checks top 20 repos for updates
 *
 * Two modes:
 * - IDLE: 30-second delay (when user is not actively using the extension)
 * - BROWSING: 10-second delay (when command palette is open)
 */
let quickCheckTimeoutId: ReturnType<typeof setTimeout> | null = null;
const QUICK_CHECK_DELAY_IDLE_MS = 30 * 1000; // 30 seconds in idle mode
const QUICK_CHECK_DELAY_BROWSING_MS = 10 * 1000; // 10 seconds when browsing
const QUICK_CHECK_REPO_LIMIT = 20; // Check top 20 most recently pushed repos
const QUICK_CHECK_PR_LIMIT = 10; // Check top 10 most recently updated PRs per repo

type QuickCheckMode = 'idle' | 'browsing';
let currentQuickCheckMode: QuickCheckMode = 'idle';

function getQuickCheckDelay(): number {
  return currentQuickCheckMode === 'browsing'
    ? QUICK_CHECK_DELAY_BROWSING_MS
    : QUICK_CHECK_DELAY_IDLE_MS;
}

async function runQuickCheckOnce(): Promise<void> {
  const startTime = new Date();
  console.warn(
    `[QuickCheck] Starting check at ${startTime.toLocaleTimeString()} (mode: ${currentQuickCheckMode})`,
  );

  try {
    // Check if token exists before attempting any API calls
    const { getGitHubToken } = await import('@/src/storage/chrome');
    const token = await getGitHubToken();

    if (!token) {
      console.warn('[QuickCheck] Skipped - no GitHub token configured yet');
      return;
    }

    const preferences = await getImportPreferences();
    const status = await getImportStatus();
    const accountLogin = status.accountLogin || undefined;

    // Skip if PRs import is disabled (we only check PRs in quick-check now)
    if (!preferences.importPullRequests) {
      console.warn('[QuickCheck] Skipped - PR import disabled in preferences');
      return;
    }

    // Fetch top N recently pushed repos
    const recentRepos = await getRecentlyPushedRepos(QUICK_CHECK_REPO_LIMIT);

    // Check each repo's PRs for updates
    for (const apiRepo of recentRepos) {
      const storedRepo = await getRepo(apiRepo.id);

      // Skip if repo doesn't exist in our DB yet (will be picked up by full import)
      if (!storedRepo) {
        continue;
      }

      // Skip if repo is not indexed
      if (!storedRepo.indexed) {
        continue;
      }

      const parts = apiRepo.full_name.split('/');
      if (parts.length < 2) {
        console.error(`[QuickCheck] Invalid repo full_name: ${apiRepo.full_name}`);
        continue;
      }
      const [owner, repoName] = parts;

      const shouldLimitToMyPRs = storedRepo.prs_only_my_involvement && accountLogin;

      // Fetch recently updated PRs for this repo (only mine for fork parents)
      const recentPRs = shouldLimitToMyPRs
        ? await getUserInvolvedPullRequests(owner, repoName, accountLogin!)
        : await getRecentlyUpdatedPRs(owner, repoName, QUICK_CHECK_PR_LIMIT);

      // Check if any PR has been updated since our last fetch
      const storedFetchedAt = storedRepo.last_fetched_at || 0;

      const updatedPRs = recentPRs.filter((pr) => {
        const prUpdatedAt = pr.updated_at ? new Date(pr.updated_at).getTime() : 0;
        return prUpdatedAt > storedFetchedAt;
      });

      if (updatedPRs.length > 0) {
        // Log which PRs triggered the update
        for (const pr of updatedPRs) {
          console.warn(
            `[QuickCheck] 🔄 PR needs update: ${apiRepo.full_name}#${pr.number} "${pr.title}" (updated: ${pr.updated_at})`,
          );
        }
        console.warn(
          `[QuickCheck] Detected ${updatedPRs.length} updated PR(s) in ${apiRepo.full_name}, re-importing...`,
        );

        // Update repo record (preserve visit tracking)
        await saveRepos([
          {
            ...apiRepo,
            last_fetched_at: Date.now(),
            me_contributing: storedRepo.me_contributing,
            last_contributed_at: storedRepo.last_contributed_at,
            indexed_manually: storedRepo.indexed_manually,
            indexed: storedRepo.indexed,
            is_parent_of_my_fork: storedRepo.is_parent_of_my_fork,
            prs_only_my_involvement: storedRepo.prs_only_my_involvement,
            // Preserve visit tracking
            visit_count: storedRepo.visit_count,
            last_visited_at: storedRepo.last_visited_at,
            first_visited_at: storedRepo.first_visited_at,
          },
        ]);

        // Re-import all PRs for this repo
        try {
          const allPRs = shouldLimitToMyPRs
            ? recentPRs
            : await getRepoPullRequests(owner, repoName);

          // Get existing PRs to preserve visit tracking
          const { getPullRequestsByRepo: getExistingPRs } = await import('@/src/storage/db');
          const existingPRs = await getExistingPRs(apiRepo.id);
          const existingPRsMap = new Map(existingPRs.map((pr) => [pr.id, pr]));

          const prRecords: PullRequestRecord[] = allPRs.map((pr) => {
            const existing = existingPRsMap.get(pr.id);
            return {
              ...pr,
              merged: pr.merged_at !== null, // Compute merged from merged_at
              repo_id: apiRepo.id,
              last_fetched_at: Date.now(),
              // Preserve visit tracking from existing record
              visit_count: existing?.visit_count,
              last_visited_at: existing?.last_visited_at,
              first_visited_at: existing?.first_visited_at,
            };
          });
          await savePullRequests(prRecords);
          console.warn(`[QuickCheck] ✓ Re-imported ${allPRs.length} PRs for ${apiRepo.full_name}`);
        } catch (err) {
          console.error(`[QuickCheck] ✗ Failed to re-import PRs for ${apiRepo.full_name}:`, err);
        }
      }
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    console.warn(
      `[QuickCheck] Completed at ${endTime.toLocaleTimeString()} (took ${durationMs}ms)`,
    );
  } catch (error) {
    console.error('[QuickCheck] Error during quick check:', error);
  }
}

/**
 * Schedule the next quick-check iteration
 */
function scheduleNextQuickCheck(): void {
  const delay = getQuickCheckDelay();
  quickCheckTimeoutId = setTimeout(() => {
    runQuickCheckOnce()
      .catch((err) => {
        console.error('[QuickCheck] Unexpected error in loop:', err);
      })
      .finally(() => {
        scheduleNextQuickCheck();
      });
  }, delay);
}

/**
 * Start the continuous quick-check polling loop
 * Runs check, waits for delay, then runs again (self-scheduling)
 */
export function startQuickCheckLoop(): void {
  // Clear any existing timeout
  if (quickCheckTimeoutId) {
    clearTimeout(quickCheckTimeoutId);
  }

  console.warn('[QuickCheck] Starting continuous polling loop (idle: 30s, browsing: 10s)');

  // Run first check immediately, then schedule subsequent checks
  runQuickCheckOnce()
    .catch((err) => {
      console.error('[QuickCheck] Error in initial check:', err);
    })
    .finally(() => {
      scheduleNextQuickCheck();
    });
}

/**
 * Switch to BROWSING mode (faster polling) and trigger immediate check
 * Call this when the command palette opens
 */
export function setQuickCheckBrowsingMode(): void {
  if (currentQuickCheckMode === 'browsing') {
    return; // Already in browsing mode
  }

  console.warn('[QuickCheck] Switching to BROWSING mode (10s delay)');
  currentQuickCheckMode = 'browsing';

  // Cancel current timeout and run check immediately
  if (quickCheckTimeoutId) {
    clearTimeout(quickCheckTimeoutId);
    quickCheckTimeoutId = null;
  }

  // Run immediate check, then schedule next with new delay
  runQuickCheckOnce()
    .catch((err) => {
      console.error('[QuickCheck] Error in immediate check:', err);
    })
    .finally(() => {
      scheduleNextQuickCheck();
    });
}

/**
 * Switch back to IDLE mode (slower polling)
 * Call this when the command palette closes
 */
export function setQuickCheckIdleMode(): void {
  if (currentQuickCheckMode === 'idle') {
    return; // Already in idle mode
  }

  console.warn('[QuickCheck] Switching to IDLE mode (30s delay)');
  currentQuickCheckMode = 'idle';
  // Loop will pick up the new delay on next iteration
}

/**
 * Stop the quick-check polling loop
 */
export function stopQuickCheckLoop(): void {
  if (quickCheckTimeoutId) {
    clearTimeout(quickCheckTimeoutId);
    quickCheckTimeoutId = null;
    console.warn('[QuickCheck] Stopped polling loop');
  }
}
