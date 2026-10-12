/**
 * 书籍元数据类型 — src/data/books/<slug>.json 的结构
 * 注意：这里只存元数据（书名/作者/章节标题目录），不存正文（版权）
 */

export type BookStatus = "reading" | "finished" | "reviewed";

export type BookArticle = {
	/** 系列第几篇（reading 篇号，finale 不占号） */
	part: number;
	type: "reading" | "finale";
	chapterStart: number;
	chapterEnd: number;
	title: string;
	/** posts 目录下的文件名（不含路径，含 .md） */
	file: string;
	/** ISO 日期（YYYY-MM-DD） */
	published: string;
};

export type BookReview = {
	/** 第几次回顾（1-based） */
	round: number;
	type: "review";
	title: string;
	file: string;
	published: string;
};

export type BookMeta = {
	slug: string;
	title: string;
	author: string;
	lang: string;
	/** 导入的源文件格式 */
	sourceFormat: "epub" | "txt";
	totalChapters: number;
	/** 章节标题列表（相当于目录，可提交） */
	chapterTitles: string[];
	/** 每章字数（与 chapterTitles 对齐） */
	chapterChars: number[];
	importedAt: string;
	status: BookStatus;
	/** 下一个未处理章节（1-based） */
	nextChapter: number;
	articles: BookArticle[];
	finale: BookArticle | null;
	reviews: BookReview[];
	/** 可选封面，src/assets/images/books/<slug>.png */
	cover: string | null;
};

/** 单章结构（仅存于 gitignored 的 books/<slug>/chapters.json） */
export type Chapter = {
	index: number;
	title: string;
	text: string;
	chars: number;
};
