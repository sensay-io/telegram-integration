import { Bot } from "grammy";

export const initializeBotClient = async (token: string) => {
  try {
    const bot = new Bot(token);

    if (process.env.NODE_ENV === "development" && token.startsWith("test")) {
      console.log("Configuring test bot", token);

      bot.botInfo = {
        id: 42,
        first_name: "Test Bot",
        is_bot: true,
        username: token,
        can_join_groups: true,
        can_read_all_group_messages: true,
        can_connect_to_business: true,
        has_main_web_app: true,
        supports_inline_queries: false,
      };

      bot.api.config.use((prev, method, payload) => {
        console.log(`bot.${method}(${JSON.stringify(payload)})`);
        if (method === "getUpdates") {
          return new Promise((resolve) => {
            setTimeout(() => {
              // biome-ignore lint/suspicious/noExplicitAny: <explanation>
              resolve({ ok: true, result: [] } as any);
            }, 30000);
          });
        }

        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        return Promise.resolve({ ok: true } as any);
      });
    }

    bot.on("message", async (ctx) => {
      await ctx.reply(`Hello from ${ctx.me.username}!`);
    });

    await bot.start({
      onStart: (botInfo) => {
        console.log(`@${botInfo.username} is running `);
      },
    });
  } catch (err) {
    throw new Error("Failed to initialize bot", { cause: err });
  }
};
