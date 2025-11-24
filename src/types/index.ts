/**
 * Type definitions for Gitjump
 * All interfaces and types used across the extension
 */

// ==================== GitHub API Types ====================

/**
 * GitHub Organization from API
 */
export interface GitHubOrg {
  id: number;
  login: string; // Organization name (e.g., "google")
  avatar_url: string;
  description: string | null;
  url: string;
}

/**
 * GitHub Repository from API
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
  fork: boolean;
  default_branch: string;
}

/**
 * GitHub Issue from API
 */
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  assignee: {
    login: string;
    avatar_url: string;
  } | null;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  labels: Array<{
    name: string;
    color: string;
  }>;
  milestone: {
    title: string;
    number: number;
  } | null;
  locked: boolean;
  active_lock_reason: string | null;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  author_association: string;
  state_reason: string | null;
  pull_request?: {
    url: string;
  }; // Present if this is a PR (we'll filter these out)
}

/**
 * GitHub Pull Request from API
 */
export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  diff_url: string;
  patch_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  assignee: {
    login: string;
    avatar_url: string;
  } | null;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  requested_reviewers: Array<{
    login: string;
    avatar_url: string;
  }>;
  labels: Array<{
    name: string;
    color: string;
  }>;
  milestone: {
    title: string;
    number: number;
  } | null;
  draft: boolean;
  locked: boolean;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  merged: boolean;
  merged_at: string | null;
  mergeable: boolean | null;
  mergeable_state: string | null;
  merge_commit_sha: string | null;
  comments: number;
  review_comments: number;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  author_association: string;
}

// ==================== IndexedDB Record Types ====================

/**
 * Repository stored in IndexedDB
 */
export interface RepoRecord {
  id: number; // GitHub repo ID (primary key)
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  owner: {
    login: string;
  };
  // Date fields
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  // Activity metrics
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  size: number;
  // Repository flags
  private: boolean;
  archived: boolean;
  fork: boolean;
  default_branch: string;
  // Internal tracking
  last_fetched_at: number; // Timestamp when we last synced this repo
  // Visit tracking (for ranking/sorting)
  visit_count?: number; // Total number of visits
  last_visited_at?: number; // Timestamp of most recent visit
  first_visited_at?: number; // Timestamp of first visit
  // Contributor status
  me_contributing?: boolean; // Whether the authenticated user is a contributor
  // Index status
  indexed?: boolean; // Whether this repo is in the active index (synced with issues/PRs)
  indexed_manually?: boolean; // True if user manually added to index (overrides auto-rules)
}

/**
 * Issue stored in IndexedDB
 */
export interface IssueRecord {
  id: number; // GitHub issue ID (primary key)
  repo_id: number; // Foreign key to repos
  number: number; // Issue number within repo
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  assignee: {
    login: string;
    avatar_url: string;
  } | null;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  labels: Array<{
    name: string;
    color: string;
  }>;
  milestone: {
    title: string;
    number: number;
  } | null;
  locked: boolean;
  active_lock_reason: string | null;
  comments: number; // Comment count
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  author_association: string;
  state_reason: string | null;
  // Internal tracking
  last_fetched_at: number;
  // Visit tracking (for ranking/sorting)
  visit_count?: number;
  last_visited_at?: number;
  first_visited_at?: number;
}

/**
 * Pull Request stored in IndexedDB
 */
export interface PullRequestRecord {
  id: number; // GitHub PR ID (primary key)
  repo_id: number; // Foreign key to repos
  number: number; // PR number within repo
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  diff_url: string;
  patch_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  assignee: {
    login: string;
    avatar_url: string;
  } | null;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  requested_reviewers: Array<{
    login: string;
    avatar_url: string;
  }>;
  labels: Array<{
    name: string;
    color: string;
  }>;
  milestone: {
    title: string;
    number: number;
  } | null;
  draft: boolean;
  locked: boolean;
  // Branch info
  head: {
    ref: string; // branch name
    sha: string;
  };
  base: {
    ref: string; // branch name
    sha: string;
  };
  // Merge status
  merged: boolean;
  merged_at: string | null;
  mergeable: boolean | null;
  mergeable_state: string | null;
  merge_commit_sha: string | null;
  // Statistics
  comments: number;
  review_comments: number;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
  // Timestamps
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  author_association: string;
  // Internal tracking
  last_fetched_at: number;
  // Visit tracking (for ranking/sorting)
  visit_count?: number;
  last_visited_at?: number;
  first_visited_at?: number;
}

/**
 * Metadata for sync state
 */
export interface MetaRecord {
  key: string; // Primary key (e.g., "last_full_sync", "schema_version")
  value: unknown;
}
