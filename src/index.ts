import cluster from "node:cluster";
import { Bot } from "grammy";
import type { Context } from "grammy";
import dotenv from "dotenv";
import { saveDiscordMessage } from "./service/sensay.api.js";
import { requiresReply, parse } from "./bot/helpers.js";
import { handleTelegramBot } from "./bot/bot.js";
import { autoChatAction } from "@grammyjs/auto-chat-action";
import type { AutoChatActionFlavor } from "@grammyjs/auto-chat-action";
import { hydrateFiles } from "@grammyjs/files";
import type { FileFlavor } from "@grammyjs/files";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { limit } from "@grammyjs/ratelimiter";

const isDevelopment = process.env.NODE_ENV === "development";
dotenv.config({ path: isDevelopment ? ".env.local" : ".env" });

if (!process.env.BOT_TOKEN_ONE) {
  throw new Error("BOT_TOKEN_ONE is not defined");
}
if (!process.env.BOT_TOKEN_TWO) {
  throw new Error("BOT_TOKEN_TWO is not defined");
}
if (!process.env.REPLICA_UUID_ONE) {
  throw new Error("BOT_TOKEN_ONE is not defined");
}
if (!process.env.REPLICA_UUID_TWO) {
  throw new Error("BOT_TOKEN_TWO is not defined");
}

type InitializeBotMessage = { type: "INITIALIZE_BOT"; token: string };
type ShutdownMessage = { type: "SHUTDOWN" };
type WorkerMessage = InitializeBotMessage | ShutdownMessage;

// Your bot configurations
const bots: { token: string; replicaUuid: string }[] = [
  {
    token: process.env.BOT_TOKEN_ONE,
    replicaUuid: process.env.REPLICA_UUID_ONE,
  },
  {
    token: process.env.BOT_TOKEN_TWO,
    replicaUuid: process.env.REPLICA_UUID_TWO,
  },
];

if (cluster.isPrimary) {
  bots.forEach((bot, _) => {
    cluster.fork({ token: bot.token, replicaUuid: bot.replicaUuid });
  });
}

if (cluster.isWorker) {
  process.send?.({ type: "INITIALIZE_BOT" });

  process.on("SIGINT", () => {
    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      worker?.send({ type: "SHUTDOWN" });
    }
  });

  process.on("message", async (msg: WorkerMessage) => {
    if (msg.type === "INITIALIZE_BOT") {
      const token = process.env.token;
      const replicaUuid = process.env.replicaUuid;
      if (!token) throw new Error("Token not found in worker environment");
      if (!replicaUuid)
        throw new Error("replicaUuid not found in worker environment");

      initializeBotClient(token, replicaUuid);
    }
  });

  process.on("uncaughtException", (err) => {
    console.error(`Exception in worker ${process.pid}:`, err);
    //TODO: add sentry

    process.exit(1);
  });
}

const initializeBotClient = async (token: string, replicaUuid: string) => {
  try {
    const bot = new Bot<FileFlavor<Context & AutoChatActionFlavor>>(token);
    const throttler = apiThrottler();

    bot.api.config.use(hydrateFiles(bot.token));
    bot.use(autoChatAction());
    bot.api.config.use(throttler);
    bot.use(
      limit({
        timeFrame: 10000,
        limit: 2,
        onLimitExceeded: (ctx) => {
          ctx?.reply("Please refrain from sending too many requests!");
        },

        keyGenerator: (ctx) => {
          return ctx.from?.id.toString();
        },
      }),
    );
    bot.on("message", async (ctx, next) => {
      const parsedChat = parse(ctx.message);
      if (parsedChat.is_bot) return;
      if (!ctx.message.text) return;

      const needsReply = requiresReply(parsedChat, ctx.me.username);

      if (!needsReply) {
        await saveDiscordMessage(replicaUuid, ctx.from?.id.toString(), {
          content: ctx.message.text,
          skip_chat_history: false,
          telegram_data: {
            chat_id: ctx.chat.id.toString(),
            chat_type: ctx.chat.type,
            user_id: ctx.from.id.toString(),
            username: ctx.from.username || "",
            message_id: ctx.message.message_id.toString(),
            message_thread_id:
              ctx.message.message_thread_id?.toString() || undefined,
          },
        });
        return;
      }

      await next();
    });

    // Get bot information first
    const botInfo = await bot.api.getMe();

    handleTelegramBot({
      bot,
      botUsername: botInfo.username,
      replicaUuid,
      overridePlan: false,
      ownerUuid: "",
      elevenlabsId: null,
      needsReply: true,
    });

    await bot.start({
      onStart: (botInfo) => {
        console.log(`@${botInfo.username} is running `);
      },
    });
  } catch (err) {
    throw new Error(`Failed to initialize worker's bot`);
  }
};
