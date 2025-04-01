import { Bot, type Context, type Api, type RawApi } from 'grammy'
import { type FileFlavor, hydrateFiles } from '@grammyjs/files'
import { apiThrottler } from '@grammyjs/transformer-throttler'
import { limit } from '@grammyjs/ratelimiter'
import { type AutoChatActionFlavor, autoChatAction } from '@grammyjs/auto-chat-action'
import { requiresReply } from './helpers'
import { parse } from './helpers'
import { saveTelegramMessage } from './service/sensay.api'
import { botActions } from './bot-actions'

type MyContext = FileFlavor<Context & AutoChatActionFlavor>
type MyBot = Bot<MyContext, Api<RawApi>>

export class BotClient {
  private readonly bot: MyBot
  private readonly replicaUuid: string

  constructor(botToken: string, replicaUuid: string) {
    this.replicaUuid = replicaUuid
    this.bot = new Bot<MyContext>(botToken)
    const throttler = apiThrottler()

    this.bot.api.config.use(hydrateFiles(this.bot.token))
    this.bot.use(autoChatAction())
    this.bot.api.config.use(throttler)
    this.bot.use(
      limit({
        timeFrame: 10000,
        limit: 2,
        onLimitExceeded: (ctx) => {
          ctx?.reply('Please refrain from sending too many requests!')
        },

        keyGenerator: (ctx) => {
          return ctx.from?.id.toString()
        },
      }),
    )
  }

  isHealthy() {
    return this.bot.isInited() && this.bot.isRunning()
  }

  start() {
    // Save message on database and dont respond
    this.bot.on('message', async (ctx, next) => {
      const parsedChat = parse(ctx.message)
      if (parsedChat.is_bot) return
      if (!ctx.message.text) return

      const needsReply = requiresReply(parsedChat, ctx.me.username)

      if (!needsReply) {
        await saveTelegramMessage(this.replicaUuid, ctx.from?.id.toString(), {
          content: ctx.message.text,
          skip_chat_history: false,
          telegram_data: {
            chat_id: ctx.chat.id.toString(),
            chat_type: ctx.chat.type,
            user_id: ctx.from.id.toString(),
            username: ctx.from.username || '',
            message_id: ctx.message.message_id.toString(),
            message_thread_id: ctx.message.message_thread_id?.toString() || undefined,
          },
        })
        return
      }

      await next()
    })

    botActions({
      bot: this.bot,
      botUsername: this.bot.botInfo.username,
      replicaUuid: this.replicaUuid,
      overridePlan: false,
      ownerUuid: '',
      elevenlabsId: null,
      needsReply: true,
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
