import assert from 'node:assert'
import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { FileFlavor } from '@grammyjs/files'
import {
  type Logger,
  getV1UsersMe,
  postV1ReplicasByReplicaUuidChatHistoryTelegram,
  postV1Users,
} from '@sensay/telegram-shared'
import SensayApiError from '@sensay/telegram-shared/src/api-client/runtime-config'
import type { Api, Bot, Context, RawApi } from 'grammy'
import { botActions } from './bot-actions'
import { initTelegramBot } from './bot-actions'
import { PRIVATE_CHAT } from './constants'
import { hasUserRepliedToReplica } from './helpers'
import { parse } from './helpers'
import { sendError } from './responses'

type MyContext = FileFlavor<Context & AutoChatActionFlavor>
type MyBot = Bot<MyContext, Api<RawApi>>

export class BotClient {
  private readonly bot: MyBot
  private readonly logger: Logger
  private readonly isStarted = Promise.withResolvers<boolean>()

  constructor(
    logger: Logger,
    botToken: string,
    private readonly replicaUuid: string,
    private readonly ownerID: string,
    private readonly elevenLabsId?: string,
  ) {
    this.bot = initTelegramBot(botToken)
    this.logger = logger.child({
      module: BotClient.name,
    })
  }

  async isHealthy() {
    return (await this.isStarted.promise) && this.bot.isInited() && this.bot.isRunning()
  }

  async start() {
    await this.bot.init()

    this.bot.on('message', async (ctx, next) => {
      const parsedMessage = parse(ctx.message)
      if (!parsedMessage) return
      const {
        messageText,
        messageId,
        chatId,
        messageThreadId,
        type,
        isBot,
        userId,
        username,
        reply,
      } = parsedMessage

      this.logger.trace(
        {
          messageId,
          chatId,
          messageThreadId,
          type,
          isBot,
          userId,
          username,
        },
        'Processing message',
      )

      if (isBot) return

      assert(ctx.from !== undefined)
      await createUserIfNotExist(ctx.from.id.toString())

      const isReplicaTagged = messageText.includes(`@${this.bot.botInfo.username}`)
      const isPrivateChat = type === PRIVATE_CHAT
      const isReplyToReplica = hasUserRepliedToReplica(reply, ctx.me.username)

      const needsReplyByReplica = isReplyToReplica || isReplicaTagged || isPrivateChat

      // Save message on database and don't respond
      if (!needsReplyByReplica) {
        await postV1ReplicasByReplicaUuidChatHistoryTelegram({
          path: { replicaUUID: this.replicaUuid },
          headers: {
            'X-USER-ID': userId,
            'X-USER-ID-TYPE': 'telegram',
          },
          body: {
            content: messageText,
            telegram_data: {
              chat_id: chatId,
              chat_type: type,
              user_id: userId,
              username: username || '',
              message_id: messageId,
              message_thread_id: messageThreadId,
            },
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
      ownerID: this.ownerID,
      elevenlabsId: this.elevenLabsId,
    })

    // This will only catch errors in the middlewares.
    // It will not catch errors that are thrown in the internal polling loop methods like fetchUpdates:
    // https://github.com/grammyjs/grammY/blob/0348b93762ab2c7341b63b642f9923a0d31ed7d5/src/bot.ts#L584
    // https://github.com/grammyjs/grammY/issues/503
    this.bot.catch(async (error) => {
      await sendError({
        error,
        ctx: error.ctx,
        extraErrorInformation: {
          replicaUuid: this.replicaUuid,
          userMessage: error.ctx.message?.text,
        },
      })
    })

    this.bot.start({
      // Don't await bot.start method. It blocks until the bot is stopped. https://grammy.dev/ref/core/bot#start
      onStart: (botInfo) => {
        this.isStarted.resolve(true)
        console.log(`@${botInfo.username} is running\n`)
      },
    })
  }

  async stop() {
    await this.bot.stop()
  }
}

async function createUserIfNotExist(userId: string) {
  // First, try to get the user using the users/me endpoint
  const getUserResponse = await getV1UsersMe({
    throwOnError: false,
    headers: {
      'X-USER-ID': userId,
      'X-USER-ID-TYPE': 'telegram',
    },
  })

  // If the response is successful, the user exists
  if (getUserResponse.response.ok) {
    return getUserResponse.data
  }

  // If we get a 401 error, the user doesn't exist and we need to create them
  if (getUserResponse.response.status === 401) {
    return await createUser(userId)
  }

  // For other error statuses, throw an error
  throw SensayApiError.fromResponse(getUserResponse.response)
}

async function createUser(userId: string) {
  const createUserResponse = await postV1Users({
    throwOnError: false,
    body: {
      id: userId,
      linkedAccounts: [
        {
          accountID: userId,
          accountType: 'telegram',
        },
      ],
    },
  })

  if (!createUserResponse.response.ok) {
    throw SensayApiError.fromResponse(createUserResponse.response)
  }

  return createUserResponse.data
}
