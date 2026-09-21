<script setup lang="ts">
import type { PostFile } from './github'

defineProps<{
  posts: PostFile[]
  loading: boolean
  errored: boolean
}>()

defineEmits<{
  (event: 'create'): void
  (event: 'open', file: PostFile): void
  (event: 'refresh'): void
}>()
</script>

<template>
  <div class="toolbar">
    <button type="button" class="primary" :disabled="errored" @click="$emit('create')">新建文章</button>
    <button type="button" @click="$emit('refresh')" :disabled="loading">
      {{ loading ? '刷新中…' : '刷新' }}
    </button>
    <span class="count">{{ posts.length }} 篇</span>
  </div>

  <p v-if="loading && !posts.length" class="empty">读取中…</p>
  <p v-else-if="errored" class="empty bad">读取失败，见上方的诊断结果。修好后点「刷新」。</p>
  <p v-else-if="!posts.length" class="empty">还没有文章。点「新建文章」开始。</p>

  <ul v-else class="list">
    <li v-for="file in posts" :key="file.path">
      <button type="button" @click="$emit('open', file)">
        <span class="name">{{ file.name }}</span>
        <span v-if="file.draft" class="badge">草稿</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.count {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.85rem;
}
.empty {
  color: var(--muted);
  font-size: 0.9rem;
}
.empty.bad {
  color: var(--err-fg);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}
.list li + li {
  border-top: 1px solid var(--line);
}
.list button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
}
.list button:hover {
  background: var(--field);
}
.name {
  font-family: var(--mono);
  font-size: 0.85rem;
}
.badge {
  margin-left: auto;
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--warn-bg);
  color: var(--warn-fg);
}
button {
  font: inherit;
  font-size: 0.88rem;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--field);
  color: inherit;
  cursor: pointer;
}
button:hover:not(:disabled) {
  border-color: var(--accent);
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}
</style>
