import { TelegramMessage as Message } from "@codebam/cf-workers-telegram-bot";
import { Database, ImportData } from "./utils/db";
import telegramifyMarkdown from "telegramify-markdown";
import timespanParser from "timespan-parser";

export class CommandHandler {
  constructor(private db: Database, private token: string) {}

  async sendMessage(chatId: number, text: string, options?: Record<string, any>) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: telegramifyMarkdown(text, "escape"),
          parse_mode: options?.parse_mode || "MarkdownV2",
          ...options,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error: ${response.status} - ${errorText}`);
      }

      return response;
    } catch (error) {
      console.error("Fetch error:", error);
    }
  }

  async sendTextFile(chatId: number, filename: string, fileContent: string) {
    try {
      const formData = new FormData();
      formData.append("document", new Blob([fileContent], { type: "text/plain" }), filename);
      formData.append("chat_id", chatId.toString());
      return await fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, {
        method: "POST",
        body: formData,
      });
    } catch (error) {
      console.error("Fetch error:", error);
    }
  }

  async sendJsonDocument(chatId: number, data: any) {
    return await this.sendTextFile(chatId, "data.json", JSON.stringify(data, null, 2));
  }

  async getFile(fileId: string): Promise<Response> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/getFile?file_id=${fileId}`, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = (await response.json()) as { ok: boolean; result: { file_path: string }; error_code?: string; description?: string };
    if (!data.ok) {
      throw new Error(`Failed to get file: ${data.error_code} - ${data.description}`);
    }
    console.log(data.result.file_path);
    return await fetch(`https://api.telegram.org/file/bot${this.token}/${data.result.file_path}`);
  }

  async handleStart(message: Message): Promise<void> {
    const userId = message.from?.id;
    if (!userId) return;
    const helpText = `Shasei Bot, [source code](https://github.com/lxl66566/telegram-shasei-bot)

- /biu - 射精！
- /biu <material> - 射精！并记录使用的小菜
- /analysis <duration> - 分析射精频率，并导出为图片
- /start - 查看帮助信息
- /export - 导出数据
- 发送一个 json 文件 - 导入数据。json 的格式必须为 \`{ time: Date; material?: string; }[]\``;
    await this.sendMessage(message.chat.id, helpText, { disable_web_page_preview: true });
  }

  async handleBiu(message: Message): Promise<void> {
    const userId = message.from.id;
    const args = message.text?.split(" ").slice(1).join(" ").trim();
    await this.db.recordEjaculation(userId, args);

    const todayCount = await this.db.getTodayCount();
    let response = `🎉 射精成功！你是今天第 ${todayCount} 个射精的人！`;
    if (args) {
      response += `\n使用小菜：${args}`;
    }
    await this.sendMessage(message.chat.id, response);
  }

  async handleAnalysis(message: Message): Promise<void> {
    const userId = message.from.id;
    const chatId = message.chat.id;
    const args = message.text?.split(" ").slice(1).join(" ").trim();
    if (!args) {
      await this.sendMessage(chatId, "请输入分析时间范围，遵循 systemd timespan 格式，例如：/analysis 30d");
      return;
    }
    const duration = timespanParser.parse(args);
    const stats = await this.db.getEjaculationStats(userId, duration);

    // SVG 尺寸和边距设置
    const width = 800;
    const height = 400;
    const margin = { top: 40, right: 30, bottom: 50, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // 计算比例尺
    const xScale = (index: number) => margin.left + (index * chartWidth) / Math.max(stats.intervals.length - 1, 1);

    const maxY = Math.max(...stats.intervals.map((i) => i / 3600), 1);
    const yScale = (value: number) => margin.top + chartHeight - (chartHeight * (value / 3600)) / maxY;

    // 生成 X 轴刻度
    const xTicks = Array.from({ length: Math.min(10, stats.intervals.length) }, (_, i) => {
      const step = (stats.intervals.length - 1) / Math.min(9, stats.intervals.length - 1);
      const index = Math.round(i * step);
      const x = xScale(index);
      return `
        <line x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 5}" stroke="#ccc" />
        <text x="${x}" y="${height - margin.bottom + 20}" text-anchor="middle">#${index + 1}</text>
      `;
    }).join("");

    // 生成 Y 轴刻度
    const yTicks = Array.from({ length: 6 }, (_, i) => {
      const value = (maxY * i) / 5;
      const y = yScale(value);
      return `
        <line x1="${margin.left - 5}" y1="${y}" x2="${margin.left}" y2="${y}" stroke="#ccc" />
        <text x="${margin.left - 10}" y="${y}" text-anchor="end" dominant-baseline="middle">${value.toFixed(1)}h</text>
      `;
    }).join("");

    // 生成折线路径
    const points = stats.intervals
      .map((interval, index) => {
        const x = xScale(index);
        const y = yScale(interval);
        return `${x},${y}`;
      })
      .join(" ");

    const avgHours = stats.avgInterval / 3600;
    const medianHours = stats.medianInterval / 3600;

    // 创建 SVG
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          text { font-family: Arial; font-size: 12px; }
          .title { font-size: 16px; font-weight: bold; }
          .axis { stroke: #ccc; }
          .data-line { fill: none; stroke: rgb(75, 192, 192); stroke-width: 2; }
        </style>
        
        <!-- 标题 -->
        <text x="${width / 2}" y="25" text-anchor="middle" class="title">
          过去 ${duration} 天的射精间隔分析
        </text>

        <!-- 坐标轴 -->
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" class="axis"/>
        <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" class="axis"/>
        
        <!-- 坐标轴刻度 -->
        ${xTicks}
        ${yTicks}
        
        <!-- 数据线 -->
        <polyline points="${points}" class="data-line"/>
        
        <!-- 统计信息 -->
        <text x="10" y="${height - 20}">平均间隔: ${avgHours.toFixed(1)} 小时</text>
        <text x="200" y="${height - 20}">中位间隔: ${medianHours.toFixed(1)} 小时</text>
        <text x="350" y="${height - 20}">射精次数: ${stats.intervals.length + 1} 次</text>
      </svg>
    `;

    await this.sendTextFile(chatId, "analysis.svg", svg);
  }

  async handleExport(message: Message): Promise<void> {
    const chatId = message.chat.id;
    const data = await this.db.getUserEjaculations(chatId);
    await this.sendJsonDocument(chatId, data);
  }

  async handleImport(message: Message): Promise<void> {
    try {
      if (!message.document) {
        await this.sendMessage(message.chat.id, "如果想要导入数据，请发送一个 JSON 文件");
        return;
      }
      console.log(message.document);

      // 获取文件内容
      const fileResponse = await this.getFile(message.document.file_id);
      const importData = (await fileResponse.json()) as ImportData[];
      const result = await this.db.importEjaculations(message.chat.id, importData);
      await this.sendMessage(message.chat.id, result);
    } catch (err) {
      await this.sendMessage(message.chat.id, "导入失败：" + err);
    }
  }
}
