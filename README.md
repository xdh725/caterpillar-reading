# 毛毛虫阅读 🐛📚

一只毛毛虫的读书内化日记：导入书籍 → 自动分章 → AI 逐批解读 → 内化成系列文章 → 按书归档 → 可反复回顾。

- **线上地址**: https://xdh725.github.io/caterpillar-reading/
- **书架页**: https://xdh725.github.io/caterpillar-reading/books/

## 快速开始

```bash
pnpm install

# 导入一本书（epub / txt），原文存 books/（gitignored，不进仓库）
pnpm import-book /path/to/book.epub

# 拆读（每次生成一篇系列文章「阅读《书名》(N)」）
pnpm read-book <slug>

# 一口气读完一整本（含完结篇）
pnpm read-book <slug> --all

# 回顾（复读全部笔记生成回顾文，可多次）
pnpm review-book <slug>

# 本地预览
pnpm dev

# 部署到 GitHub Pages
bash scripts/deploy.sh
```

## 文章体系

| 类型 | 标题 | 说明 |
|------|------|------|
| 系列 | 阅读《书名》(一)(二)… | 逐批章节解读内化，约 15-20k 字/篇 |
| 完结 | 阅读《书名》(完结)：全书摘要与学习 | 全书读完自动生成 |
| 回顾 | 回顾《书名》 | 回头重读全部笔记，认知迭代记录，可多次 |

## 版权说明

- `books/` 目录（书籍原文与分章文本）已 gitignore，**永远不会提交到仓库**
- 文章以转述与个人理解为主，直接引用不超过单句
- 提交到仓库的只有 `src/data/books/<slug>.json`（书名/作者/章节标题目录）与生成的解读文章

## 技术栈

Astro 5 + [Fuwari](https://github.com/saicaca/fuwari) + Tailwind + Svelte 5 + Pagefind；拆书脚本 Node + tsx + jszip，AI 内化由 `claude --print` headless 执行。

## License

CC BY-NC-SA 4.0
