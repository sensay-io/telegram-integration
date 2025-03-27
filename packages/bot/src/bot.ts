import { Bot } from 'grammy'

export class BotClient {
  private readonly bot: Bot

  constructor(botToken: string) {
    this.bot = new Bot(botToken)
  }

  isHealthy() {
    return this.bot.isInited() && this.bot.isRunning()
  }

  start() {
    this.bot.on('message', async (ctx) => {
      await ctx.reply(`Hello from ${ctx.me.username}!`)
    })

    this.bot.catch((err) => {
      console.error('Failed to start bot', err)
    })

    // Don't await bot.start method. It blocks until the bot is stopped.
    // https://grammy.dev/ref/core/bot#start
    this.bot.start({
      onStart: (botInfo) => {
        console.log(`@${botInfo.username} is running\n`)
      },
    })
  }

  async stop() {
    await this.bot.stop()
  }

  mock(isTesting: boolean) {
    this.bot.botInfo = {
      id: 42,
      first_name: 'Test Bot',
      is_bot: true,
      username: this.bot.token,
      can_join_groups: true,
      can_read_all_group_messages: true,
      can_connect_to_business: true,
      has_main_web_app: true,
      supports_inline_queries: false,
    }

    this.bot.api.config.use((prev, method, payload) => {
      if (!isTesting) {
        console.log(
          `\n[BotClient][${this.bot.botInfo.username}] bot.${method}(${JSON.stringify(payload)})\n`,
        )
      }

      if (method === 'getUpdates') {
        return new Promise((resolve) => {
          setTimeout(() => {
            // biome-ignore lint/suspicious/noExplicitAny: Fake response
            resolve({ ok: true, result: [] } as any)
          }, 30000)
        })
      }

      // biome-ignore lint/suspicious/noExplicitAny: Fake response
      return Promise.resolve({ ok: true } as any)
    })
  }
}
