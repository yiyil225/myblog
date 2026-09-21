# 从零开始的编程

记录编程学习过程。

基于 [astro-theme-reimu](https://github.com/D-Sketon/astro-theme-reimu) 主题，加了一个 Vue 写的管理后台，部署在 Cloudflare Pages 上。

## 技术栈

| | |
|---|---|
| 站点生成 | [Astro](https://astro.build) 5（纯静态输出） |
| 主题 | [astro-theme-reimu](https://github.com/D-Sketon/astro-theme-reimu) |
| 管理后台 | [Vue 3](https://vuejs.org)，路由在 `/admin` |
| 托管 | [Cloudflare Pages](https://pages.cloudflare.com) |

文章是仓库里的 markdown 文件（`src/content/blog/`），没有数据库。后台通过 GitHub API 提交文件，push 之后 Cloudflare 自动重新构建。

## 本地开发

需要 Node.js ≥ 22.12 和 pnpm 9。

```bash
pnpm install
pnpm dev
```

| 地址 | 内容 |
|---|---|
| http://localhost:4321/ | 博客 |
| http://localhost:4321/admin/ | 管理后台 |

## 常用命令

```bash
pnpm dev        # 开发服务器
pnpm build      # 构建到 dist/
pnpm preview    # 用生产产物起本地服务器
pnpm deploy     # 构建并部署到 Cloudflare Pages
pnpm cf:login   # 登录 Cloudflare
pnpm lint       # 检查代码
```

`pnpm dev` 和 `pnpm preview` 默认都占用 4321 端口，不能同时开。

## 写文章

打开 `/admin`，第一次需要填三样东西：仓库所有者、仓库名，以及一个 GitHub token。

Token 在 https://github.com/settings/personal-access-tokens/new 生成，两处要设对：

- **Repository access** → `Only select repositories` → 选本仓库（选 `Public repositories (read-only)` 会导致没有写权限）
- **Permissions** → `Contents` 和 `Workflows` 都设为 `Read and write`

Token 只存在浏览器的 localStorage 里，不会进入代码库。

填好之后可以：

- **文章** 标签页：新建、编辑文章，或者存成草稿（文件名加 `_` 前缀，构建时会跳过）
- **站点配置** 标签页：改 `src/config.ts` 里的全部设置，保存时只替换改动的部分，注释和排版都会保留

## 部署

首次部署：

```bash
pnpm cf:login
pnpm deploy
```

也可以在 Cloudflare 面板里把 Pages 项目和本仓库关联，之后每次 push 自动构建。构建命令填 `pnpm build`，输出目录填 `dist`。

## 同步主题更新

本仓库保留了主题仓库作为 upstream：

```bash
git fetch upstream
git merge upstream/main
```

`/admin` 的后台代码在 `src/admin/` 和 `src/pages/admin/`，和上游主题的文件不重叠，合并时一般不会冲突。

## 说明

- `README.en.md`、`CHANGELOG.md`、`screenshot.png` 是主题仓库带过来的文件
- `src/content/blog/` 下的 5 篇示例文章可以删掉
- `astro.config.mjs` 里的 `site` 需要改成自己的域名，否则 RSS 和 sitemap 里的链接是错的

## 许可

主题部分版权归 [D-Sketon](https://github.com/D-Sketon)，MIT 协议，详见 [LICENSE](LICENSE)。
