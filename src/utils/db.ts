interface Ejaculation {
  id: number;
  user_id: number;
  time: string;
  material?: string;
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
      .prepare("SELECT COUNT(*) as count FROM ejaculations WHERE time >= ? AND time < ?")
      .bind(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`)
      .run();
    return (result.results[0] as { count: number }).count;
  }

  async getUserEjaculations(userId: number): Promise<Ejaculation[]> {
    const result = await this.db.prepare("SELECT * FROM ejaculations WHERE user_id = ? ORDER BY time DESC").bind(userId).run();
    return result.results as unknown as Ejaculation[];
  }

  async getEjaculationStats(
    userId: number,
    duration: number,
  ): Promise<{
    intervals: number[];
    avgInterval: number;
    medianInterval: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - duration);
    const cutoffTime = cutoffDate.toISOString();

    const records = await this.db.prepare("SELECT time FROM ejaculations WHERE user_id = ? AND time > ? ORDER BY time ASC").bind(userId, cutoffTime).run();

    const timestamps = records.results.map((r) => new Date(r.time as string).getTime());
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push((timestamps[i] - timestamps[i - 1]) / 1000); // 转换为秒
    }

    const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;

    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = intervals.length > 0 ? sortedIntervals[Math.floor(intervals.length / 2)] : 0;

    return { intervals, avgInterval, medianInterval };
  }

  async importEjaculations(userId: number, data: any): Promise<string> {
    if (!Array.isArray(data)) {
      return "导入失败：数据格式不正确";
    }

    try {
      for (const record of data) {
        await this.db.prepare("INSERT INTO ejaculations (user_id, timestamp, material) VALUES (?, ?, ?)").bind(userId, record.timestamp, record.material).run();
      }
    } catch (error) {
      return `导入失败：${error instanceof Error ? error.message : "未知错误"}`;
    }
    return "导入成功！";
  }
}

export { Database, type Ejaculation };
