import { Database } from "./utils/db";
import { CommandHandler } from "./handler";
import { TelegramUpdate } from "@codebam/cf-workers-telegram-bot";

interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const db = new Database(env.DB);
    const commandHandler = new CommandHandler(db, env.TELEGRAM_BOT_TOKEN);

    if (request.method === "POST") {
      const update = (await request.json()) as TelegramUpdate;
      const message = update.message;

      if (!message) {
        return new Response("OK");
      }
      // console.log(message);

      try {
        // if (message.document) {
        //   commandHandler.handleImport(message);
        //   return new Response("OK");
        // }
        if (!message.text) {
          console.log("no text");
          return new Response("OK");
        }
        const command = message.text.split(" ")[0];
        switch (command) {
          case "/start":
            await commandHandler.handleStart(message);
            break;
          case "/biu":
            await commandHandler.handleBiu(message);
            break;
          case "/analysis":
            await commandHandler.handleAnalysis(message);
            break;
          case "/export":
            await commandHandler.handleExport(message);
            break;
          case "/import":
            await commandHandler.handleImport(message);
            break;
          case "/okazu":
            await commandHandler.handleOkazu(message);
            break;
        }
      } catch (error) {
        console.error("Error handling command:", error);
        await commandHandler.sendMessage(message.chat.id, `处理命令时发生错误：${error}`);
      }
    }

    return new Response("OK");
  },
};
