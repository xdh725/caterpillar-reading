// 拆书脚本共享类型 — books/<slug>/chapters.json 与批次的数据结构
// （仅存于 gitignored 的 books/ 工作区，不进仓库）

/** 分章结果中的单章 */
export interface Chapter {
	index: number; // 0-based
	title: string;
	content: string;
	startOffset: number;
	charCount: number;
}

/** 智能分块产物（小章合并/大章拆段） */
export interface TextChunk {
	index: number;
	chapterIndex: number;
	chapterTitle: string;
	content: string;
	charCount: number;
}

/** 超长章节的子片段 */
export interface ChapterSubSegment {
	index: number;
	content: string;
	charCount: number;
}

/** books/<slug>/chapters.json 的整体结构 */
export interface ChaptersFile {
	slug: string;
	title: string;
	author: string;
	importedAt: string;
	chapters: Chapter[];
}
