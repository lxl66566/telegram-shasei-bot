import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { CommandHandler } from "./handler";
import type { Database } from "./utils/db";
import { stubFetch, sentTexts, unescape, tgMessage } from "./test-helpers/telegram";

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = stubFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** 构造带默认实现的 Database 桩，可按需覆盖个别方法 */
function makeDb(overrides: Record<string, unknown> = {}): Database {
  const defaults = {
    recordEjaculation: vi.fn().mockResolvedValue(1),
    getTodayCount: vi.fn().mockResolvedValue(1),
    getUserEjaculations: vi.fn().mockResolvedValue([]),
    getEjaculationStats: vi.fn().mockResolvedValue({ data: [] }),
    importEjaculations: vi.fn().mockResolvedValue("0 条数据导入成功"),
    getRandomNMaterial: vi.fn().mockResolvedValue(["m1"]),
    withdrawEjaculation: vi.fn().mockResolvedValue(undefined),
    modifyLastEjaculationTime: vi.fn().mockResolvedValue({ success: false }),
  };
  return { ...defaults, ...overrides } as unknown as Database;
}

/** 汇总本次测试发出的所有消息文本（已去除 MarkdownV2 转义） */
function allSentText(): string {
  return unescape(sentTexts(fetchMock).join("\n"));
}

describe("handleBiu", () => {
  it("解码 URL 后记录小菜并回复排名", async () => {
    const db = makeDb();
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleBiu(tgMessage("/biu https://e.com/%E4%BD%A0%E5%A5%BD%20world"));

    expect(db.recordEjaculation).toHaveBeenCalledWith(42, "https://e.com/你好%20world");
    const text = allSentText();
    expect(text).toContain("biu!");
    expect(text).toContain("第 1 个射精的人");
    expect(text).toContain("使用小菜");
    expect(text).toContain("https://e.com/你好%20world"); // telegramify 会把 URL 转成 [url](url) 链接
  });

  it("不带参数时不记录小菜", async () => {
    const db = makeDb();
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleBiu(tgMessage("/biu"));

    expect(db.recordEjaculation).toHaveBeenCalledWith(42, undefined);
    expect(allSentText()).not.toContain("使用小菜");
  });
});

describe("handleAnalysis", () => {
  it("缺少参数时提示用法", async () => {
    const db = makeDb();
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleAnalysis(tgMessage("/analysis"));

    expect(db.getEjaculationStats).not.toHaveBeenCalled();
    expect(allSentText()).toContain("请输入分析时间范围");
  });

  it("解析 timespan 后查询数据并发送 html 文件", async () => {
    const db = makeDb({
      getEjaculationStats: vi.fn().mockResolvedValue({ data: [{ time: "2026-01-01T00:00:00.000Z", material: "m" }] }),
    });
    const handler = new CommandHandler(db, "TOKEN");
    const sendTextFile = vi.spyOn(handler, "sendTextFile");

    await handler.handleAnalysis(tgMessage("/analysis 30d"));

    expect(db.getEjaculationStats).toHaveBeenCalledWith(42, 30 * 24 * 3600);
    expect(sendTextFile).toHaveBeenCalledWith(99, "analysis.html", expect.stringContaining("container"));
  });

  it("没有数据时提示而不发送文件", async () => {
    const db = makeDb({
      getEjaculationStats: vi.fn().mockResolvedValue({ data: undefined }),
    });
    const handler = new CommandHandler(db, "TOKEN");
    const sendTextFile = vi.spyOn(handler, "sendTextFile");

    await handler.handleAnalysis(tgMessage("/analysis 30d"));

    expect(allSentText()).toContain("没有足够的数据来生成统计图表");
    expect(sendTextFile).not.toHaveBeenCalled();
  });
});

describe("handleExport", () => {
  it("导出该会话的数据为 json 文件", async () => {
    const db = makeDb({
      getUserEjaculations: vi.fn().mockResolvedValue([{ id: 1, time: "2026-01-01T00:00:00.000Z", material: "m" }]),
    });
    const handler = new CommandHandler(db, "TOKEN");
    const sendTextFile = vi.spyOn(handler, "sendTextFile");

    await handler.handleExport(tgMessage("/export"));

    expect(db.getUserEjaculations).toHaveBeenCalledWith(99);
    expect(sendTextFile).toHaveBeenCalledWith(99, "data.json", expect.stringContaining("2026-01-01T00:00:00.000Z"));
  });
});

describe("handleImport", () => {
  it("从 URL 拉取 json 并导入", async () => {
    const data = [{ time: "2026-01-01T00:00:00.000Z" }];
    fetchMock = stubFetch((url) => (url === "https://x/d.json" ? new Response(JSON.stringify(data)) : undefined));
    const db = makeDb({
      importEjaculations: vi.fn().mockResolvedValue("1 条数据导入成功"),
    });
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleImport(tgMessage("/import https://x/d.json"));

    expect(db.importEjaculations).toHaveBeenCalledWith(99, data);
    expect(allSentText()).toContain("1 条数据导入成功");
  });

  it("缺少 URL 时提示格式错误", async () => {
    const handler = new CommandHandler(makeDb(), "TOKEN");

    await handler.handleImport(tgMessage("/import"));

    // handler 以 "导入失败：" + err 拼接消息，err 字符串化后带 "Error: " 前缀
    const text = allSentText();
    expect(text).toContain("导入失败");
    expect(text).toContain("请输入导入数据");
  });

  it("拉取失败时提示导入失败", async () => {
    fetchMock = stubFetch(() => {
      throw new Error("network down");
    });
    const db = makeDb();
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleImport(tgMessage("/import https://x/d.json"));

    expect(db.importEjaculations).not.toHaveBeenCalled();
    const text = allSentText();
    expect(text).toContain("导入失败");
    expect(text).toContain("network down");
  });
});

describe("handleOkazu", () => {
  it("按参数数量随机获取小菜", async () => {
    const db = makeDb({
      getRandomNMaterial: vi.fn().mockResolvedValue(["小菜一", "小菜二"]),
    });
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleOkazu(tgMessage("/okazu 2"));

    expect(db.getRandomNMaterial).toHaveBeenCalledWith(2);
    const text = allSentText();
    expect(text).toContain("小菜一");
    expect(text).toContain("小菜二");
  });

  it("不带参数时默认获取 1 条", async () => {
    const db = makeDb();
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleOkazu(tgMessage("/okazu"));

    expect(db.getRandomNMaterial).toHaveBeenCalledWith(1);
  });

  it("没有可用小菜时提示错误", async () => {
    const db = makeDb({
      getRandomNMaterial: vi.fn().mockResolvedValue(null),
    });
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleOkazu(tgMessage("/okazu"));

    expect(allSentText()).toContain("没有找到小菜");
  });
});

describe("handleWithdraw", () => {
  it("撤回该用户最近一条记录", async () => {
    const db = makeDb();
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleWithdraw(tgMessage("/withdraw"));

    expect(db.withdrawEjaculation).toHaveBeenCalledWith(42);
    expect(allSentText()).toContain("撤回");
  });
});

describe("handleModifyLastTime", () => {
  it("缺少参数时提示用法", async () => {
    const db = makeDb();
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleModifyLastTime(tgMessage("/modifylasttime"));

    expect(db.modifyLastEjaculationTime).not.toHaveBeenCalled();
    expect(allSentText()).toContain("请提供时间调整量");
  });

  it("解析偏移量并回复修改前后的时间", async () => {
    const db = makeDb({
      modifyLastEjaculationTime: vi.fn().mockResolvedValue({
        success: true,
        oldTime: new Date("2026-01-15T08:00:00.000Z"),
        newTime: new Date("2026-01-16T08:00:00.000Z"),
      }),
    });
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleModifyLastTime(tgMessage("/modifylasttime +1d"));

    expect(db.modifyLastEjaculationTime).toHaveBeenCalledWith(42, 24 * 3600 * 1000);
    expect(allSentText()).toContain("修改成功：2026-01-15T08:00:00.000Z -> 2026-01-16T08:00:00.000Z");
  });

  it("没有可修改的记录时提示", async () => {
    const db = makeDb();
    const handler = new CommandHandler(db, "TOKEN");

    await handler.handleModifyLastTime(tgMessage("/modifylasttime -2h"));

    expect(allSentText()).toContain("没有找到可以修改的记录");
  });
});
