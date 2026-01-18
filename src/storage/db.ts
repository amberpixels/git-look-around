/**
 * IndexedDB storage layer for Git Look-Around
 * Stores repos, issues, pull requests, and metadata
 */

import type { RepoRecord, IssueRecord, PullRequestRecord, MetaRecord } from '@/src/types';

const DB_NAME = 'git-look-around';
const DB_VERSION = 5; // Bumped for last_contributed_at field

// Store names
export const STORES = {
  REPOS: 'repos',
  ISSUES: 'issues',
  PULL_REQUESTS: 'pull_requests',
  META: 'meta',
} as const;

/**
 * Initialize IndexedDB database
 */
export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create repos store
      if (!db.objectStoreNames.contains(STORES.REPOS)) {
        const repoStore = db.createObjectStore(STORES.REPOS, { keyPath: 'id' });
        repoStore.createIndex('full_name', 'full_name', { unique: true });
        repoStore.createIndex('pushed_at', 'pushed_at', { unique: false });
        repoStore.createIndex('last_fetched_at', 'last_fetched_at', { unique: false });
        repoStore.createIndex('last_visited_at', 'last_visited_at', { unique: false });
        repoStore.createIndex('visit_count', 'visit_count', { unique: false });
        repoStore.createIndex('me_contributing', 'me_contributing', { unique: false });
        repoStore.createIndex('last_contributed_at', 'last_contributed_at', { unique: false });
        repoStore.createIndex('indexed', 'indexed', { unique: false });
        repoStore.createIndex('indexed_manually', 'indexed_manually', { unique: false });
      } else {
        // Handle schema upgrades for existing databases
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        const repoStore = transaction.objectStore(STORES.REPOS);

        // Add indexed field index if it doesn't exist
        if (!repoStore.indexNames.contains('indexed')) {
          repoStore.createIndex('indexed', 'indexed', { unique: false });
        }

        // Add indexed_manually field index if it doesn't exist
        if (!repoStore.indexNames.contains('indexed_manually')) {
          repoStore.createIndex('indexed_manually', 'indexed_manually', { unique: false });
        }

        // Add last_contributed_at field index if it doesn't exist
        if (!repoStore.indexNames.contains('last_contributed_at')) {
          repoStore.createIndex('last_contributed_at', 'last_contributed_at', { unique: false });
        }
      }

      // Create issues store
      if (!db.objectStoreNames.contains(STORES.ISSUES)) {
        const issueStore = db.createObjectStore(STORES.ISSUES, { keyPath: 'id' });
        issueStore.createIndex('repo_id', 'repo_id', { unique: false });
        issueStore.createIndex('state', 'state', { unique: false });
        issueStore.createIndex('updated_at', 'updated_at', { unique: false });
        issueStore.createIndex('last_fetched_at', 'last_fetched_at', { unique: false });
        issueStore.createIndex('last_visited_at', 'last_visited_at', { unique: false });
      }

      // Create pull_requests store
      if (!db.objectStoreNames.contains(STORES.PULL_REQUESTS)) {
        const prStore = db.createObjectStore(STORES.PULL_REQUESTS, { keyPath: 'id' });
        prStore.createIndex('repo_id', 'repo_id', { unique: false });
        prStore.createIndex('state', 'state', { unique: false });
        prStore.createIndex('updated_at', 'updated_at', { unique: false });
        prStore.createIndex('last_fetched_at', 'last_fetched_at', { unique: false });
        prStore.createIndex('last_visited_at', 'last_visited_at', { unique: false });
      }

      // Create meta store
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }
    };
  });
}

/**
 * Generic helper to get all records from a store
 */
export async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic helper to get a single record by key
 */
export async function getFromStore<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic helper to put a record into a store
 */
export async function putInStore<T>(storeName: string, record: T): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic helper to put multiple records into a store
 */
export async function putManyInStore<T>(storeName: string, records: T[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    for (const record of records) {
      store.put(record);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Generic helper to delete a record from a store
 */
export async function deleteFromStore(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic helper to clear all records from a store
 */
export async function clearStore(storeName: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ==================== Repo-specific helpers ====================

export async function getAllRepos(): Promise<RepoRecord[]> {
  return getAllFromStore<RepoRecord>(STORES.REPOS);
}

export async function getRepo(id: number): Promise<RepoRecord | undefined> {
  return getFromStore<RepoRecord>(STORES.REPOS, id);
}

export async function getRepoByName(fullName: string): Promise<RepoRecord | undefined> {
  const allRepos = await getAllRepos();
  return allRepos.find((r) => r.full_name === fullName);
}

export async function saveRepo(repo: RepoRecord): Promise<void> {
  return putInStore(STORES.REPOS, repo);
}

export async function saveRepos(repos: RepoRecord[]): Promise<void> {
  return putManyInStore(STORES.REPOS, repos);
}

/**
 * Set repo as manually indexed (user clicked + button)
 */
export async function setRepoIndexed(repoId: number, indexed: boolean): Promise<void> {
  const repo = await getRepo(repoId);
  if (!repo) {
    throw new Error(`Repo ${repoId} not found`);
  }

  const updatedRepo: RepoRecord = {
    ...repo,
    indexed_manually: indexed,
    indexed,
  };

  return saveRepo(updatedRepo);
}

/**
 * Categorized organizations
 */
export interface CategorizedOrganizations {
  myOrgs: string[]; // Personal account + orgs from /user/orgs API (admin or member)
  contributingOrgs: string[]; // External orgs where you have direct repos (not fork parents)
  forkSourceOrgs: string[]; // External orgs where you ONLY have fork parent repos
}

/**
 * Get unique organizations from all repos, categorized into 3 groups
 * @param myOrgsFromAPI - Orgs from /user/orgs API + personal account (known "my" orgs)
 */
export async function getUniqueOrganizations(myOrgsFromAPI: string[] = []): Promise<CategorizedOrganizations> {
  const repos = await getAllRepos();
  const orgRepoMap = new Map<string, RepoRecord[]>();

  // Normalize myOrgsFromAPI to lowercase for comparison
  const myOrgsSet = new Set(myOrgsFromAPI.map(o => o.toLowerCase()));

  // Group repos by organization
  for (const repo of repos) {
    const parts = repo.full_name.split('/');
    if (parts.length >= 2) {
      const [owner] = parts;
      if (!orgRepoMap.has(owner)) {
        orgRepoMap.set(owner, []);
      }
      orgRepoMap.get(owner)!.push(repo);
    }
  }

  const myOrgs: string[] = [];
  const contributingOrgs: string[] = [];
  const forkSourceOrgs: string[] = [];

  // Categorize each organization
  for (const [org, orgRepos] of orgRepoMap.entries()) {
    // Check if this is a "my org" from API
    if (myOrgsSet.has(org.toLowerCase())) {
      myOrgs.push(org);
      continue;
    }

    // For external orgs, check if they have non-fork-parent repos
    const hasNonForkParentRepos = orgRepos.some((repo) => !repo.is_parent_of_my_fork);

    if (hasNonForkParentRepos) {
      // Has direct repos - contributing to this org
      contributingOrgs.push(org);
    } else {
      // Only fork parents - just a fork source
      forkSourceOrgs.push(org);
    }
  }

  // Add any myOrgsFromAPI that weren't found in repos (e.g., empty orgs)
  for (const org of myOrgsFromAPI) {
    if (!myOrgs.some(o => o.toLowerCase() === org.toLowerCase())) {
      myOrgs.push(org);
    }
  }

  return {
    myOrgs: myOrgs.sort(),
    contributingOrgs: contributingOrgs.sort(),
    forkSourceOrgs: forkSourceOrgs.sort(),
  };
}

// ==================== Issue-specific helpers ====================

export async function getAllIssues(): Promise<IssueRecord[]> {
  return getAllFromStore<IssueRecord>(STORES.ISSUES);
}

export async function getIssuesByRepo(repoId: number): Promise<IssueRecord[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.ISSUES, 'readonly');
    const store = transaction.objectStore(STORES.ISSUES);
    const index = store.index('repo_id');
    const request = index.getAll(repoId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveIssue(issue: IssueRecord): Promise<void> {
  return putInStore(STORES.ISSUES, issue);
}

export async function saveIssues(issues: IssueRecord[]): Promise<void> {
  return putManyInStore(STORES.ISSUES, issues);
}

// ==================== PR-specific helpers ====================

export async function getAllPullRequests(): Promise<PullRequestRecord[]> {
  return getAllFromStore<PullRequestRecord>(STORES.PULL_REQUESTS);
}

export async function getPullRequestsByRepo(repoId: number): Promise<PullRequestRecord[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.PULL_REQUESTS, 'readonly');
    const store = transaction.objectStore(STORES.PULL_REQUESTS);
    const index = store.index('repo_id');
    const request = index.getAll(repoId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePullRequest(pr: PullRequestRecord): Promise<void> {
  return putInStore(STORES.PULL_REQUESTS, pr);
}

export async function savePullRequests(prs: PullRequestRecord[]): Promise<void> {
  return putManyInStore(STORES.PULL_REQUESTS, prs);
}

// ==================== Visit tracking helpers ====================

export async function recordVisit(type: 'repo' | 'issue' | 'pr', entityId: number): Promise<void> {
  const now = Date.now();

  // Update the entity record directly for SPEED
  if (type === 'repo') {
    const repo = await getRepo(entityId);
    if (!repo) {
      console.warn(`[recordVisit] Repo with ID ${entityId} not found in database`);
      return;
    }

    const updatedRepo = {
      ...repo,
      visit_count: (repo.visit_count || 0) + 1,
      last_visited_at: now,
      first_visited_at: repo.first_visited_at || now,
    };
    console.warn(
      `[recordVisit] Updating repo ${repo.full_name}: visit_count=${updatedRepo.visit_count}, last_visited_at=${new Date(now).toISOString()}`,
    );
    await saveRepo(updatedRepo);
    return;
  }

  if (type === 'issue') {
    const issue = await getFromStore<IssueRecord>(STORES.ISSUES, entityId);
    if (!issue) {
      return;
    }

    await putInStore(STORES.ISSUES, {
      ...issue,
      visit_count: (issue.visit_count || 0) + 1,
      last_visited_at: now,
      first_visited_at: issue.first_visited_at || now,
    });
    return;
  }

  if (type === 'pr') {
    const pr = await getFromStore<PullRequestRecord>(STORES.PULL_REQUESTS, entityId);
    if (!pr) {
      return;
    }

    await putInStore(STORES.PULL_REQUESTS, {
      ...pr,
      visit_count: (pr.visit_count || 0) + 1,
      last_visited_at: now,
      first_visited_at: pr.first_visited_at || now,
    });
  }
}

// ==================== Meta helpers ====================

export async function getMeta(key: string): Promise<unknown> {
  const record = await getFromStore<MetaRecord>(STORES.META, key);
  return record?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  return putInStore(STORES.META, { key, value });
}
