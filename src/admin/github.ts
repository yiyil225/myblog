/**
 * GitHub Contents API client for the /admin editor.
 *
 * Everything the admin writes lands in the repo as a markdown file under
 * `src/content/blog`. The push then triggers the Cloudflare Pages rebuild,
 * so no database is involved.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const API = 'https://api.github.com'

/** Must match the `base` of the blog collection in src/content.config.ts. */
export const CONTENT_DIR = 'src/content/blog'

/** The theme's glob loader skips files starting with `_`, so `_foo.md` is a draft. */
export const DRAFT_PREFIX = '_'

export type RepoConfig = {
  owner: string
  repo: string
  branch: string
  token: string
}

export type PostFile = {
  name: string
  path: string
  sha: string
  draft: boolean
}

/** A post as it exists on disk: frontmatter object + markdown body. */
export type PostDoc = {
  /** Repo path, e.g. `src/content/blog/first-post.md`. Empty for a new post. */
  path: string
  /** Blob sha, needed by the API to replace an existing file. Empty for a new post. */
  sha: string
  data: Record<string, unknown>
  body: string
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

async function request<T>(
  cfg: RepoConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const detail = await response.text()
    let message = `${response.status} ${response.statusText}`
    try {
      const parsed = JSON.parse(detail) as { message?: string }
      if (parsed.message) message = `${message} — ${parsed.message}`
    } catch {
      // Non-JSON error body; the status line is all we have.
    }
    throw new Error(message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

type ContentsEntry = {
  name: string
  path: string
  sha: string
  type: 'file' | 'dir' | 'symlink' | 'submodule'
}

export async function listPosts(cfg: RepoConfig): Promise<PostFile[]> {
  const entries = await request<ContentsEntry[]>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${CONTENT_DIR}?ref=${encodeURIComponent(cfg.branch)}`,
  )

  return entries
    .filter((entry) => entry.type === 'file' && /\.mdx?$/i.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      sha: entry.sha,
      draft: entry.name.startsWith(DRAFT_PREFIX),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

type ContentsFile = {
  content: string
  sha: string
  encoding: string
}

export async function readPost(cfg: RepoConfig, path: string): Promise<PostDoc> {
  const file = await request<ContentsFile>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`,
  )
  const raw = fromBase64(file.content)
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)

  // A post without frontmatter would fail the collection schema, but do not
  // silently drop the author's text: keep the whole file as the body.
  if (!match) return { path, sha: file.sha, data: {}, body: raw }

  const parsed = parseYaml(match[1])
  return {
    path,
    sha: file.sha,
    data: (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>,
    body: raw.slice(match[0].length),
  }
}

export function serializePost(doc: PostDoc): string {
  const frontmatter = stringifyYaml(doc.data, { lineWidth: 0 }).trimEnd()
  return `---\n${frontmatter}\n---\n\n${doc.body.replace(/^\n+/, '')}`
}

export function postPath(slug: string, draft: boolean, extension: 'md' | 'mdx'): string {
  const clean = slug.trim().replace(/^_+/, '').replace(/\.mdx?$/i, '')
  return `${CONTENT_DIR}/${draft ? DRAFT_PREFIX : ''}${clean}.${extension}`
}

/** What the editor component hands back to the app shell on submit. */
export type SavePayload = {
  doc: PostDoc
  slug: string
  draft: boolean
  extension: 'md' | 'mdx'
}

export type CommitResult = {
  path: string
  htmlUrl: string
  commitUrl: string
}

export async function savePost(
  cfg: RepoConfig,
  doc: PostDoc,
  message: string,
): Promise<CommitResult> {
  const body: Record<string, unknown> = {
    message,
    content: toBase64(serializePost(doc)),
    branch: cfg.branch,
  }
  // Without the previous sha the API creates a new file and rejects the call
  // when one already exists at that path.
  if (doc.sha) body.sha = doc.sha

  const result = await request<{
    content: { path: string; html_url: string } | null
    commit: { html_url: string }
  }>(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${doc.path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  return {
    path: doc.path,
    htmlUrl: result.content?.html_url ?? '',
    commitUrl: result.commit?.html_url ?? '',
  }
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    // Keep CJK: a Chinese title should still produce a readable URL segment.
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `post-${Date.now()}`
}

/** `2026-01-15` — the collection schema coerces strings to Date. */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
