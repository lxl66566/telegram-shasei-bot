# Telegram shasei Bot on Cloudflare Workers

一个射精记录的机器人，托管在 Cloudflare Workers 上。

demo: [@shasei_bot](https://t.me/shasei_bot)

## 功能

- 记录射精时间与使用的小菜
- 分析射精频率，导出为图片
- 导入与导出数据

## 命令列表

- `/biu` - 射精！
- `/biu <material>` - 射精！并记录使用的小菜
- `/analysis <duration>` - 分析射精频率，并导出为图片
- `/start` - 查看帮助信息
- `/export` - 导出数据
- 发送一个 json 文件 - 导入数据

## 部署说明

1. 前置步骤：
   - 注册 Cloudflare 账号
   - 从 [Telegram](https://t.me/botfather) 注册 bot，获取 bot token
2. 克隆仓库
   ```sh
   git clone https://github.com/lxl66566/telegram-shasei-bot.git
   cd telegram-shasei-bot
   ```
3. 安装项目依赖
   ```sh
   pnpm i
   pnpm i wrangler -g
   ```
4. 部署项目
   ```sh
   wrangler d1 create telegram_shasei_bot                                  # 创建 d1 数据库
   # 然后将返回的 d1 database 信息填入 wrangler.toml 的 [[d1_databases]] 中
   wrangler d1 execute telegram_shasei_bot --file=./schema.sql --remote    # 创建数据表
   wrangler deploy                                                         # 部署项目
   wrangler secret put TELEGRAM_BOT_TOKEN                                  # 设置 bot token
   ```
5. 设置 Webhook
   访问 `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>` 设置 webhook。
   `YOUR_WORKER_URL` 在 deploy 时会给出，也可以去 Cloudflare Dashboard 查看。
6. 将 bot 添加到群组中，在私聊中使用 `/start` 命令查看帮助，开始订阅你感兴趣的内容！
