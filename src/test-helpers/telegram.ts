import { vi, type Mock } from "vitest";

/**
 * 用桩替换全局 fetch。
 * handler 通过 fetch 调用 Telegram API；可选的 route 参数用于拦截其他 URL（如 /import 的数据源）。
 */
export function stubFetch(route?: (url: string) => Response | undefined): Mock {
  const fetchMock = vi.fn(async (input: unknown, _init?: unknown): Promise<Response> => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const routed = route?.(url);
    if (routed) return routed;
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** 提取所有发往 sendMessage 的消息文本 */
export function sentTexts(fetchMock: Mock): string[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes("/sendMessage"))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string).text as string);
}

/** 去掉 MarkdownV2 转义反斜杠，便于对消息文本做断言 */
export function unescape(text: string): string {
  return text.replace(/\\/g, "");
}

/** 构造最小可用的 Telegram 消息对象 */
export function tgMessage(text?: string, userId = 42, chatId = 99) {
  return { message_id: 1, from: { id: userId }, chat: { id: chatId }, text } as never;
}
