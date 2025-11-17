/**
 * Sync Engine - Handles syncing data from GitHub to IndexedDB
 * Completely decoupled from UI - runs independently and saves in chunks
 */

import {
  getUserRepos,
  getRepoIssues,
  getRepoPullRequests,
  getAuthenticatedUser,
} from './github-api';
import { saveRepos, saveIssues, savePullRequests, getMeta, setMeta } from './db';
import type { RepoRecord, IssueRecord, PullRequestRecord } from './types';

// Repos with last update older than 6 months are considered stale
const STALE_REPO_THRESHOLD_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months

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
    totalRepos: number; // Total non-stale repos
    activeRepos: number; // Number of non-stale repos
    staleRepos: number; // Number of stale repos (skipped)
    issuesProgress: number; // How many repos have issues synced
    prsProgress: number; // How many repos have PRs synced
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
        activeRepos: 0,
        staleRepos: 0,
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
  console.warn('[Sync] Status updated:', JSON.stringify(newStatus, null, 2));
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
 * Check if repo is stale (not updated in last 6 months)
 */
function isRepoStale(repo: { updated_at: string }): boolean {
  const lastUpdate = new Date(repo.updated_at).getTime();
  const now = Date.now();
  return now - lastUpdate > STALE_REPO_THRESHOLD_MS;
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
    // Step 0: Get authenticated user info
    const user = await getAuthenticatedUser();
    const accountLogin = user.login || null;
    console.warn(`[Sync] Syncing account: ${accountLogin}`);

    // Mark sync as running
    await updateSyncStatus({
      isRunning: true,
      lastStartedAt: Date.now(),
      lastError: null,
      accountLogin,
      progress: {
        totalRepos: 0,
        activeRepos: 0,
        staleRepos: 0,
        issuesProgress: 0,
        prsProgress: 0,
        currentRepo: null,
      },
    });

    // Step 1: Fetch all repos and count them
    console.warn('[Sync] Fetching repositories...');
    const allRepos = await getUserRepos();
    console.warn(`[Sync] Found ${allRepos.length} total repositories`);

    // Save all repos immediately (so UI can show them)
    const repoRecords: RepoRecord[] = allRepos.map((repo) => ({
      ...repo,
      lastFetchedAt: Date.now(),
    }));
    await saveRepos(repoRecords);
    console.warn(`[Sync] ✓ Saved ${allRepos.length} repos to DB`);

    // Separate active and stale repos
    const activeRepos = allRepos.filter((repo) => !isRepoStale(repo));
    const staleRepos = allRepos.filter((repo) => isRepoStale(repo));

    console.warn(
      `[Sync] Active repos: ${activeRepos.length}, Stale repos: ${staleRepos.length} (skipping)`,
    );

    // Update progress with repo counts
    await updateSyncStatus({
      accountLogin,
      progress: {
        totalRepos: allRepos.length,
        activeRepos: activeRepos.length,
        staleRepos: staleRepos.length,
        issuesProgress: 0,
        prsProgress: 0,
        currentRepo: null,
      },
    });

    // Step 2: Fetch issues and PRs for active repos only
    console.warn(`[Sync] Syncing issues and PRs for ${activeRepos.length} active repos...`);
    let issuesCount = 0;
    let prsCount = 0;

    for (const repo of activeRepos) {
      try {
        const [owner, repoName] = repo.full_name.split('/');

        // Update current repo in progress
        await updateSyncStatus({
          progress: {
            totalRepos: allRepos.length,
            activeRepos: activeRepos.length,
            staleRepos: staleRepos.length,
            issuesProgress: issuesCount,
            prsProgress: prsCount,
            currentRepo: repo.full_name,
          },
        });

        console.warn(
          `[Sync] [${Math.max(issuesCount, prsCount) + 1}/${activeRepos.length}] Processing ${repo.full_name}...`,
        );

        // Fetch issues and PRs in parallel with individual error handling
        const [issuesPromise, prsPromise] = [
          getRepoIssues(owner, repoName, 'all')
            .then((issues) => {
              const issueRecords: IssueRecord[] = issues.map((issue) => ({
                ...issue,
                repo_id: repo.id,
                lastFetchedAt: Date.now(),
              }));
              return saveIssues(issueRecords).then(() => {
                issuesCount++;
                console.warn(`[Sync] ✓ ${repo.full_name}: ${issues.length} issues`);
                // Update progress after issues saved
                updateSyncStatus({
                  progress: {
                    totalRepos: allRepos.length,
                    activeRepos: activeRepos.length,
                    staleRepos: staleRepos.length,
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
          getRepoPullRequests(owner, repoName)
            .then((prs) => {
              const prRecords: PullRequestRecord[] = prs.map((pr) => ({
                ...pr,
                repo_id: repo.id,
                lastFetchedAt: Date.now(),
              }));
              return savePullRequests(prRecords).then(() => {
                prsCount++;
                console.warn(`[Sync] ✓ ${repo.full_name}: ${prs.length} PRs`);
                // Update progress after PRs saved
                updateSyncStatus({
                  progress: {
                    totalRepos: allRepos.length,
                    activeRepos: activeRepos.length,
                    staleRepos: staleRepos.length,
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
        ];

        // Wait for both to complete (they won't throw since we catch errors individually)
        await Promise.all([issuesPromise, prsPromise]);
      } catch (err) {
        // This should rarely be reached now, but keep as safety net
        console.error(`[Sync] ✗ Unexpected error for ${repo.full_name}:`, err);
        // Ensure counters are incremented so we don't get stuck
        if (issuesCount < activeRepos.length) issuesCount++;
        if (prsCount < activeRepos.length) prsCount++;
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
        activeRepos: activeRepos.length,
        staleRepos: staleRepos.length,
        issuesProgress: issuesCount,
        prsProgress: prsCount,
        currentRepo: null,
      },
    });

    console.warn(
      `[Sync] ✓ Sync completed: ${activeRepos.length} active repos, ${staleRepos.length} stale (skipped)`,
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
      activeRepos: 0,
      staleRepos: 0,
      issuesProgress: 0,
      prsProgress: 0,
      currentRepo: null,
    },
  });
}
