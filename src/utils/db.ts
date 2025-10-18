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

interface EjaculationStatsItemType {
  time: string;
  material?: string;
}

class Database {
  constructor(private db: D1Database) {}

  async recordEjaculation(userId: number, material?: string): Promise<number> {
    const time = new Date().toISOString();
    const result = await this.db
      .prepare("INSERT INTO ejaculations (user_id, time, material) VALUES (?, ?, ?) RETURNING id")
      .bind(userId, time, material ?? null)
      .run();
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
    const result = await this.db.prepare("SELECT id, time, material FROM ejaculations WHERE user_id = ? ORDER BY time DESC").bind(userId).run();
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
    data?: EjaculationStatsItemType[];
  }> {
    const cutoffTime = new Date();
    cutoffTime.setSeconds(cutoffTime.getSeconds() - duration);

    const records = await this.db
      .prepare("SELECT time, material FROM ejaculations WHERE user_id = ? AND time > ? ORDER BY time ASC")
      .bind(userId, cutoffTime.toISOString())
      .run();

    return { data: records.results.map((r) => ({ time: r.time as string, material: r.material as string | undefined })) };
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

  async getRandomNMaterial(n: number): Promise<string[] | null> {
    // 直接随机选择一行，无需先 COUNT
    const result = await this.db.prepare("SELECT material FROM ejaculations WHERE material IS NOT NULL ORDER BY RANDOM() LIMIT ?").bind(n).run();
    // 检查是否真的有结果返回（以防万一表完全为空或只有 null material）
    if (result.results && result.results.length > 0) {
      return result.results.map((r) => (r as { material: string }).material);
    } else {
      return null;
    }
  }

  async withdrawEjaculation(userId: number): Promise<void> {
    await this.db.prepare("DELETE FROM ejaculations WHERE id = (SELECT id FROM ejaculations WHERE user_id = ? ORDER BY time DESC LIMIT 1)").bind(userId).run();
  }

  async modifyLastEjaculationTime(userId: number, timeOffsetInMillis: number): Promise<{ success: boolean; oldTime?: Date; newTime?: Date }> {
    const lastRecord = await this.db
      .prepare("SELECT id, time FROM ejaculations WHERE user_id = ? ORDER BY time DESC LIMIT 1")
      .bind(userId)
      .first<{ id: number; time: string }>();

    if (!lastRecord) {
      return { success: false };
    }

    // 计算新的时间
    const originalTime = new Date(lastRecord.time);
    const newTime = new Date(originalTime.getTime() + timeOffsetInMillis);
    const newTimeISO = newTime.toISOString();

    // 4. 更新数据库中的记录
    await this.db.prepare("UPDATE ejaculations SET time = ? WHERE id = ?").bind(newTimeISO, lastRecord.id).run();

    return { success: true, oldTime: originalTime, newTime };
  }
}

export { Database, type Ejaculation, type ImportData, type EjaculationStatsItemType as EjaculationStatsType };
