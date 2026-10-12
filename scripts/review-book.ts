// review-book — 回顾：复读该书全部笔记文章，生成回顾文（可多次，第 N 次标题带 (N)）
// 用法: pnpm review-book <slug>
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";
import { readMeta, writeMeta, PROJECT_ROOT } from "./lib/book-state";
import { runClaude } from "./lib/claude";
import { buildReviewPrompt, parseClaudeOutput, toChineseNumber } from "./lib/prompt";
import { nextPublishedTime, readPostBody, writePost } from "./lib/post";

const { positionals } = parseArgs({
	args: process.argv.slice(2),
	allowPositionals: true,
});
const slug = positionals[0];
if (!slug) {
	console.error("用法: pnpm review-book <slug>");
	process.exit(1);
}

const meta = readMeta(slug);

// 前置：完结篇必须存在（回顾是"读完整本"之后的动作）
if (!meta.finale) {
	console.error(
		`《${meta.title}》尚未读完（nextChapter=${meta.nextChapter}/${meta.totalChapters}，完结篇未生成）。先运行 pnpm read-book ${slug} --all 读完。`,
	);
	process.exit(1);
}

const round = meta.reviews.length + 1;
const title =
	round === 1 ? `回顾《${meta.title}》` : `回顾《${meta.title}》(${toChineseNumber(round)})`;
console.log(`\n=== ${title}（第 ${round} 次回顾）===`);

// 收集全部笔记 + 之前回顾
const articleNotes = [...meta.articles, meta.finale].map((a) => ({
	title: a.title,
	body: readPostBody(a.file),
}));
const previousReviews = meta.reviews.map((r) => ({
	title: r.title,
	body: readPostBody(r.file),
}));

const prompt = buildReviewPrompt(meta, round, articleNotes, previousReviews);
const raw = await runClaude(prompt);
const parsed = parseClaudeOutput(raw);

const published = nextPublishedTime();
const stem = `${published.slice(0, 10)}-review-${meta.slug}${round > 1 ? `-${round}` : ""}`;
const file = writePost(
	{
		title,
		published,
		description: parsed.description,
		tags: ["读书回顾", meta.title, ...parsed.tags].slice(0, 8),
		category: meta.title,
		book: meta.slug,
		type: "review",
	},
	parsed.body,
	stem,
);

meta.reviews.push({
	round,
	type: "review",
	title,
	file,
	published: published.slice(0, 10),
});
meta.status = "reviewed";
writeMeta(meta);

console.log(`✓ 已写入 src/content/posts/${file}（status → reviewed）`);

try {
	console.log("→ 推送微信草稿箱…");
	execSync(`bash ~/scripts/wechat-publish.sh src/content/posts/${file}`, {
		cwd: PROJECT_ROOT,
		stdio: "inherit",
		timeout: 120_000,
	});
} catch (e) {
	console.warn(`⚠️ 微信推送失败（不影响本地文章）: ${(e as Error).message?.slice(0, 200)}`);
}
