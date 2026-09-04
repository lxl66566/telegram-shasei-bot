import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Database, type ImportData } from "./db";
import { createD1 } from "../test-helpers/d1";

const NOW = new Date("2026-01-15T10:00:00.000Z");

let db: Database;

beforeEach(() => {
  db = new Database(createD1());
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** 以导入的方式写入任意时间的记录（绕过 recordEjaculation 的当前时间） */
async function seed(userId: number, records: { time: string; material?: string }[]) {
  await db.importEjaculations(userId, records as unknown as ImportData[]);
}

describe("recordEjaculation", () => {
  it("返回自增 id，未提供小菜时存为 null", async () => {
    expect(await db.recordEjaculation(1, "m")).toBe(1);
    expect(await db.recordEjaculation(1)).toBe(2);

    const rows = await db.getUserEjaculations(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 2, time: NOW.toISOString(), material: null });
  });
});

describe("getUserEjaculations", () => {
  it("按用户过滤并按时间倒序返回", async () => {
    await seed(1, [{ time: "2026-01-01T00:00:00.000Z", material: "a" }]);
    await seed(2, [{ time: "2026-01-10T00:00:00.000Z", material: "b" }]);
    await seed(1, [{ time: "2026-01-05T00:00:00.000Z" }]);

    const rows = await db.getUserEjaculations(1);
    expect(rows.map((r) => r.time)).toEqual(["2026-01-05T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]);
  });
});

describe("getTodayCount", () => {
  it("统计当天（UTC）去重后的用户数，不含昨天的记录", async () => {
    await db.recordEjaculation(1); // 今天
    await db.recordEjaculation(2, "x"); // 今天
    await db.recordEjaculation(1); // 今天，同一用户重复
    await seed(3, [{ time: "2026-01-14T23:59:59.999Z" }]); // 昨天

    expect(await db.getTodayCount()).toBe(2);
  });
});

describe("getEjaculationStats", () => {
  it("只返回时间范围内的记录，按时间升序并携带小菜", async () => {
    await seed(1, [
      { time: "2025-12-01T00:00:00.000Z", material: "太早" }, // 30 天范围之外
      { time: "2025-12-16T10:00:00.000Z", material: "恰好等于 cutoff" }, // cutoff 为严格大于，应排除
      { time: "2026-01-10T08:00:00.000Z", material: "m1" },
      { time: "2026-01-15T09:00:00.000Z" },
    ]);

    const stats = await db.getEjaculationStats(1, 30 * 24 * 3600);
    expect(stats.data!.map((r) => r.time)).toEqual(["2026-01-10T08:00:00.000Z", "2026-01-15T09:00:00.000Z"]);
    expect(stats.data![0].material).toBe("m1");
  });

  it("按用户隔离数据", async () => {
    await seed(1, [{ time: "2026-01-15T09:00:00.000Z" }]);
    await seed(2, [{ time: "2026-01-15T09:30:00.000Z" }]);

    const stats = await db.getEjaculationStats(1, 30 * 24 * 3600);
    expect(stats.data).toHaveLength(1);
  });
});

describe("importEjaculations", () => {
  it("拒绝非数组数据", async () => {
    expect(await db.importEjaculations(1, {} as unknown as ImportData[])).toBe("导入失败：数据格式不是数组");
    expect(await db.importEjaculations(1, null as unknown as ImportData[])).toBe("导入失败：数据格式不是数组");
  });

  it("批量写入并返回成功信息", async () => {
    const records = [
      { time: "2026-01-01T00:00:00.000Z", material: "a" },
      { time: "2026-01-02T00:00:00.000Z" },
      { time: "2026-01-03T00:00:00.000Z" },
    ];
    expect(await db.importEjaculations(7, records as unknown as ImportData[])).toBe("3 条数据导入成功");
    expect(await db.getUserEjaculations(7)).toHaveLength(3);
  });
});

describe("getRandomNMaterial", () => {
  it("从所有用户非空小菜中随机取 n 条，不重复", async () => {
    await seed(1, [
      { time: "2026-01-01T00:00:00.000Z", material: "a" },
      { time: "2026-01-02T00:00:00.000Z", material: "b" },
      { time: "2026-01-03T00:00:00.000Z" }, // material 为 null，不参与
    ]);
    await seed(2, [{ time: "2026-01-04T00:00:00.000Z", material: "c" }]);

    const pool = ["a", "b", "c"];
    const picked = (await db.getRandomNMaterial(2))!;
    expect(picked).toHaveLength(2);
    expect(new Set(picked).size).toBe(2);
    for (const m of picked) expect(pool).toContain(m);

    expect(await db.getRandomNMaterial(10)).toHaveLength(3); // 不足 n 时全部返回
  });

  it("没有任何小菜时返回 null", async () => {
    await seed(1, [{ time: "2026-01-01T00:00:00.000Z" }]);
    expect(await db.getRandomNMaterial(1)).toBeNull();
  });
});

describe("withdrawEjaculation", () => {
  it("只删除该用户最近的一条记录", async () => {
    await seed(1, [
      { time: "2026-01-01T00:00:00.000Z" },
      { time: "2026-01-02T00:00:00.000Z" },
    ]);
    await seed(2, [{ time: "2026-01-03T00:00:00.000Z" }]);

    await db.withdrawEjaculation(1);

    expect((await db.getUserEjaculations(1)).map((r) => r.time)).toEqual(["2026-01-01T00:00:00.000Z"]);
    expect(await db.getUserEjaculations(2)).toHaveLength(1);
  });

  it("用户没有记录时不抛错", async () => {
    await expect(db.withdrawEjaculation(999)).resolves.toBeUndefined();
  });
});

describe("modifyLastEjaculationTime", () => {
  it("把最近一条记录的时间偏移指定毫秒数并持久化", async () => {
    await seed(1, [
      { time: "2026-01-14T00:00:00.000Z" },
      { time: "2026-01-15T08:00:00.000Z" },
    ]);

    const result = await db.modifyLastEjaculationTime(1, 3600_000); // +1h
    expect(result.success).toBe(true);
    expect(result.oldTime!.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(result.newTime!.toISOString()).toBe("2026-01-15T09:00:00.000Z");

    const rows = await db.getUserEjaculations(1);
    expect(rows[0].time).toBe("2026-01-15T09:00:00.000Z"); // 倒序第一条即被修改的记录
    expect(rows[1].time).toBe("2026-01-14T00:00:00.000Z"); // 其他记录不受影响
  });

  it("支持负偏移", async () => {
    await seed(1, [{ time: "2026-01-15T08:00:00.000Z" }]);
    const result = await db.modifyLastEjaculationTime(1, -7200_000); // -2h
    expect(result.newTime!.toISOString()).toBe("2026-01-15T06:00:00.000Z");
  });

  it("没有记录时返回 success: false", async () => {
    const result = await db.modifyLastEjaculationTime(999, 1000);
    expect(result).toEqual({ success: false });
  });
});
