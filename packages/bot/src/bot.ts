import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { FileFlavor } from '@grammyjs/files'
import type { Api, Bot, Context, RawApi } from 'grammy'
import { botActions } from './bot-actions'
import { hasUserRepliedToReplica } from './helpers'
import { parse } from './helpers'
import { saveTelegramMessage, checkAndCreateUser } from './service/sensay.api'
import { initTelegramBot } from './bot-actions'

type MyContext = FileFlavor<Context & AutoChatActionFlavor>
type MyBot = Bot<MyContext, Api<RawApi>>

export class BotClient {
  private readonly bot: MyBot
  private readonly replicaUuid: string
  private readonly ownerUuid: string

  constructor(botToken: string, replicaUuid: string, ownerUuid: string) {
    this.replicaUuid = replicaUuid
    this.ownerUuid = ownerUuid
    this.bot = initTelegramBot(botToken)
  }

  isHealthy() {
    return this.bot.isInited() && this.bot.isRunning()
  }

  async start() {
    await this.bot.init()

    this.bot.on('message', async (ctx, next) => {
      const parsedChat = parse(ctx.message)
      if (parsedChat.is_bot) return
      if (!ctx.message.text) return

      await checkAndCreateUser(ctx.from?.id.toString() || '')

      const isReplicaTagged = ctx.message.text.includes(`@${this.bot.botInfo.username}`)
      const isPrivateChat = parsedChat.type === 'private'

      const needsReplyByReplica =
        hasUserRepliedToReplica(parsedChat, ctx.me.username) || isReplicaTagged || isPrivateChat

      // Save message on database and dont respond
      if (!needsReplyByReplica) {
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
      ownerUuid: this.ownerUuid,
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
