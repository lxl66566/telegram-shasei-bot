import { describe, it, expect } from "vitest";
import { decodeUrlsInText } from ".";

describe("decodeUrlsInText", () => {
  it("应该正确解码 URL 中的特殊字符，但保留 %20", () => {
    const input = "https://example.com/%E4%BD%A0%E5%A5%BD%20world";
    const expected = "https://example.com/你好%20world";
    expect(decodeUrlsInText(input)).toBe(expected);
  });

  it("应该处理文本中的多个 URL", () => {
    const input = "看这个 https://a.com/%E7%8C%AB 和这个 https://b.com/%E7%8B%97";
    const expected = "看这个 https://a.com/猫 和这个 https://b.com/狗";
    expect(decodeUrlsInText(input)).toBe(expected);
  });

  it("应该保持非 URL 文本不变", () => {
    const input = "普通文本 没有URL";
    expect(decodeUrlsInText(input)).toBe(input);
  });

  it("应该处理无效的 URL 编码", () => {
    const input = "https://example.com/%invalid";
    expect(decodeUrlsInText(input)).toBe(input);
  });
});
