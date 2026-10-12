// read-book — 拆读：生成下一篇系列文章（自适应批次），读完自动完结篇
// 用法: pnpm read-book <slug> [--all]
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";
import { readChapters, readMeta, writeMeta, PROJECT_ROOT } from "./lib/book-state";
import { runClaude } from "./lib/claude";
import { buildFinalePrompt, buildReadingPrompt, parseClaudeOutput, toChineseNumber } from "./lib/prompt";
import { nextPublishedTime, readPostBody, writePost } from "./lib/post";
import type { BookMeta } from "../src/types/book";

// 批次参数：从 nextChapter 起累积章节
const BATCH_TARGET_CHARS = 15_000; // 目标累计字数
const BATCH_MAX_CHARS = 20_000; // 上限：再放一章就超则停
const BATCH_MAX_CHAPTERS = 8; // 硬上限章数
const SINGLE_CHAPTER_ALONE = 25_000; // 单章超此字数单独成篇

const { values: opts, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: { all: { type: "boolean", default: false } },
	allowPositionals: true,
});
const slug = positionals[0];
const runAll = opts.all;
if (!slug) {
	console.error("用法: pnpm read-book <slug> [--all]");
	process.exit(1);
}

let meta = readMeta(slug);
const chaptersFile = readChapters(slug);
const chapters = chaptersFile.chapters;

// ---------- 主循环 ----------
let safety = 0;
while (true) {
	if (meta.nextChapter > meta.totalChapters) {
		// 全书读完 → 完结篇
		await generateFinale(meta, chaptersFile.slug);
		break;
	}
	await generateNextReading(meta);

	if (!runAll) break;
	// 重新读 meta（generateNextReading 已更新并写盘）
	meta = readMeta(slug);
	if (meta.finale) break;
	if (++safety > 60) {
		console.error("安全阀：单次 --all 最多生成 60 篇，剩余请再跑一次");
		break;
	}
}

// ---------- 函数 ----------
async function generateNextReading(meta: BookMeta) {
	const start = meta.nextChapter; // 1-based
	const batch = planBatch(start);

	const partNumber = meta.articles.length + 1;
	const title = `阅读《${meta.title}》(${toChineseNumber(partNumber)})`;
	console.log(`\n=== 第 ${partNumber} 篇：${title}（第 ${batch.start}-${batch.end} 章，${batch.chars.toLocaleString()} 字）===`);

	const chapterTexts = batch.chapters.map((c) => ({ title: c.title, text: c.content }));
	const totalPartsEstimate = estimateTotalParts(meta);
	const prompt = buildReadingPrompt(meta, partNumber, chapterTexts, totalPartsEstimate);

	const raw = await runClaude(prompt);
	const parsed = parseClaudeOutput(raw);

	const published = nextPublishedTime();
	const stem = `${published.slice(0, 10)}-reading-${meta.slug}-${partNumber}`;
	const file = writePost(
		{
			title,
			published,
			description: parsed.description,
			tags: ["读书笔记", meta.title, ...parsed.tags].slice(0, 8),
			category: meta.title,
			book: meta.slug,
			part: partNumber,
			chapterStart: batch.start,
			chapterEnd: batch.end,
			type: "reading",
		},
		parsed.body,
		stem,
	);

	meta.articles.push({
		part: partNumber,
		type: "reading",
		chapterStart: batch.start,
		chapterEnd: batch.end,
		title,
		file,
		published: published.slice(0, 10),
	});
	meta.nextChapter = batch.end + 1;
	writeMeta(meta);

	console.log(`✓ 已写入 src/content/posts/${file}`);
	publishWechat(file);
}

async function generateFinale(meta: BookMeta, bookSlug: string) {
	if (meta.finale) {
		console.log("完结篇已存在，跳过。");
		return;
	}
	const title = `阅读《${meta.title}》(完结)：全书摘要与学习`;
	console.log(`\n=== 完结篇：${title} ===`);

	const notes = [...meta.articles, ...(meta.finale ? [meta.finale] : [])].map((a) => ({
		title: a.title,
		body: readPostBody(a.file),
	}));
	const prompt = buildFinalePrompt(meta, notes);
	const raw = await runClaude(prompt);
	const parsed = parseClaudeOutput(raw);

	const published = nextPublishedTime();
	const stem = `${published.slice(0, 10)}-finale-${bookSlug}`;
	const file = writePost(
		{
			title,
			published,
			description: parsed.description,
			tags: ["读书笔记", "完结", meta.title, ...parsed.tags].slice(0, 8),
			category: meta.title,
			book: meta.slug,
			type: "finale",
		},
		parsed.body,
		stem,
	);

	meta.finale = {
		part: meta.articles.length + 1,
		type: "finale",
		chapterStart: 1,
		chapterEnd: meta.totalChapters,
		title,
		file,
		published: published.slice(0, 10),
	};
	meta.status = "finished";
	writeMeta(meta);

	console.log(`✓ 已写入 src/content/posts/${file}（status → finished）`);
	publishWechat(file);
}

/** 自适应批次规划 */
function planBatch(start: number) {
	const picked: typeof chapters = [];
	let chars = 0;
	let end = start - 1; // 0-based 数组下标 = start-1

	for (let i = start - 1; i < chapters.length && picked.length < BATCH_MAX_CHAPTERS; i++) {
		const c = chapters[i];
		// 单章超长：单独成篇
		if (picked.length === 0 && c.charCount > SINGLE_CHAPTER_ALONE) {
			picked.push(c);
			chars = c.charCount;
			end = i;
			break;
		}
		if (picked.length > 0 && chars + c.charCount > BATCH_MAX_CHARS) break;
		picked.push(c);
		chars += c.charCount;
		end = i;
		// 达到目标字数即收（下一章还放得下也收，保持批次稳定）
		if (chars >= BATCH_TARGET_CHARS) break;
	}

	if (picked.length === 0) throw new Error(`批次规划失败：第 ${start} 章不存在`);
	return { start, end: end + 1, chars, chapters: picked };
}

/** 估算全书总篇数（提示用） */
function estimateTotalParts(meta: BookMeta): number {
	const total = meta.chapterChars.slice().reduce((s, c) => s + c, 0);
	return Math.max(1, Math.round(total / BATCH_TARGET_CHARS));
}

/** 推微信草稿箱（失败不阻塞流程） */
function publishWechat(file: string) {
	try {
		console.log(`→ 推送微信草稿箱: ${file}`);
		execSync(`bash ~/scripts/wechat-publish.sh src/content/posts/${file}`, {
			cwd: PROJECT_ROOT,
			stdio: "inherit",
			timeout: 120_000,
		});
	} catch (e) {
		console.warn(`⚠️ 微信推送失败（不影响本地文章）: ${(e as Error).message?.slice(0, 200)}`);
	}
}
