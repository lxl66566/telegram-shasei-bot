import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";

const schema = readFileSync(new URL("../../schema.sql", import.meta.url), "utf-8");

/** 与 D1PreparedStatement 对应的已绑定参数的语句 */
class D1Statement {
  constructor(private stmt: StatementSync, private params: unknown[] = []) {}

  bind(...args: unknown[]): D1Statement {
    return new D1Statement(this.stmt, args);
  }

  async run(): Promise<{ results: unknown[] }> {
    return { results: this.stmt.all(...this.params) };
  }

  async first<T>(): Promise<T | null> {
    return ((this.stmt.get(...this.params) as T | undefined) ?? null);
  }
}

/**
 * 构造一个行为接近 Cloudflare D1 的内存数据库（底层 node:sqlite），
 * 实现 db.ts 用到的 prepare/bind/run/first/batch 接口，按项目 schema.sql 初始化。
 */
export function createD1(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);

  const d1 = {
    prepare: (sql: string) => new D1Statement(sqlite.prepare(sql)),
    async batch(statements: D1Statement[]) {
      const results: unknown[] = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
  };
  return d1 as unknown as D1Database;
}
