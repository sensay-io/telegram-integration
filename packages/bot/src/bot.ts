import { Bot } from "grammy";

export const initializeBotClient = async (token: string) => {
  try {
    console.log("Initializing bot", token);

    const bot = new Bot(token);

    if (process.env.NODE_ENV === "development" && token === "test") {
      console.log("Configuring test bot");

      bot.botInfo = {
        id: 42,
        first_name: "Test Bot",
        is_bot: true,
        username: "test_bot",
        can_join_groups: true,
        can_read_all_group_messages: true,
        can_connect_to_business: true,
        has_main_web_app: true,
        supports_inline_queries: false,
      };

      bot.api.config.use(() => {
        // biome-ignore lint/suspicious/noExplicitAny: Mocking any API response
        return { ok: true } as any;
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
