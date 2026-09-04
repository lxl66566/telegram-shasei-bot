// 为测试辅助代码声明用到的 Node 内置模块的最小接口（生产代码运行在 Workers 环境，不引用它们）
declare module "node:sqlite" {
  export class StatementSync {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}

declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: string): string;
}

interface ImportMeta {
  url: string;
}

