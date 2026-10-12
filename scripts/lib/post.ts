// 文章写入 — frontmatter 组装 + 同日时间戳递增保序
import fs from "node:fs";
import path from "node:path";
import { POSTS_DIR } from "./book-state";

export interface PostFrontmatter {
	title: string;
	/** 同日多篇系列文章：每篇递增，保证 (一)(二) 排序正确 */
	published: string; // ISO 带时刻，如 2026-10-12T10:00:00
	description: string;
	tags: string[];
	category: string;
	book: string;
	part?: number;
	chapterStart?: number;
	chapterEnd?: number;
	type: "reading" | "finale" | "review";
}

/**
 * 计算本篇的发布时间：
 * - 当天首篇 → 当天 10:00
 * - 当天已有文章 → 最新文章时间 + 1 小时（Fuwari 只按 published 排序）
 */
export function nextPublishedTime(): string {
	const now = new Date();
	const today = now.toISOString().slice(0, 10);
	let latest = new Date(`${today}T00:00:00`);
	fs.mkdirSync(POSTS_DIR, { recursive: true });
	for (const f of fs.existsSync(POSTS_DIR) ? fs.readdirSync(POSTS_DIR) : []) {
		const match = f.match(/^(\d{4}-\d{2}-\d{2})/);
		if (match?.[1] === today) {
			// 读该文件 published 时刻
			const content = fs.readFileSync(path.join(POSTS_DIR, f), "utf-8");
			const pub = content.match(/^published:\s*(\S+)/m)?.[1] ?? "";
			const d = new Date(pub.includes("T") ? pub : `${pub}T00:00:00`);
			if (!Number.isNaN(d.getTime()) && d > latest) latest = d;
		}
	}
	const next = new Date(Math.max(latest.getTime() + 60 * 60 * 1000, now.getTime()));
	return next.toISOString().slice(0, 19);
}

/** 组装并写入文章，返回文件名（含 .md） */
export function writePost(
	fm: PostFrontmatter,
	body: string,
	fileStem: string,
): string {
	const lines = [
		"---",
		`title: ${JSON.stringify(fm.title)}`,
		`published: ${fm.published}`,
		`description: ${JSON.stringify(fm.description)}`,
		`tags: [${fm.tags.map((t) => JSON.stringify(t)).join(", ")}]`,
		`category: ${JSON.stringify(fm.category)}`,
		`book: ${fm.book}`,
	];
	if (fm.part !== undefined) lines.push(`part: ${fm.part}`);
	if (fm.chapterStart !== undefined) lines.push(`chapterStart: ${fm.chapterStart}`);
	if (fm.chapterEnd !== undefined) lines.push(`chapterEnd: ${fm.chapterEnd}`);
	lines.push(`type: ${fm.type}`, "---", "", body, "");

	const fileName = `${fileStem}.md`;
	fs.mkdirSync(POSTS_DIR, { recursive: true });
	fs.writeFileSync(path.join(POSTS_DIR, fileName), lines.join("\n"));
	return fileName;
}

/** 读取一篇文章的正文（去掉 frontmatter） */
export function readPostBody(file: string): string {
	const content = fs.readFileSync(path.join(POSTS_DIR, file), "utf-8");
	const fmEnd = content.indexOf("---", 3);
	return fmEnd < 0 ? content : content.slice(fmEnd + 3).trim();
}
