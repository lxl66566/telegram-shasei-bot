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
- /biu <material> - 射精！并记录（分享）使用的小菜，只能是文字
- /okazu - 全局随机获取一个小菜
- /analysis <duration> - 分析射精频率，并导出为 html 图表。duration 遵循 systemd timespan 格式，例如：30d, 1w, 1m, 1y。
- /start - 查看帮助信息
- /export - 导出数据
- /import <json file url> - 导入数据。json 的格式必须为 \`{ time: Date; material?: string; }[]\``;
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

  // 这是发送 Json 文件导入数据的代码，但是遇到了 bug：https://t.me/withabsolutex/2241，所以我更换了导入方式
  // async handleImport(message: Message): Promise<void> {
  //   try {
  //     if (!message.document) {
  //       await this.sendMessage(message.chat.id, "如果想要导入数据，请发送一个 JSON 文件");
  //       return;
  //     }
  //     console.log(message.document);

  //     // 获取文件内容
  //     const fileResponse = await this.getFile(message.document.file_id);
  //     const importData = (await fileResponse.json()) as ImportData[];
  //     const result = await this.db.importEjaculations(message.chat.id, importData);
  //     await this.sendMessage(message.chat.id, result);
  //   } catch (err) {
  //     await this.sendMessage(message.chat.id, "导入失败：" + err);
  //   }
  // }

  async handleImport(message: Message): Promise<void> {
    try {
      const args = message.text?.split(" ");
      if (!args || args.length < 2) {
        throw new Error("请输入导入数据，遵循以下格式：/import <json file url>");
      }
      const jsonFileUrl = args[1];
      const fileResponse = await fetch(jsonFileUrl);
      const importData = (await fileResponse.json()) as ImportData[];
      await this.sendMessage(message.chat.id, "数据导入中...若未返回结果，请尝试导出数据以查看导入进度，避免中间状态导致数据重复");
      const result = await this.db.importEjaculations(message.chat.id, importData);
      await this.sendMessage(message.chat.id, result);
    } catch (err) {
      await this.sendMessage(message.chat.id, "导入失败：" + err);
    }
  }

  async handleOkazu(message: Message): Promise<void> {
    const material = await this.db.getRandomMaterial();
    if (!material) {
      await this.sendMessage(message.chat.id, "没有找到小菜");
      return;
    }
    await this.sendMessage(message.chat.id, `随机获取的小菜：${material}`);
  }
}
