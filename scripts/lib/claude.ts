// claude --print headless 封装 — 重试 + 529 指数退避（逻辑移植自 mao_mao_chong_diary daily-research.sh）
import { spawn } from "node:child_process";

export interface ClaudeOptions {
	model?: string;
	/** 单次尝试超时（毫秒），整本书一批次生成可能较慢 */
	timeoutMs?: number;
}

const MAX_RETRIES = 5;

export async function runClaude(
	prompt: string,
	options: ClaudeOptions = {},
): Promise<string> {
	const { model = "sonnet", timeoutMs = 20 * 60 * 1000 } = options;

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		const result = await invokeOnce(prompt, model, timeoutMs);
		if (result.ok) return result.text;

		const isOverload = result.stderr.includes("529") || result.stderr.toLowerCase().includes("overloaded");
		console.error(`[claude] 第 ${attempt}/${MAX_RETRIES} 次失败: ${result.stderr.slice(0, 300)}`);
		if (attempt < MAX_RETRIES) {
			// 529 过载：指数退避 60→120→240→300s；其他错误短等 15s
			const waitSec = isOverload ? Math.min(60 * 2 ** (attempt - 1), 300) : 15;
			console.error(`[claude] ${waitSec}s 后重试…`);
			await sleep(waitSec * 1000);
		}
	}
	throw new Error(`claude --print 连续 ${MAX_RETRIES} 次失败`);
}

function invokeOnce(
	prompt: string,
	model: string,
	timeoutMs: number,
): Promise<{ ok: boolean; text: string; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(
			"claude",
			[
				"--print",
				"--output-format",
				"stream-json",
				"--verbose",
				"--model",
				model,
			],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);

		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			stderr += `\n[timeout] 超过 ${Math.round(timeoutMs / 60000)} 分钟被终止`;
		}, timeoutMs);

		child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
		child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
		child.on("error", (e) => {
			clearTimeout(timer);
			resolve({ ok: false, text: "", stderr: `spawn 失败：${e.message}（claude 不在 PATH？）` });
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code !== 0) {
				resolve({ ok: false, text: "", stderr: stderr || `exit ${code}` });
				return;
			}
			const text = extractResultText(stdout);
			if (!text.trim()) {
				resolve({ ok: false, text: "", stderr: `输出为空。stdout 前 500 字：${stdout.slice(0, 500)}` });
				return;
			}
			resolve({ ok: true, text, stderr });
		});

		// prompt 经 stdin 传入（与 daily-research.sh 一致）
		child.stdin.write(prompt);
		child.stdin.end();
	});
}

/** 从 stream-json 输出中取最后一条 assistant 消息的文本 */
function extractResultText(streamJson: string): string {
	const lines = streamJson.split("\n").filter((l) => l.trim());
	for (let i = lines.length - 1; i >= 0; i--) {
		try {
			const event = JSON.parse(lines[i]);
			if (event.type === "assistant" && Array.isArray(event.message?.content)) {
				const text = event.message.content
					.filter((c: { type: string }) => c.type === "text")
					.map((c: { text?: string }) => c.text ?? "")
					.join("\n");
				if (text.trim()) return text;
			}
			// 兜底：result 事件
			if (event.type === "result" && event.result) return event.result;
		} catch {
			// 跳过非 JSON 行
		}
	}
	return "";
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}
