/**
 * Sync Engine - Handles syncing data from GitHub to IndexedDB
 * Completely decoupled from UI - runs independently and saves in chunks
 */

import {
  getAllAccessibleRepos,
  getRepoIssues,
  getRepoPullRequests,
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

import { getSyncPreferences } from '@/src/storage/chrome';
import { isUserContributor } from '@/src/api/contributors';
import type { IssueRecord, PullRequestRecord } from '@/src/types';

// Repos with last update older than 6 months are considered non-indexed by default
const INDEXED_ACTIVITY_THRESHOLD_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months

/**
 * Sync status stored in IndexedDB meta
 */
export interface SyncStatus {
  isRunning: boolean;
  lastStartedAt: number | null;
  lastCompletedAt: number | null;
  lastError: string | null;
  accountLogin: string | null; // GitHub username (e.g. "amberpixels")
  progress: {
    totalRepos: number; // Total repos
    indexedRepos: number; // Number of indexed repos (actively synced)
    nonIndexedRepos: number; // Number of non-indexed repos (skipped)
    issuesProgress: number; // How many indexed repos have issues synced
    prsProgress: number; // How many indexed repos have PRs synced
    currentRepo: string | null;
  };
}

const SYNC_STATUS_KEY = 'sync_status';
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000; // Don't sync more often than every 5 minutes

/**
 * Get current sync status
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const status = await getMeta(SYNC_STATUS_KEY);
  return (
    (status as SyncStatus) || {
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
 * Update sync status
 */
async function updateSyncStatus(updates: Partial<SyncStatus>): Promise<void> {
  const current = await getSyncStatus();
  const newStatus = { ...current, ...updates };
  await setMeta(SYNC_STATUS_KEY, newStatus);
}

/**
 * Check if we should run a sync (not running, enough time passed)
 */
export async function shouldRunSync(): Promise<boolean> {
  const status = await getSyncStatus();

  // Check if sync is stuck (running for more than 30 minutes)
  const STUCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  if (status.isRunning && status.lastStartedAt) {
    const runningSince = Date.now() - status.lastStartedAt;
    if (runningSince > STUCK_TIMEOUT_MS) {
      console.warn(
        `[Sync] Sync appears stuck (running for ${Math.round(runningSince / 1000 / 60)}min), forcing reset...`,
      );
      // Force reset the stuck sync
      await updateSyncStatus({
        isRunning: false,
        lastError: 'Sync timeout - automatically reset',
      });
    } else {
      console.warn('[Sync] Already running, skipping...');
      return false;
    }
  } else if (status.isRunning) {
    // isRunning but no lastStartedAt? Something is wrong, reset it
    console.warn('[Sync] Inconsistent state detected (running but no start time), resetting...');
    await updateSyncStatus({
      isRunning: false,
      lastError: 'Inconsistent state - automatically reset',
    });
  }

  // Check if enough time has passed since last sync
  if (status.lastCompletedAt) {
    const timeSinceLastSync = Date.now() - status.lastCompletedAt;
    if (timeSinceLastSync < MIN_SYNC_INTERVAL_MS) {
      console.warn(
        `[Sync] Last sync was ${Math.round(timeSinceLastSync / 1000)}s ago, skipping...`,
      );
      return false;
    }
  }

  return true;
}

/**
 * Determine if repo should be indexed (actively synced with issues/PRs)
 * Rules:
 * - If indexed_manually is true, always indexed
 * - If me_contributing is false, NOT indexed
 * - If pushed_at older than 6 months, NOT indexed
 * - Otherwise, indexed
 */
function shouldIndexRepo(repo: {
  pushed_at: string | null;
  me_contributing?: boolean;
  indexed_manually?: boolean;
}): boolean {
  // Manual override always wins
  if (repo.indexed_manually) {
    return true;
  }

  // Not a contributor = not indexed
  if (repo.me_contributing === false) {
    return false;
  }

  // No recent activity = not indexed
  if (repo.pushed_at) {
    const lastPush = new Date(repo.pushed_at).getTime();
    const now = Date.now();
    if (now - lastPush > INDEXED_ACTIVITY_THRESHOLD_MS) {
      return false;
    }
  }

  // Default: indexed
  return true;
}

/**
 * Main sync function - syncs all data from GitHub to IndexedDB
 * Saves data in chunks as it fetches, so UI can display partial results
 */
export async function runSync(): Promise<void> {
  const canRun = await shouldRunSync();
  if (!canRun) {
    return;
  }

  console.warn('[Sync] Starting sync...');

  try {
    // Step 0: Get sync preferences and user info
    const preferences = await getSyncPreferences();
    const user = await getAuthenticatedUser();
    const accountLogin = user.login || null;
    console.warn(`[Sync] Syncing account: ${accountLogin}`);
    console.warn(
      `[Sync] Preferences: Issues=${preferences.syncIssues}, PRs=${preferences.syncPullRequests}`,
    );

    // Mark sync as running
    await updateSyncStatus({
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
    console.warn('[Sync] Fetching repositories (user + organizations)...');
    const allRepos = await getAllAccessibleRepos();
    console.warn(`[Sync] Found ${allRepos.length} total repositories`);

    // Check contributor status and determine indexed status for each repo
    console.warn('[Sync] Checking contributor status and indexed status...');
    const repoRecords = await Promise.all(
      allRepos.map(async (repo) => {
        const [owner, repoName] = repo.full_name.split('/');
        let meContributing = false;

        try {
          meContributing = await isUserContributor(owner, repoName, accountLogin);
        } catch (err) {
          console.warn(`[Sync] Could not check contributor status for ${repo.full_name}:`, err);
        }

        // Get existing repo to preserve indexed_manually flag
        const existingRepo = await getRepo(repo.id);
        const indexedManually = existingRepo?.indexed_manually || false;

        // Determine if repo should be indexed
        const indexed = shouldIndexRepo({
          pushed_at: repo.pushed_at,
          me_contributing: meContributing,
          indexed_manually: indexedManually,
        });

        return {
          ...repo,
          last_fetched_at: Date.now(),
          me_contributing: meContributing,
          indexed_manually: indexedManually,
          indexed,
        };
      }),
    );

    // Save all repos immediately (so UI can show them)
    await saveRepos(repoRecords);
    console.warn(
      `[Sync] ✓ Saved ${allRepos.length} repos to DB (${repoRecords.filter((r) => r.me_contributing).length} where you contribute)`,
    );

    // Separate indexed and non-indexed repos
    const indexedRepos = repoRecords.filter((repo) => repo.indexed);
    const nonIndexedRepos = repoRecords.filter((repo) => !repo.indexed);

    console.warn(
      `[Sync] Indexed repos: ${indexedRepos.length}, Non-indexed repos: ${nonIndexedRepos.length} (skipping sync)`,
    );

    // Update progress with repo counts
    await updateSyncStatus({
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
    const syncTargets = [];
    if (preferences.syncIssues) syncTargets.push('issues');
    if (preferences.syncPullRequests) syncTargets.push('PRs');

    if (syncTargets.length > 0) {
      console.warn(
        `[Sync] Syncing ${syncTargets.join(' and ')} for ${indexedRepos.length} indexed repos...`,
      );
    } else {
      console.warn('[Sync] Skipping issues and PRs (disabled in preferences)');
    }

    let issuesCount = 0;
    let prsCount = 0;

    for (const repo of indexedRepos) {
      try {
        const [owner, repoName] = repo.full_name.split('/');

        // Update current repo in progress
        await updateSyncStatus({
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
          `[Sync] [${Math.max(issuesCount, prsCount) + 1}/${indexedRepos.length}] Processing ${repo.full_name}...`,
        );

        // Build promises array based on preferences
        const promises: Promise<number>[] = [];

        // Fetch issues if enabled
        if (preferences.syncIssues) {
          promises.push(
            getRepoIssues(owner, repoName, 'all')
              .then((issues) => {
                const issueRecords: IssueRecord[] = issues.map((issue) => ({
                  ...issue,
                  repo_id: repo.id,
                  last_fetched_at: Date.now(),
                }));
                return saveIssues(issueRecords).then(() => {
                  issuesCount++;
                  console.warn(`[Sync] ✓ ${repo.full_name}: ${issues.length} issues`);
                  // Update progress after issues saved
                  updateSyncStatus({
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
                console.error(`[Sync] ✗ Failed to fetch issues for ${repo.full_name}:`, err);
                issuesCount++; // Still increment to keep progress moving
                return 0;
              }),
          );
        } else {
          // If not syncing issues, increment count to match indexedRepos
          issuesCount++;
        }

        // Fetch PRs if enabled
        if (preferences.syncPullRequests) {
          promises.push(
            getRepoPullRequests(owner, repoName)
              .then((prs) => {
                const prRecords: PullRequestRecord[] = prs.map((pr) => ({
                  ...pr,
                  repo_id: repo.id,
                  last_fetched_at: Date.now(),
                }));
                return savePullRequests(prRecords).then(() => {
                  prsCount++;
                  console.warn(`[Sync] ✓ ${repo.full_name}: ${prs.length} PRs`);
                  // Update progress after PRs saved
                  updateSyncStatus({
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
                console.error(`[Sync] ✗ Failed to fetch PRs for ${repo.full_name}:`, err);
                prsCount++; // Still increment to keep progress moving
                return 0;
              }),
          );
        } else {
          // If not syncing PRs, increment count to match indexedRepos
          prsCount++;
        }

        // Wait for all enabled fetches to complete (they won't throw since we catch errors individually)
        await Promise.all(promises);
      } catch (err) {
        // This should rarely be reached now, but keep as safety net
        console.error(`[Sync] ✗ Unexpected error for ${repo.full_name}:`, err);
        // Ensure counters are incremented so we don't get stuck
        if (issuesCount < indexedRepos.length) issuesCount++;
        if (prsCount < indexedRepos.length) prsCount++;
      }
    }

    // Mark sync as completed successfully
    await updateSyncStatus({
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
      `[Sync] ✓ Sync completed: ${indexedRepos.length} indexed repos, ${nonIndexedRepos.length} non-indexed (skipped)`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Sync] ✗ Sync failed:', errorMessage);

    // Mark sync as failed
    await updateSyncStatus({
      isRunning: false,
      lastError: errorMessage,
    });

    throw error;
  }
}

/**
 * Force a sync even if one recently completed
 */
export async function forceSync(): Promise<void> {
  console.warn('[Sync] Force sync requested');

  // Reset the sync state completely to allow immediate sync
  await updateSyncStatus({
    isRunning: false,
    lastCompletedAt: null,
    lastError: null,
  });

  return runSync();
}

/**
 * Reset stuck sync (for manual recovery)
 */
export async function resetSync(): Promise<void> {
  console.warn('[Sync] Manual sync reset requested');

  await updateSyncStatus({
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
    const preferences = await getSyncPreferences();

    // Skip if PRs sync is disabled (we only check PRs in quick-check now)
    if (!preferences.syncPullRequests) {
      console.warn('[QuickCheck] Skipped - PR sync disabled in preferences');
      return;
    }

    // Fetch top N recently pushed repos
    const recentRepos = await getRecentlyPushedRepos(QUICK_CHECK_REPO_LIMIT);

    // Check each repo's PRs for updates
    for (const apiRepo of recentRepos) {
      const storedRepo = await getRepo(apiRepo.id);

      // Skip if repo doesn't exist in our DB yet (will be picked up by full sync)
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

      // Fetch top N recently updated PRs for this repo
      const recentPRs = await getRecentlyUpdatedPRs(owner, repoName, QUICK_CHECK_PR_LIMIT);

      // Check if any PR has been updated since our last fetch
      const storedFetchedAt = storedRepo.last_fetched_at || 0;

      // Debug: Log comparison for first repo in the list
      if (recentPRs.length > 0) {
        const firstPR = recentPRs[0];
        const firstPRUpdatedAt = firstPR.updated_at ? new Date(firstPR.updated_at).getTime() : 0;
        console.warn(
          `[QuickCheck] ${apiRepo.full_name}: comparing PR#${firstPR.number} updated_at=${new Date(firstPRUpdatedAt).toISOString()} vs repo.last_fetched_at=${new Date(storedFetchedAt).toISOString()}`,
        );
      }
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
          `[QuickCheck] Detected ${updatedPRs.length} updated PR(s) in ${apiRepo.full_name}, re-syncing...`,
        );

        // Update repo record
        await saveRepos([
          {
            ...apiRepo,
            last_fetched_at: Date.now(),
            me_contributing: storedRepo.me_contributing,
            indexed_manually: storedRepo.indexed_manually,
            indexed: storedRepo.indexed,
          },
        ]);

        // Re-sync all PRs for this repo
        try {
          const allPRs = await getRepoPullRequests(owner, repoName);
          const prRecords: PullRequestRecord[] = allPRs.map((pr) => ({
            ...pr,
            repo_id: apiRepo.id,
            last_fetched_at: Date.now(),
          }));
          await savePullRequests(prRecords);
          console.warn(`[QuickCheck] ✓ Re-synced ${allPRs.length} PRs for ${apiRepo.full_name}`);
        } catch (err) {
          console.error(`[QuickCheck] ✗ Failed to re-sync PRs for ${apiRepo.full_name}:`, err);
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
