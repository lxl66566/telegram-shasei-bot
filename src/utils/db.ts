import { median, mean } from "simple-statistics";

interface Ejaculation {
  id: number;
  user_id: number;
  time: string;
  material?: string;
}

interface ImportData {
  time: Date;
  material?: string;
}

interface EjaculationStatsType {
  intervals: number[];
  when: Date[];
  avgInterval: number;
  medianInterval: number;
}

class Database {
  constructor(private db: D1Database) {}

  async recordEjaculation(userId: number, material?: string): Promise<number> {
    const time = new Date().toISOString();
    const result = await this.db.prepare("INSERT INTO ejaculations (user_id, time, material) VALUES (?, ?, ?) RETURNING id").bind(userId, time, material).run();
    return (result.results[0] as { id: number }).id;
  }

  async getTodayCount(): Promise<number> {
    const date = new Date().toISOString().substring(0, 10); // 获取 YYYY-MM-DD 部分
    const result = await this.db
      .prepare("SELECT COUNT(DISTINCT user_id) as count FROM ejaculations WHERE time >= ? AND time < ?")
      .bind(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`)
      .run();
    return (result.results[0] as { count: number }).count;
  }

  async getUserEjaculations(userId: number): Promise<Ejaculation[]> {
    const result = await this.db.prepare("SELECT * FROM ejaculations WHERE user_id = ? ORDER BY time DESC").bind(userId).run();
    return result.results as unknown as Ejaculation[];
  }

  /**
   * 获取用户的射精统计数据。
   * @param userId 用户ID
   * @param duration 从当前时间往前推的时间范围，单位为秒
   * @returns 射精统计数据，data.when 为射精时间，data.intervals 为在某时间距离上次的射精间隔（单位：天）。
   * 统计数据包含平均间隔、中位数间隔。
   * 统计数据从第二次射精开始计算。如果用户射精次数小于 2 次，则返回 undefined。
   */
  async getEjaculationStats(
    userId: number,
    duration: number,
  ): Promise<{
    data?: EjaculationStatsType;
  }> {
    const cutoffTime = new Date();
    cutoffTime.setSeconds(cutoffTime.getSeconds() - duration);

    const records = await this.db
      .prepare("SELECT time FROM ejaculations WHERE user_id = ? AND time > ? ORDER BY time ASC")
      .bind(userId, cutoffTime.toISOString())
      .run();

    const dates = records.results.map((r) => new Date(r.time as string));
    if (dates.length < 2) {
      return { data: undefined };
    }
    const intervals_days = [];
    for (let i = 1; i < dates.length; i++) {
      intervals_days.push((dates[i].getTime() - dates[i - 1].getTime()) / 1000 / 60 / 60 / 24);
    }

    const avgInterval = mean(intervals_days);
    const medianInterval = median(intervals_days);

    return { data: { intervals: intervals_days, when: dates.slice(1), avgInterval, medianInterval } };
  }

  async importEjaculations(userId: number, data: ImportData[]): Promise<string> {
    if (!Array.isArray(data)) {
      return "导入失败：数据格式不是数组";
    }

    console.log("imported data example", data.slice(0, 10));

    try {
      const p = this.db.prepare("INSERT INTO ejaculations (user_id, time, material) VALUES (?, ?, ?)");
      await this.db.batch(data.map((record) => p.bind(userId, record.time, record.material ?? null)));
      console.log("imported data success, length: ", data.length);
      return `${data.length} 条数据导入成功`;
    } catch (error) {
      return `导入失败：${error instanceof Error ? error.message : "未知错误"}`;
    }
  }

  async getRandomMaterial(): Promise<string | null> {
    const result_count = await this.db.prepare("SELECT COUNT(*) AS count FROM ejaculations WHERE material IS NOT NULL;").run();
    const count = (result_count.results[0] as { count: number }).count;
    if (count === 0) {
      return null;
    }
    const randomBuffer = new Uint32Array(1);
    crypto.getRandomValues(randomBuffer);
    const randomIndex = randomBuffer[0] % count;
    const result = await this.db.prepare("SELECT material FROM ejaculations WHERE material IS NOT NULL LIMIT 1 OFFSET ?").bind(randomIndex).run();
    return (result.results[0] as { material: string }).material;
  }

  async withdrawEjaculation(userId: number): Promise<void> {
    await this.db.prepare("DELETE FROM ejaculations WHERE id = (SELECT id FROM ejaculations WHERE user_id = ? ORDER BY time DESC LIMIT 1)").bind(userId).run();
  }
}

export { Database, type Ejaculation, type ImportData, type EjaculationStatsType };
