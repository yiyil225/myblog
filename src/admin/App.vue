<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { DEFAULT_REPO } from './config'
import {
  explainError,
  listPosts,
  postPath,
  probe,
  readPost,
  savePost,
  today,
  type PostDoc,
  type PostFile,
  type ProbeStep,
  type RepoConfig,
  type SavePayload,
} from './github'
import PostList from './PostList.vue'
import PostEditor from './PostEditor.vue'
import ConfigEditor from './ConfigEditor.vue'

const STORAGE_KEY = 'reimu-admin-config'

const config = reactive<RepoConfig>({
  owner: DEFAULT_REPO.owner,
  repo: DEFAULT_REPO.repo,
  branch: DEFAULT_REPO.branch,
  token: '',
})
const connected = ref(false)
const loading = ref(false)
const diagnosing = ref(false)
const error = ref('')
const notice = ref('')
const probeSteps = ref<ProbeStep[]>([])

const posts = ref<PostFile[]>([])
const mode = ref<'list' | 'edit'>('list')
const view = ref<'posts' | 'config'>('posts')
const doc = ref<PostDoc | null>(null)
const isNew = ref(false)
const saving = ref(false)

const ready = computed(() =>
  Boolean(connected.value && config.owner && config.repo && config.token),
)

onMounted(() => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const saved = JSON.parse(raw) as Partial<RepoConfig>
    for (const [key, value] of Object.entries(saved)) {
      // Ignore blanks so a cleared field falls back to the default instead of
      // wiping it out and breaking every request.
      if (typeof value === 'string' && value.trim()) config[key as keyof RepoConfig] = value
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
  if (config.owner && config.repo && config.token) {
    connected.value = true
    void refresh()
  }
})

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

async function connect() {
  error.value = ''
  notice.value = ''
  if (!config.branch) config.branch = DEFAULT_REPO.branch
  if (!config.owner || !config.repo || !config.token) {
    error.value = '仓库所有者、仓库名和 Token 都要填。'
    return
  }
  persist()
  connected.value = true
  await refresh()
}

function disconnect() {
  localStorage.removeItem(STORAGE_KEY)
  connected.value = false
  posts.value = []
  probeSteps.value = []
  mode.value = 'list'
  doc.value = null
  notice.value = ''
  error.value = ''
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    posts.value = await listPosts(config)
    probeSteps.value = []
  } catch (cause) {
    error.value = explainError(cause, config)
    // The list call is the first thing that touches every layer, so run the
    // layered probe now instead of making the user guess which part broke.
    await diagnose()
  } finally {
    loading.value = false
  }
}

async function diagnose() {
  diagnosing.value = true
  try {
    probeSteps.value = await probe(config)
  } finally {
    diagnosing.value = false
  }
}

function createPost() {
  notice.value = ''
  error.value = ''
  isNew.value = true
  doc.value = {
    path: '',
    sha: '',
    data: { title: '', description: '', pubDate: today() },
    body: '',
  }
  mode.value = 'edit'
}

async function openPost(file: PostFile) {
  notice.value = ''
  error.value = ''
  loading.value = true
  try {
    doc.value = await readPost(config, file.path)
    isNew.value = false
    mode.value = 'edit'
  } catch (cause) {
    error.value = `打开 ${file.name} 失败：${explainError(cause, config)}`
  } finally {
    loading.value = false
  }
}

async function submit(payload: SavePayload) {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const path = isNew.value
      ? postPath(payload.slug, payload.draft, payload.extension)
      : payload.doc.path
    const target: PostDoc = { ...payload.doc, path, sha: payload.doc.sha }
    const result = await savePost(
      config,
      target,
      `${isNew.value ? 'post' : 'update'}: ${target.data.title || path}`,
    )
    notice.value = `已提交 ${result.path}`
    mode.value = 'list'
    doc.value = null
    await refresh()
  } catch (cause) {
    error.value = `提交失败：${explainError(cause, config)}`
  } finally {
    saving.value = false
  }
}

function showPosts() {
  view.value = 'posts'
}

function showConfig() {
  view.value = 'config'
  error.value = ''
  notice.value = ''
}

function cancelEdit() {
  mode.value = 'list'
  doc.value = null
  error.value = ''
}
</script>

<template>
  <div class="admin">
    <header class="bar">
      <strong>博客管理</strong>
      <nav v-if="ready" class="tabs">
        <button type="button" :class="{ on: view === 'posts' }" @click="showPosts">文章</button>
        <button type="button" :class="{ on: view === 'config' }" @click="showConfig">
          站点配置
        </button>
      </nav>
      <span v-if="ready" class="repo">{{ config.owner }}/{{ config.repo }} · {{ config.branch }}</span>
      <button v-if="ready" type="button" class="ghost" @click="disconnect">断开</button>
    </header>

    <template v-if="view === 'posts' || !ready">
      <p v-if="error" class="alert err">{{ error }}</p>
      <p v-else-if="notice" class="alert ok">{{ notice }}</p>

      <ul v-if="probeSteps.length || diagnosing" class="probe">
        <li v-if="diagnosing" class="pending">正在逐层检查…</li>
        <li v-for="step in probeSteps" :key="step.label" :class="{ bad: !step.ok }">
          <span class="mark">{{ step.ok ? '✓' : '✗' }}</span>
          <span class="lbl">{{ step.label }}</span>
          <span class="det">{{ step.detail }}</span>
        </li>
      </ul>
    </template>

    <section v-if="!ready" class="setup">
      <h2>连接 GitHub 仓库</h2>
      <p class="hint">
        文章以 markdown 文件提交到仓库，提交后 Cloudflare Pages 会自动重新构建。
        Token 只存在这个浏览器的 localStorage 里。
      </p>
      <label>仓库所有者 <input v-model.trim="config.owner" placeholder="your-github-name" /></label>
      <label>仓库名 <input v-model.trim="config.repo" placeholder="my-blog" /></label>
      <label>分支 <input v-model.trim="config.branch" placeholder="main" /></label>
      <label>
        Personal access token
        <input v-model.trim="config.token" type="password" placeholder="github_pat_..." />
      </label>
      <button type="button" class="primary" :disabled="loading" @click="connect">
        {{ loading ? '连接中…' : '连接' }}
      </button>
    </section>

    <template v-else>
      <ConfigEditor v-if="view === 'config'" :repo="config" />
      <PostEditor
        v-else-if="mode === 'edit' && doc"
        :doc="doc"
        :is-new="isNew"
        :saving="saving"
        @save="submit"
        @cancel="cancelEdit"
      />
      <PostList
        v-else
        :posts="posts"
        :loading="loading"
        :errored="Boolean(error)"
        @create="createPost"
        @open="openPost"
        @refresh="refresh"
      />
    </template>
  </div>
</template>

<style scoped>
.admin {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px 20px 64px;
}
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 20px;
}
.bar strong {
  font-size: 1.05rem;
}
.repo {
  color: var(--muted);
  font-size: 0.85rem;
  margin-left: auto;
}
.alert {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
  margin-bottom: 18px;
  white-space: pre-wrap;
}
.err {
  background: var(--err-bg);
  color: var(--err-fg);
}
.ok {
  background: var(--ok-bg);
  color: var(--ok-fg);
}
.setup {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 460px;
}
.setup h2 {
  margin: 0;
  font-size: 1rem;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.6;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--muted);
}
input {
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--field);
  color: inherit;
  font: inherit;
  font-size: 0.9rem;
}
input:focus {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
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
  align-self: flex-start;
}
button.ghost {
  background: transparent;
}
.tabs {
  display: flex;
  gap: 4px;
}
.tabs button {
  padding: 5px 12px;
  font-size: 0.84rem;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
}
.tabs button.on {
  background: var(--field);
  border-color: var(--line);
  color: inherit;
  font-weight: 600;
}
.probe {
  list-style: none;
  margin: 0 0 18px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 0.84rem;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.probe li {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.probe .mark {
  color: var(--ok-fg);
  font-weight: 700;
  width: 1em;
  flex: none;
}
.probe li.bad .mark {
  color: var(--err-fg);
}
.probe .lbl {
  font-weight: 600;
  flex: none;
}
.probe .det {
  color: var(--muted);
}
.probe li.pending {
  color: var(--muted);
}

@media (max-width: 620px) {
  .probe li {
    flex-wrap: wrap;
  }
  .probe .det {
    flex-basis: 100%;
    padding-left: 1.6em;
  }
}
</style>
