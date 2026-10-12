/**
 * epub.ts — EPUB 文件解析工具
 *
 * 将 .epub 文件解析为纯文本，用于灵魂蒸馏和自动化脚本。
 * 依赖 jszip（浏览器和 Node.js 均可用）。
 *
 * EPUB 结构：
 *   mimetype
 *   META-INF/container.xml  → 指向 .opf 文件
 *   OEBPS/content.opf       → manifest + spine（阅读顺序）
 *   OEBPS/*.xhtml           → 实际内容（XHTML）
 */

import JSZip from "jszip";

export interface EpubTextResult {
  /** 提取的纯文本（各章节按 spine 顺序拼接） */
  text: string;
  /** 书名（从 metadata 提取，可能为空） */
  title?: string;
  /** 作者（从 metadata 提取，可能为空） */
  author?: string;
}

/**
 * 从 XHTML/XML 内容中提取纯文本。
 *
 * 处理：
 * - 移除所有标签
 * - 将 <br/>、</p>、</div>、</h1~6> 转为换行
 * - 解码常见 HTML 实体
 * - 压缩多余空行
 */
function xhtmlToText(xhtml: string): string {
  let html = xhtml;

  // 块级元素闭合标签 → 换行
  html = html.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|header|footer)>/gi, "\n");
  // <br> 和 <br/> → 换行
  html = html.replace(/<br\s*\/?>/gi, "\n");
  // 移除 <head>...</head>（包含 style/script/title）
  html = html.replace(/<head[\s\S]*?<\/head>/gi, "");
  // 移除 <style>...</style>
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  // 移除 <script>...</script>
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  // 移除所有剩余标签
  html = html.replace(/<[^>]+>/g, "");
  // 解码 HTML 实体
  html = html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  // 压缩连续空行为最多两个换行
  html = html.replace(/\n{3,}/g, "\n\n");
  // 去除每行首尾多余空格
  html = html
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
  return html.trim();
}

/**
 * 从 container.xml 中提取 OPF 文件路径。
 * container.xml 格式：
 *   <container>
 *     <rootfiles>
 *       <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
 *     </rootfiles>
 *   </container>
 */
function extractOpfPath(containerXml: string): string | null {
  const match = containerXml.match(/full-path="([^"]+\.opf)"/i);
  return match ? match[1] : null;
}

/**
 * 从 OPF 文件中提取 spine（阅读顺序）中的 manifest item href 列表。
 *
 * OPF 结构：
 *   <metadata>...</metadata>           → 书名、作者
 *   <manifest>
 *     <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
 *     ...
 *   </manifest>
 *   <spine>
 *     <itemref idref="ch1"/>
 *     <itemref idref="ch2"/>
 *   </spine>
 *
 * 返回按 spine 顺序排列的 href 列表。
 */
function extractSpineHrefs(opfContent: string): string[] {
  // 解析 manifest: id → href
  const manifest = new Map<string, string>();
  const itemRegex = /<item\s[^>]*?id="([^"]*)"[^>]*?href="([^"]*)"[^>]*?>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(opfContent)) !== null) {
    manifest.set(itemMatch[1], itemMatch[2]);
  }

  // 解析 spine: 按 idref 顺序
  const spineIds: string[] = [];
  const spineRegex = /<itemref\s[^>]*?idref="([^"]*)"[^>]*?>/gi;
  let spineMatch: RegExpExecArray | null;
  while ((spineMatch = spineRegex.exec(opfContent)) !== null) {
    spineIds.push(spineMatch[1]);
  }

  // 将 id 映射为 href
  const hrefs: string[] = [];
  for (const id of spineIds) {
    const href = manifest.get(id);
    if (href) hrefs.push(href);
  }

  // 如果 spine 为空，回退：取所有 XHTML item
  if (hrefs.length === 0) {
    for (const [, href] of manifest) {
      if (/\.x?html?$/i.test(href)) {
        hrefs.push(href);
      }
    }
  }

  return hrefs;
}

/**
 * 从 OPF metadata 中提取书名和作者。
 */
function extractMetadata(opfContent: string): { title?: string; author?: string } {
  const result: { title?: string; author?: string } = {};

  const titleMatch = opfContent.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  if (titleMatch) result.title = titleMatch[1].trim();

  const authorMatch = opfContent.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
  if (authorMatch) result.author = authorMatch[1].trim();

  return result;
}

/**
 * 解析 EPUB 二进制数据为纯文本。
 *
 * @param data — EPUB 文件的二进制数据（ArrayBuffer 或 Uint8Array）
 * @returns 解析结果（纯文本 + 可选的书名和作者）
 */
export async function parseEpubToText(data: ArrayBuffer | Uint8Array): Promise<EpubTextResult> {
  const zip = await JSZip.loadAsync(data);

  // 1. 读取 container.xml，找到 OPF 路径
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("无效的 EPUB 文件：缺少 META-INF/container.xml");
  }
  const containerXml = await containerFile.async("text");
  const opfPath = extractOpfPath(containerXml);
  if (!opfPath) {
    throw new Error("无效的 EPUB 文件：无法找到 OPF 文件路径");
  }

  // 2. 读取 OPF 文件
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`EPUB 文件错误：OPF 文件不存在 (${opfPath})`);
  }
  const opfContent = await opfFile.async("text");

  // 3. 提取 metadata
  const metadata = extractMetadata(opfContent);

  // 4. 提取 spine 中的章节 href（按阅读顺序）
  const spineHrefs = extractSpineHrefs(opfContent);
  if (spineHrefs.length === 0) {
    throw new Error("EPUB 文件错误：未找到任何内容文件");
  }

  // OPF 文件所在目录（用于解析相对路径）
  const opfDir = opfPath.includes("/") ? opfPath.replace(/\/[^/]*$/, "/") : "";

  // 5. 按 spine 顺序读取每个 XHTML 文件，提取文本
  const textParts: string[] = [];
  for (const href of spineHrefs) {
    // epub 可能对 href 做 URL encoding
    const decodedHref = decodeURIComponent(href);
    // 尝试相对路径和带 OPF 目录前缀的路径
    const possiblePaths = [
      opfDir + decodedHref,
      decodedHref,
    ];

    let xhtmlContent: string | null = null;
    for (const path of possiblePaths) {
      const file = zip.file(path);
      if (file) {
        xhtmlContent = await file.async("text");
        break;
      }
    }

    if (xhtmlContent) {
      const text = xhtmlToText(xhtmlContent);
      if (text) textParts.push(text);
    }
  }

  const fullText = textParts.join("\n\n");

  if (!fullText.trim()) {
    throw new Error("EPUB 文件解析后未提取到任何文本内容");
  }

  return {
    text: fullText,
    title: metadata.title,
    author: metadata.author,
  };
}
