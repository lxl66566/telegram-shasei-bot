import { describe, it, expect } from "vitest";
import { createChart } from "./chart";

const sample = [{ time: "2026-01-01T00:00:00.000Z", material: "普通" }, { time: "2026-01-02T00:00:00.000Z" }];

/** 从导出的 html 中提取嵌入的数据 payload（一段带引号的 JS 字符串字面量） */
function extractPayload(html: string): string {
  const match = html.match(/const mappedData = JSON\.parse\((".*")\)/);
  expect(match).not.toBeNull();
  return match![1];
}

describe("createChart", () => {
  it("包含两个图表容器", () => {
    const html = createChart(sample);
    expect(html).toContain('<div id="scatter-container"></div>');
    expect(html).toContain('<div id="container"></div>');
  });

  it("回归：间隔统计不应被二次换算成 0.00 小时", () => {
    const html = createChart(sample);
    expect(html).not.toContain("/ 1000 / 60 / 60");
    expect(html).toContain("intervalStats.avgInterval.toFixed(2)");
  });

  it("嵌入的数据可以完整还原", () => {
    const html = createChart(sample);
    const restored = JSON.parse(JSON.parse(extractPayload(html)));
    expect(restored).toEqual(sample);
  });

  it("数据中的反引号、模板插值和 </script> 不会破坏脚本", () => {
    const nasty = [{ time: "2026-01-01T00:00:00.000Z", material: '`模板${注入}</script>"引号"\\反斜杠' }];
    const html = createChart(nasty);

    const payload = extractPayload(html);
    // payload 是双引号字符串字面量且所有 < 都被转义，不会截断 <script> 标签
    expect(payload).not.toContain("<");

    const restored = JSON.parse(JSON.parse(payload));
    expect(restored).toEqual(nasty);
  });
});
