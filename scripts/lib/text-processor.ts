// Text processor — adapted from mpnovel (novelsoul's ingest/splitter.ts)
// Handles text normalization, chapter detection, and smart chunking.
// 加固：标题命中数 < MIN_CHAPTER_DETECTION_COUNT 时回退为按字数切块
// （阈值借鉴 ai-novel-writing-assistant bookAnalysis.constants.ts）

import { Chapter, ChapterSubSegment, TextChunk } from "./types";

/** 少于这个数量的标题命中，视为"没有章节结构"，回退字数切块 */
const MIN_CHAPTER_DETECTION_COUNT = 3;
/** 回退切块的目标字数 */
const FALLBACK_CHUNK_CHARS = 20_000;

/**
 * Normalize text content:
 * - Remove duplicate chapter titles (e.g., "第001章 初次相见      第001章 初次相见")
 * - Normalize line endings
 * - Remove leading/trailing whitespace from lines
 */
function normalizeText(text: string): string {
  const lines = text.split("\n");
  const normalized = lines.map((line) => {
    const trimmed = line.trim();
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length === 2 && parts[0] === parts[1]) {
      return parts[0];
    }
    return trimmed;
  });
  return normalized.join("\n");
}

/**
 * Detect language from text sample.
 */
export function detectLanguage(text: string): "zh" | "en" | "mixed" | "unknown" {
  const sample = text.slice(0, 10000);
  const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishChars = (sample.match(/[a-zA-Z]/g) || []).length;
  const total = chineseChars + englishChars;

  if (total === 0) return "unknown";
  const zhRatio = chineseChars / total;
  if (zhRatio > 0.7) return "zh";
  if (zhRatio < 0.3) return "en";
  return "mixed";
}

/**
 * Count words (Chinese chars + English words).
 */
export function countWords(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  return chineseChars + englishWords;
}

/**
 * Split a raw text into chapters using heuristic markers.
 */
export function splitChapters(rawText: string, title: string): Chapter[] {
  const text = normalizeText(rawText);

  // 先统计标题命中数，少于阈值判定为无章节结构
  const detected = detectByTitles(text, title);
  if (detected.length >= MIN_CHAPTER_DETECTION_COUNT) {
    return detected;
  }

  // 回退：整本书按字数切块（先按字符区间粗切，再向前回退到段落边界）
  const chunks: Chapter[] = [];
  let pos = 0;
  let chunkNo = 1;
  while (pos < text.length) {
    let end = Math.min(pos + FALLBACK_CHUNK_CHARS, text.length);
    // 向前回退到换行处，避免在段落中间切断（最多回退半个块，避免死循环）
    if (end < text.length) {
      const lastBreak = text.lastIndexOf("\n", end);
      if (lastBreak > pos + FALLBACK_CHUNK_CHARS / 2) {
        end = lastBreak;
      }
    }
    const content = text.slice(pos, end).trim();
    if (content.length > 0) {
      chunks.push({
        index: chunks.length,
        title: `片段 ${chunkNo}`,
        content,
        startOffset: pos,
        charCount: content.length,
      });
      chunkNo++;
    }
    pos = end;
  }

  if (chunks.length === 0) {
    chunks.push({
      index: 0,
      title,
      content: text,
      startOffset: 0,
      charCount: text.length,
    });
  }
  return chunks;
}

/** 按标题正则分章（原 splitChapters 主体） */
function detectByTitles(text: string, title: string): Chapter[] {
  const lines = text.split("\n");

  const chapterPatterns = [
    /^第[零一二三四五六七八九十百千万\d]+[章节回卷幕篇]/,
    /^Chapter\s+\d+/i,
    /^CHAPTER\s+[IVXLCDM\d]+/i,
    /^Part\s+\d+/i,
    /^卷[零一二三四五六七八九十百千万\d]/,
    /^【第[零一二三四五六七八九十百千万\d]+[章节回卷幕篇]】/,
    /^序[言章幕]/,
    /^楔子$/,
    /^引[言子]/,
    /^尾声$/,
    /^番外/,
    /^后记$/,
    /^Epilogue$/i,
    /^Prologue$/i,
  ];

  const chapters: Chapter[] = [];
  let currentChapterStart = 0;
  let currentChapterTitle = "前言 / 开头";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.length > 0 && line.length < 80) {
      const isChapterTitle = chapterPatterns.some((p) => p.test(line));

      if (isChapterTitle && i > 0) {
        const content = cleanContent(lines.slice(currentChapterStart, i));
        if (content.length > 0) {
          chapters.push({
            index: chapters.length,
            title: currentChapterTitle,
            content,
            startOffset: 0,
            charCount: content.length,
          });
        }
        currentChapterStart = i;
        currentChapterTitle = line;
      } else if (isChapterTitle && i === 0) {
        currentChapterTitle = line;
      }
    }
  }

  const lastContent = cleanContent(lines.slice(currentChapterStart));
  if (lastContent.length > 0) {
    chapters.push({
      index: chapters.length,
      title: currentChapterTitle,
      content: lastContent,
      startOffset: 0,
      charCount: lastContent.length,
    });
  }

  if (chapters.length === 0) {
    chapters.push({
      index: 0,
      title,
      content: text,
      startOffset: 0,
      charCount: text.length,
    });
  }

  return chapters;
}

function cleanContent(lines: string[]): string {  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

/**
 * Smart chunking strategy:
 * - Small chapters (< chunkSize) are merged together
 * - Large chapters (> chunkSize) are split at paragraph boundaries
 */
export function splitChunks(chapters: Chapter[], chunkSize: number): TextChunk[] {
  const chunks: TextChunk[] = [];

  // Phase 1: Merge small chapters into chunk-sized groups
  const mergedGroups: Array<{ title: string; content: string }> = [];
  let currentGroup = "";
  let currentGroupTitle = "";

  for (const chapter of chapters) {
    if (chapter.charCount < 50) continue;

    const header = `\n【${chapter.title}】\n`;

    if (currentGroup.length + chapter.content.length + header.length > chunkSize && currentGroup.length > 0) {
      mergedGroups.push({ title: currentGroupTitle, content: currentGroup.trim() });
      currentGroup = header + chapter.content;
      currentGroupTitle = chapter.title;
    } else {
      currentGroup += (currentGroup ? "\n" : "") + header + chapter.content;
      currentGroupTitle = currentGroupTitle || chapter.title;
    }
  }

  if (currentGroup.trim().length > 0) {
    mergedGroups.push({ title: currentGroupTitle, content: currentGroup.trim() });
  }

  // Phase 2: Split any oversized groups at paragraph boundaries
  for (const group of mergedGroups) {
    if (group.content.length <= chunkSize * 1.2) {
      chunks.push({
        index: chunks.length,
        chapterIndex: 0,
        chapterTitle: group.title,
        content: group.content,
        charCount: group.content.length,
      });
    } else {
      const paragraphs = group.content.split(/\n/).filter((p) => p.trim().length > 0);
      let currentChunk = "";

      for (const para of paragraphs) {
        const trimmed = para.trim();

        if (currentChunk.length + trimmed.length + 1 > chunkSize && currentChunk.length > 0) {
          chunks.push({
            index: chunks.length,
            chapterIndex: 0,
            chapterTitle: group.title,
            content: currentChunk.trim(),
            charCount: currentChunk.trim().length,
          });
          currentChunk = trimmed;
        } else {
          currentChunk += (currentChunk ? "\n" : "") + trimmed;
        }
      }

      if (currentChunk.trim().length > 0) {
        chunks.push({
          index: chunks.length,
          chapterIndex: 0,
          chapterTitle: group.title,
          content: currentChunk.trim(),
          charCount: currentChunk.trim().length,
        });
      }
    }
  }

  return chunks;
}

// ============================================================
// v2: 逐章总结 — 章内子片段切分（用于超长章节）
// ============================================================

/** 单个片段的最大字符数（超出此长度的章节将被切分） */
const SUB_SEGMENT_MAX_CHARS = 15_000;

/**
 * 将超长章节切分为多个子片段（段落边界切分）。
 * 每个子片段 ≤ SUB_SEGMENT_MAX_CHARS。
 * 用于逐章总结时，单章内容过长无法一次性送入 LLM 的场景。
 *
 * - 章节长度 ≤ SUB_SEGMENT_MAX_CHARS → 返回单元素数组
 * - 章节长度 > SUB_SEGMENT_MAX_CHARS → 在段落边界切分为多段
 */
export function splitLongChapter(chapter: Chapter): ChapterSubSegment[] {
  if (chapter.charCount <= SUB_SEGMENT_MAX_CHARS) {
    return [
      {
        index: 0,
        content: chapter.content,
        charCount: chapter.charCount,
      },
    ];
  }

  const segments: ChapterSubSegment[] = [];
  const paragraphs = chapter.content.split(/\n/).filter((p) => p.trim().length > 0);
  let currentSegment = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (currentSegment.length + trimmed.length + 1 > SUB_SEGMENT_MAX_CHARS && currentSegment.length > 0) {
      segments.push({
        index: segments.length,
        content: currentSegment.trim(),
        charCount: currentSegment.trim().length,
      });
      currentSegment = trimmed;
    } else {
      currentSegment += (currentSegment ? "\n" : "") + trimmed;
    }
  }

  if (currentSegment.trim().length > 0) {
    segments.push({
      index: segments.length,
      content: currentSegment.trim(),
      charCount: currentSegment.trim().length,
    });
  }

  return segments;
}

/**
 * 统计章节信息（用于进度展示和覆盖率计算）。
 */
export function getChapterStats(chapters: Chapter[]): {
  totalChapters: number;
  totalChars: number;
  longestChapter: { index: number; title: string; charCount: number };
  shortestChapter: { index: number; title: string; charCount: number };
  avgChapterLength: number;
} {
  if (chapters.length === 0) {
    return {
      totalChapters: 0,
      totalChars: 0,
      longestChapter: { index: 0, title: "", charCount: 0 },
      shortestChapter: { index: 0, title: "", charCount: 0 },
      avgChapterLength: 0,
    };
  }

  const totalChars = chapters.reduce((sum, ch) => sum + ch.charCount, 0);
  let longest = chapters[0];
  let shortest = chapters[0];

  for (const ch of chapters) {
    if (ch.charCount > longest.charCount) longest = ch;
    if (ch.charCount < shortest.charCount) shortest = ch;
  }

  return {
    totalChapters: chapters.length,
    totalChars,
    longestChapter: { index: longest.index, title: longest.title, charCount: longest.charCount },
    shortestChapter: { index: shortest.index, title: shortest.title, charCount: shortest.charCount },
    avgChapterLength: Math.round(totalChars / chapters.length),
  };
}
