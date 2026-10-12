// 书籍状态管理 — 读写 src/data/books/<slug>.json（提交）与 books/<slug>/（gitignored）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BookMeta } from "../../src/types/book";
import type { ChaptersFile } from "./types";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATA_DIR = path.join(PROJECT_ROOT, "src/data/books");
export const WORKSPACE_DIR = path.join(PROJECT_ROOT, "books");
export const POSTS_DIR = path.join(PROJECT_ROOT, "src/content/posts");

export function metaPath(slug: string) {
	return path.join(DATA_DIR, `${slug}.json`);
}

export function workspaceDir(slug: string) {
	return path.join(WORKSPACE_DIR, slug);
}

export function chaptersPath(slug: string) {
	return path.join(workspaceDir(slug), "chapters.json");
}

export function readMeta(slug: string): BookMeta {
	const p = metaPath(slug);
	if (!fs.existsSync(p)) {
		throw new Error(`未找到书籍 ${slug}（${p} 不存在）。先运行 pnpm import-book 导入。`);
	}
	return JSON.parse(fs.readFileSync(p, "utf-8")) as BookMeta;
}

export function writeMeta(meta: BookMeta) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(metaPath(meta.slug), `${JSON.stringify(meta, null, "\t")}\n`);
}

export function readChapters(slug: string): ChaptersFile {
	const p = chaptersPath(slug);
	if (!fs.existsSync(p)) {
		throw new Error(
			`未找到分章数据 ${p}。该文件在本地 books/ 工作区（gitignored），如在别的机器上请重新导入原书。`,
		);
	}
	return JSON.parse(fs.readFileSync(p, "utf-8")) as ChaptersFile;
}

export function writeChapters(file: ChaptersFile) {
	fs.mkdirSync(workspaceDir(file.slug), { recursive: true });
	fs.writeFileSync(chaptersPath(file.slug), JSON.stringify(file));
}

export function listBooks(): BookMeta[] {
	if (!fs.existsSync(DATA_DIR)) return [];
	return fs
		.readdirSync(DATA_DIR)
		.filter((f) => f.endsWith(".json"))
		.map((f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8")) as BookMeta);
}
