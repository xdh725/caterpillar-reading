# 毛毛虫阅读 — 项目指南

## 项目概述

「毛毛虫阅读」是**毛毛虫**的读书博客：导入书籍 → 自动分章 → AI 逐批解读内化成系列文章 → 按书归档 → 可反复回顾。

每本书是一个系列，标题如「阅读《思考快与慢》(一)」…「(完结)」，读完后可生成「回顾《思考快与慢》」回顾文（可多次）。

- **GitHub 仓库**: https://github.com/xdh725/caterpillar-reading
- **线上地址**: https://xdh725.github.io/caterpillar-reading/
- **GitHub 账号**: `xdh725`

## 核心工作流

```bash
# 1. 导入书籍（epub 或 txt；书籍原文存 books/，已 gitignore）
pnpm import-book /path/to/book.epub

# 2. 拆读：生成下一篇系列文章（自适应批次：约 15-20k 字/篇）
pnpm read-book <slug>
#    连续拆完一整本（含完结篇）
pnpm read-book <slug> --all

# 3. 回顾：复读该书全部笔记，生成回顾文（可多次，第二次起标题带 (二)）
pnpm review-book <slug>

# 4. 部署
bash scripts/deploy.sh
```

**slug** 生成规则：书名英文/拼音化（如《思考快与慢》→ `thinking-fast-and-slow`），导入时可用 `--slug` 覆盖。

## 文章体系

| type | 标题格式 | 触发方式 |
|------|----------|----------|
| `reading` | 阅读《书名》(一)(二)… | `read-book` 自动 |
| `finale` | 阅读《书名》(完结)：全书摘要与学习 | 全书读完自动 |
| `review` | 回顾《书名》/ 回顾《书名》(二)… | `review-book` 手动 |

### Frontmatter 扩展字段（`src/content/config.ts`）

```yaml
---
title: "阅读《思考快与慢》(一)"
published: 2026-10-12T10:00:00   # 带时刻！同日多篇靠时刻保序
tags: ["读书笔记", "心理学"]
category: "思考快与慢"            # 裸书名做分类（归档按书聚合）
book: thinking-fast-and-slow     # 书籍 slug
part: 1                          # 系列第几篇
chapterStart: 1                  # 覆盖章节起（1-based）
chapterEnd: 3                    # 覆盖章节止
type: reading                    # reading | finale | review
---
```

**注意**：`published` 必须带时刻（ISO 格式），同日生成的系列文章每篇递增 1 小时，否则 (一)(二) 顺序会乱。

## 目录结构

```
caterpillar-reading/
├── books/                      # ★ 私有工作区（gitignore！版权保护）
│   └── <slug>/
│       ├── raw.epub            # 原始书籍文件
│       └── chapters.json       # 分章结果（全文）
├── src/
│   ├── config.ts               # 站点配置（title=毛毛虫阅读, hue=120 绿）
│   ├── content/
│   │   ├── config.ts           # posts schema（含 book/part/type 扩展字段）
│   │   └── posts/              # 全部文章
│   ├── data/books/             # ★ 书籍元数据（提交，书架页数据源）
│   │   └── <slug>.json         # 书名/作者/章节目录/进度/文章映射
│   └── pages/
│       ├── books.astro         # 书架页
│       └── books/[slug].astro  # 书籍详情页（系列列表 + 回顾按钮）
└── scripts/
    ├── lib/                    # 共享库
    │   ├── epub.ts             # EPUB 解析（源自 mpnovel）
    │   ├── text-processor.ts   # 中英文分章（源自 mpnovel，已加固）
    │   ├── book-state.ts       # book.json / chapters.json 读写
    │   ├── claude.ts           # claude --print 封装（重试+退避）
    │   ├── prompt.ts           # 拆读/完结/回顾 prompt 模板
    │   └── post.ts             # frontmatter 组装 + 文章写入
    ├── import-book.ts          # 导入入口
    ├── read-book.ts            # 拆读入口
    ├── review-book.ts          # 回顾入口
    ├── new-post.js             # 普通文章脚手架
    └── deploy.sh               # 部署（本地构建 → gh-pages 推送）
```

## 数据流

```
raw.epub ──import-book──▶ books/<slug>/chapters.json（gitignored）
                        └─▶ src/data/books/<slug>.json（提交）
read-book ──claude--print──▶ src/content/posts/YYYY-MM-DD-{reading,finale}-<slug>-N.md（提交）
                            └─▶ 更新 book.json（articles/进度/status）+ 推微信草稿箱
review-book ──claude--print──▶ review 文章 + book.json.reviews[]
书架页 /books/ 读 src/data/books/*.json 构建时渲染
```

`status`: `reading` → `finished`（完结篇已发）→ `reviewed`（至少回顾过一次）

## 技术栈

Astro 5 + Fuwari 主题 + Tailwind + Svelte 5 + Pagefind；pnpm 9.14.4 强制（preinstall only-allow）；拆书脚本用 tsx 跑 TS + jszip 解 epub。

## 开发命令

```bash
pnpm install          # 安装依赖（强制 pnpm）
pnpm dev              # 本地开发（http://localhost:4321/caterpillar-reading/）
pnpm build            # 构建（astro build + pagefind）
pnpm check            # Astro 类型检查
pnpm type-check       # TypeScript 类型检查
pnpm format / lint    # Biome
```

## 部署

本地构建 + `bash scripts/deploy.sh` 推 gh-pages（含 .nojekyll，缺了 CSS/JS 全 404）。

**强制规则**：任何内容推送前必须 `pnpm build` + `pnpm preview`/`pnpm dev` 本地验证通过，绝不能跳过直接部署。

## 写作规范（AI 生成文章约束，已写入 prompt.ts）

1. 毛毛虫第一人称口吻，口语化但内容扎实
2. 正文 1500-2500 字
3. **转述为主**，直接引用原文不超过单句（版权）
4. 不得虚构书中内容
5. 文章结构：定位 → 章节概览 → 逐章解读（观点/论证/我的理解）→ 内化收获 3-5 条 → 下批预告
6. 完结篇：全书主线 → 核心模型 → 跨章主题 → 评分与行动清单
7. 回顾文：当初理解 vs 现在认知 → 主题再提炼 → 可复用经验清单 → 重读建议

## 微信排版兼容（每篇文章自动推草稿箱 ~/scripts/wechat-publish.sh）

- **禁止嵌套列表** — 改用平铺段落或标题分隔
- **禁止斜体** — 用加粗代替
- **禁止列表项内多段落** — 列表项内不要空行
- **禁止外部图片** — 用文字描述代替

## 注意事项

1. **base 路径 `/caterpillar-reading/`** 不可改（GitHub Pages 项目页）
2. **`books/` 永远不提交** — 书籍原文版权，gitignore 已配置
3. **`src/data/books/<slug>.json` 只存元数据**（书名/作者/章节标题列表），不存正文
4. 构建两步：astro build + pagefind
5. claude --print 过载（529）自动重试 5 次 + 指数退避，脚本内置
