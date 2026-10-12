// import-book — 导入书籍（epub/txt）：解析 → 分章 → 写入工作区与元数据
// 用法: pnpm import-book /path/to/book.epub [--slug xxx] [--title 书名] [--author 作者]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parseEpubToText } from "./lib/epub";
import { detectLanguage, splitChapters } from "./lib/text-processor";
import { writeChapters, writeMeta, metaPath, workspaceDir } from "./lib/book-state";
import type { BookMeta } from "../src/types/book";

const { values: opts, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: {
		slug: { type: "string" },
		title: { type: "string" },
		author: { type: "string" },
	},
	allowPositionals: true,
});
const args = { slug: opts.slug, title: opts.title, author: opts.author, positional: positionals[0] };

const filePath = args.positional;
if (!filePath || !fs.existsSync(filePath)) {
	console.error("用法: pnpm import-book /path/to/book.epub [--slug xxx] [--title 书名] [--author 作者]");
	process.exit(1);
}

// ---------- 1. 提取文本 ----------
const ext = path.extname(filePath).toLowerCase();
let text = "";
let bookTitle = args.title ?? "";
let bookAuthor = args.author ?? "";
let sourceFormat: "epub" | "txt" = "txt";

if (ext === ".epub") {
	sourceFormat = "epub";
	const result = await parseEpubToText(new Uint8Array(fs.readFileSync(filePath)));
	text = result.text;
	bookTitle = bookTitle || result.title || "";
	bookAuthor = bookAuthor || result.author || "";
} else if (ext === ".txt" || ext === ".md") {
	const buf = fs.readFileSync(filePath);
	text = decodeText(buf);
	bookTitle = bookTitle || path.basename(filePath, ext);
} else {
	console.error(`不支持的格式 ${ext}，目前支持 .epub / .txt`);
	process.exit(1);
}

if (text.trim().length < 500) {
	console.error(`提取文本过短（${text.trim().length} 字符），文件可能损坏或格式异常`);
	process.exit(1);
}

if (!bookTitle) bookTitle = path.basename(filePath, ext);

// ---------- 2. slug ----------
const slug = args.slug ?? slugify(bookTitle);
if (fs.existsSync(metaPath(slug))) {
	console.error(`书籍 ${slug} 已存在（${metaPath(slug)}）。如需重新导入请先删除该文件。`);
	process.exit(1);
}

// ---------- 3. 分章 ----------
const chapters = splitChapters(text, bookTitle);
console.log(`《${bookTitle}》${bookAuthor ? `（${bookAuthor}）` : ""}`);
console.log(`  提取文本: ${text.length.toLocaleString()} 字符`);
console.log(`  分章结果: ${chapters.length} 章（平均 ${Math.round(text.length / chapters.length).toLocaleString()} 字/章）`);

// ---------- 4. 写入 ----------
// 工作区（gitignored）：原书拷贝 + 分章全文
const wsDir = workspaceDir(slug);
fs.mkdirSync(wsDir, { recursive: true });
fs.copyFileSync(filePath, path.join(wsDir, `raw${ext}`));
writeChapters({
	slug,
	title: bookTitle,
	author: bookAuthor,
	importedAt: today(),
	chapters,
});

// 元数据（提交）：只含目录级信息
const meta: BookMeta = {
	slug,
	title: bookTitle,
	author: bookAuthor || "佚名",
	lang: detectLanguage(text),
	sourceFormat,
	totalChapters: chapters.length,
	chapterTitles: chapters.map((c) => c.title),
	chapterChars: chapters.map((c) => c.charCount),
	importedAt: today(),
	status: "reading",
	nextChapter: 1,
	articles: [],
	finale: null,
	reviews: [],
	cover: null,
};
writeMeta(meta);

console.log(`  元数据: ${metaPath(slug)}`);
console.log(`  工作区: ${wsDir}/（gitignored）`);
console.log(`\n下一步: pnpm read-book ${slug}`);

// ---------- utils ----------
function today() {
	return new Date().toISOString().slice(0, 10);
}

/** 书名 → slug：ASCII 保留，中文逐字转拼音首字母太脆，直接用可读转写 */
function slugify(title: string) {
	const cleaned = title
		.toLowerCase()
		.replace(/[《》"'’“”()（）\[\]【】,\.。!！?？:：;；]/g, " ")
		.trim();
	const asciiWords = cleaned.match(/[a-z0-9]+/g);
	if (asciiWords && asciiWords.join("").length >= 4) {
		return asciiWords.join("-").slice(0, 60);
	}
	// 中文书名：没有可靠拼音库，退化为短 hash + 提示用户用 --slug
	const hash = Math.abs(hashCode(title)).toString(36).slice(0, 8);
	console.warn(`  ⚠️ 书名「${title}」无法自动生成可读英文 slug，使用 ${hash}（建议加 --slug 指定）`);
	return `book-${hash}`;
}

function hashCode(s: string) {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
	}
	return h;
}

/** 文本解码：UTF-8 优先，失败或大量替换字符时尝试 GBK（iconv） */
function decodeText(buf: Buffer): string {
	const utf8 = buf.toString("utf-8");
	// 严重乱码特征：替换字符 � 占比高
	const bad = (utf8.match(/�/g) ?? []).length;
	if (bad < buf.length * 0.001) return utf8;
	try {
		const iconv = require("iconv-lite") as { decode: (b: Buffer, e: string) => string };
		console.log("  检测到非 UTF-8 编码，尝试 GBK 解码…");
		return iconv.decode(buf, "gbk");
	} catch {
		console.warn("  ⚠️ 文本疑似非 UTF-8 编码但 iconv-lite 未安装，按 UTF-8 处理（可能乱码）");
		return utf8;
	}
}
