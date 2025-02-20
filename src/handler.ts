import { TelegramMessage as Message } from "@codebam/cf-workers-telegram-bot";
import { Database, EjaculationStatsType, ImportData } from "./utils/db";
import telegramifyMarkdown from "telegramify-markdown";
import timespanParser from "timespan-parser";
// @ts-ignore
import { plot } from "svg-line-chart";
import htm from "htm";
import vhtml from "vhtml";

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

  async generateHtmlGraph({ when, intervals, avgInterval, medianInterval }: EjaculationStatsType): Promise<string> {
    const html = htm.bind(vhtml);

    const output = plot(html)(
      { x: when, y: intervals },
      {
        props: {
          style: "display:block;margin:0 auto;",
        },
        width: 70,
        height: 20,
        title: "Ejaculation Frequency stats",
        polygon: {
          fill: "none",
          style: "fill:url(#polygrad);",
          strokeWidth: 0.01,
          stroke: "white",
        },
        line: {
          fill: "none",
          strokeWidth: 0.1,
          stroke: "black",
        },
        polygonGradient: {
          offSet1: "0%",
          stopColor1: "#ffffff00",
          offSet2: "100%",
          stopColor2: "#ffffff00",
        },
        xAxis: {
          strokeWidth: 0.1,
          stroke: "black",
        },
        yAxis: {
          strokeWidth: 0.1,
          stroke: "black",
        },
        xLabel: {
          fontSize: 0.6,
          name: `avgInterval: ${avgInterval.toFixed(2)}, medianInterval: ${medianInterval.toFixed(2)}`,
        },
        yLabel: {
          fontSize: 0.6,
          name: "interval (days)",
          locale: "en-US",
        },
        xGrid: {
          strokeWidth: 0.05,
          stroke: "lightgrey",
        },
        yGrid: {
          strokeWidth: 0.05,
          stroke: "lightgrey",
        },
        xNumLabels: 5,
        yNumLabels: 5,
      },
    );
    return output.toString();
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
    const duration = timespanParser.parse(args, "seconds");
    const stats = await this.db.getEjaculationStats(userId, duration);
    if (!stats.data) {
      await this.sendMessage(chatId, "没有足够的数据来生成统计图表，至少需要 2 次");
      return;
    }
    const output = await this.generateHtmlGraph(stats.data);
    await this.sendTextFile(chatId, "analysis.html", output);
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
