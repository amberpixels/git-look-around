<template>
  <div class="auth-user-card">
    <div class="card-header">
      <div class="user-header">
        <img v-if="user?.avatar_url" :src="user.avatar_url" class="user-avatar" alt="Avatar" />
        <div class="user-info">
          <div class="user-name">
            <span class="status-icon">✓</span>
            <span class="username">{{ user?.login || 'GitHub User' }}</span>
          </div>
          <span class="auth-time">Authenticated {{ formattedAuthTime }}</span>
        </div>
      </div>

      <div class="scopes-info">
        <span v-for="scope in scopes" :key="scope" class="scope-badge">{{ scope }}</span>
      </div>
    </div>

    <div v-if="organizations.length > 0" class="org-info-inline">
      <span class="org-label">Organizations: ({{ organizations.length }})</span>
      {{ displayOrgs
      }}<span v-if="organizations.length > maxOrgsDisplay"
        >, +{{ organizations.length - maxOrgsDisplay }} more</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface GitHubUser {
  login: string;
  avatar_url: string;
}

interface Props {
  user: GitHubUser | null;
  authTime: number | undefined;
  organizations: string[];
  scopes: string[];
  maxOrgsDisplay?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxOrgsDisplay: 20,
});

const formattedAuthTime = computed(() => {
  if (!props.authTime) return '';
  const now = Date.now();
  const diff = now - props.authTime;

  // Less than 1 hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }

  // Less than 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }

  // Less than 7 days
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }

  // Fallback: show date
  return new Date(props.authTime).toLocaleDateString();
});

const displayOrgs = computed(() => {
  return props.organizations.slice(0, props.maxOrgsDisplay).join(', ');
});
</script>

<style scoped>
.auth-user-card {
  background: var(--bg-primary);
  border: 2px solid #2ea44f;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.user-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
}

.user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.status-icon {
  color: #2ea44f;
  font-size: 18px;
}

.username {
  color: var(--text-primary);
}

.auth-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.scopes-info {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.scope-badge {
  display: inline-block;
  padding: 2px 6px;
  background: #ddf4ff;
  color: #0969da;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}

.org-info-inline {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}

.org-label {
  color: var(--text-secondary);
  margin-right: 6px;
  font-weight: 600;
}
</style>
