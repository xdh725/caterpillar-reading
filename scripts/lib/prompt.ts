// Prompt 模板 — 拆读 / 完结 / 回顾 三套
import type { BookMeta } from "../../src/types/book";

/** AI 输出契约：META JSON + BODY markdown 两段式 */
export const OUTPUT_CONTRACT = `你的输出必须严格遵守以下两段式格式（这是脚本解析的契约，格式错误会导致重试）：

<<<META>>>
{"description": "80-120 字的文章摘要", "tags": ["标签1", "标签2", "标签3"]}
<<<BODY>>>
（这里写 Markdown 正文）`;

/** 公共写作人设与约束 */
const PERSONA = `你是「毛毛虫」，一只坚持读书内化的 AI Agent，正在自己的博客「毛毛虫阅读」上写读书笔记。

写作硬约束：
1. 毛毛虫第一人称口吻，口语化但内容扎实，不装腔作势
2. 正文 1500-2500 字（中文字符计）
3. 转述为主，直接引用原文任何单句不超过 30 字（版权保护）
4. 不得虚构书中不存在的内容、观点或数据
5. 微信公众号排版兼容：禁止嵌套列表、禁止斜体（用加粗代替）、列表项内不要空行、禁止图片`;

/** 系列文章结构 */
const READING_STRUCTURE = `文章结构（用二级标题分节）：
1. 开头一段：一句话定位本批章节在全书中的位置（不用标题）
2. ## 本批章节概览 — 每章 2-3 句说了什么
3. ## 逐章解读 — 每章一小节（### 章节名）：核心观点 / 论证与关键例子 / 毛毛虫的理解（我说人话）
4. ## 内化收获 — 3-5 条，每条都要连接到已有经验、其他书或工作生活，不写空话
5. 结尾一段：下一批预告（不用标题）`;

const FINALE_STRUCTURE = `文章结构（用二级标题分节）：
1. 开头一段：读完一整本书的总体感受（不用标题）
2. ## 全书主线 — 这本书到底在论证什么
3. ## 核心模型图景 — 把书里最重要的 3-5 个模型/概念串成一张认知地图
4. ## 跨章主题提炼 — 逐篇笔记里反复出现的主题
5. ## 整体评分与行动清单 — 10 分制打分说理由；列出读完后要付诸行动的 3-5 件事`;

const REVIEW_STRUCTURE = `文章结构（用二级标题分节）：
1. 开头一段：为什么隔了一段时间重读这本书的笔记（不用标题）
2. ## 当初的理解 vs 现在的认知 — 哪些理解被深化了、哪些被推翻了、哪些当时没读懂现在读懂了
3. ## 跨章节主题再提炼 — 重读全部笔记后看到的、初读时看不见的东西
4. ## 沉淀出的可复用经验清单 — 具体可操作的条目，能带走的才算沉淀
5. ## 给未来重读的建议 — 多久后值得再读一次，重点重读哪些章节，为什么`;

export function buildReadingPrompt(
	meta: BookMeta,
	partNumber: number,
	chapterTexts: { title: string; text: string }[],
	totalPartsEstimate: number,
): string {
	return `${PERSONA}

# 任务
为《${meta.title}》（${meta.author} 著）写系列拆读文章的第 ${partNumber} 篇，覆盖以下 ${chapterTexts.length} 个章节（全书 ${meta.totalChapters} 章，预计共约 ${totalPartsEstimate} 篇）。

# 本批章节原文
${chapterTexts
	.map((c, i) => `## 第 ${chapterTexts[0] ? meta.nextChapter + i : i + 1} 章（原文）：${c.title}\n\n${c.text}`)
	.join("\n\n---\n\n")}

# 输出
标题已定为「阅读《${meta.title}》(${toChineseNumber(partNumber)})」，由脚本写入 frontmatter，你只输出 description/tags 和正文。

${READING_STRUCTURE}

${OUTPUT_CONTRACT}`;
}

export function buildFinalePrompt(
	meta: BookMeta,
	articleNotes: { title: string; body: string }[],
): string {
	return `${PERSONA}

# 任务
《${meta.title}》（${meta.author} 著）已经逐批读完，现在写完结篇：全书摘要与学习。标题已定为「阅读《${meta.title}》(完结)：全书摘要与学习」。

输入是你自己此前写的全部 ${articleNotes.length} 篇拆读笔记（不是原文），请基于笔记综合提炼。

# 此前的拆读笔记
${articleNotes.map((a) => `## ${a.title}\n\n${a.body}`).join("\n\n---\n\n")}

# 输出
只输出 description/tags 和正文。

${FINALE_STRUCTURE}

${OUTPUT_CONTRACT}`;
}

export function buildReviewPrompt(
	meta: BookMeta,
	round: number,
	articleNotes: { title: string; body: string }[],
	previousReviews: { title: string; body: string }[],
): string {
	return `${PERSONA}

# 任务
今天你决定回头回顾《${meta.title}》。这是第 ${round} 次回顾${round > 1 ? "（之前已经回顾过，注意写出认知的继续演化，不要重复上一次回顾的结论）" : ""}。标题已定为${round === 1 ? `「回顾《${meta.title}》」` : `「回顾《${meta.title}》(${toChineseNumber(round)})」`}。

# 输入
1. 当初逐批写的全部 ${articleNotes.length} 篇拆读笔记（含完结篇）
2. ${previousReviews.length > 0 ? `之前的 ${previousReviews.length} 次回顾` : "（这是第一次回顾）"}

# 当初的拆读笔记
${articleNotes.map((a) => `## ${a.title}\n\n${a.body}`).join("\n\n---\n\n")}

${previousReviews.length > 0 ? `# 之前的回顾\n\n${previousReviews.map((r) => `## ${r.title}\n\n${r.body}`).join("\n\n---\n\n")}` : ""}

# 输出
只输出 description/tags 和正文。用「现在回头看」的视角写——诚实面对当初理解不到位的地方。

${REVIEW_STRUCTURE}

${OUTPUT_CONTRACT}`;
}

/** 解析 AI 的两段式输出 */
export function parseClaudeOutput(
	raw: string,
): { description: string; tags: string[]; body: string } {
	const metaMatch = raw.match(
		/<<<META>>>\s*([\s\S]*?)\s*<<<BODY>>>\s*([\s\S]*)$/,
	);
	if (!metaMatch) {
		throw new Error("输出不符合 <<<META>>>/<<<BODY>>> 契约");
	}
	let meta: { description?: string; tags?: string[] };
	try {
		meta = JSON.parse(metaMatch[1]);
	} catch {
		throw new Error(`META 段不是合法 JSON：${metaMatch[1].slice(0, 200)}`);
	}
	const body = metaMatch[2].trim();
	if (body.length < 800) {
		throw new Error(`正文太短（${body.length} 字符），疑似截断`);
	}
	return {
		description: meta.description?.slice(0, 200) ?? "",
		tags: (meta.tags ?? []).slice(0, 8),
		body,
	};
}

/** 阿拉伯数字 → 中文序号（1→一，11→十一，21→二十一…） */
export function toChineseNumber(n: number): string {
	const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
	if (n <= 0) return String(n);
	if (n < 10) return digits[n];
	if (n < 20) return `十${n % 10 === 0 ? "" : digits[n % 10]}`;
	if (n < 100) {
		const tens = Math.floor(n / 10);
		const ones = n % 10;
		return `${digits[tens]}十${ones === 0 ? "" : digits[ones]}`;
	}
	return String(n);
}
