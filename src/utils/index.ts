export function decodeUrlsInText(text: string | null | undefined): string {
  if (!text) return "";
  // 这个正则表达式用于匹配文本中的URL
  // 它找到以 http:// 或 https:// 开头，后面跟着非空白字符的部分
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  // 使用 replace 方法找到所有匹配的URL
  return text.replace(urlRegex, (url) => {
    try {
      // 步骤 1: 使用 decodeURIComponent 解码整个 URL。
      // 这会将所有合法的编码序列（包括 %20）都解码。
      // 例如：%20 会变成空格，%2F 会变成 /，%26 会变成 &，%E4%BD%A0 会变成 你
      let decodedUrl = decodeURIComponent(url);

      // 步骤 2: 将解码后 URL 中的所有空格 ' ' 替换回 '%20'。
      // 这是为了实现“保留 %20”的要求。
      // 注意：这里只替换由 %20 解码而来的空格。如果原始URL结构有问题包含文字空格，
      // 这个正则表达式 /(https?:\/\/[^\s]+)/g 应该已经排除了它们。
      // 如果需要处理其他可能的空白字符变成的 %20，可以在这里扩展替换。
      decodedUrl = decodedUrl.replace(/ /g, "%20");

      // 返回处理后的 URL
      return decodedUrl;
    } catch (e) {
      // 如果在解码过程中发生错误（例如，URL中含有不完整的编码序列），
      // 捕获异常并返回原始的 URL，不做任何修改。
      console.error("Failed to decode URL:", url, e); // 可选：打印错误信息
      return url;
    }
  });
}
