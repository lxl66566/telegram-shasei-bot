import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import worker from "./index";
import { Database } from "./utils/db";
import { createD1 } from "./test-helpers/d1";
import { stubFetch, sentTexts, unescape, tgMessage } from "./test-helpers/telegram";

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = stubFetch();
  vi.useFakeTimers({ now: new Date("2026-01-15T10:00:00.000Z"), toFake: ["Date"] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function makeEnv() {
  return { DB: createD1() as unknown as D1Database, TELEGRAM_BOT_TOKEN: "TOKEN" };
}

function postUpdate(body: unknown): Request {
  return new Request("https://worker/", { method: "POST", body: JSON.stringify(body) });
}

describe("路由", () => {
  it("/biu 命令落库并回复", async () => {
    const env = makeEnv();

    const res = await worker.fetch(postUpdate({ update_id: 1, message: tgMessage("/biu 小菜") }), env, {} as ExecutionContext);

    expect(await res.text()).toBe("OK");
    const db = new Database(env.DB);
    const rows = await db.getUserEjaculations(42);
    expect(rows).toHaveLength(1);
    expect(rows[0].material).toBe("小菜");
    expect(unescape(sentTexts(fetchMock).join("\n"))).toContain("biu!");
  });

  it("未知命令与无文本消息不产生副作用", async () => {
    const env = makeEnv();

    await worker.fetch(postUpdate({ update_id: 1, message: tgMessage("/未知命令") }), env, {} as ExecutionContext);
    await worker.fetch(postUpdate({ update_id: 2, message: tgMessage() }), env, {} as ExecutionContext);
    await worker.fetch(postUpdate({ update_id: 3 }), env, {} as ExecutionContext);
    await worker.fetch(new Request("https://worker/"), env, {} as ExecutionContext); // 非 POST

    const db = new Database(env.DB);
    expect(await db.getUserEjaculations(42)).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
