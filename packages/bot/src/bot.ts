import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { FileFlavor } from '@grammyjs/files'
import {
  type Logger,
  getV1UsersMe,
  postV1ReplicasByReplicaUuidChatHistoryTelegram,
  postV1Users,
} from '@sensay/telegram-shared'
import { SensayApiError } from '@sensay/telegram-shared'
import type { Api, Bot, Context, RawApi } from 'grammy'
import { botActions } from './bot-actions'
import { initTelegramBot } from './bot-actions'
import { captureException } from './helpers'
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
      this.logger.trace(
        {
          messageId: ctx.message.message_id,
          chatId: ctx.message.chat.id,
          messageThreadId: ctx.message.message_thread_id,
          type: ctx.message.chat.type,
          isBot: ctx.message.from.is_bot,
          userId: ctx.message.from.id,
          username: ctx.message.from.username,
        },
        'Processing message',
      )

      // Ignore event from being added to a group
      if (ctx.message.new_chat_members) return

      const parsedMessage = parse(ctx)
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
        chatName,
      } = parsedMessage

      if (isBot) return

      await createUserIfNotExist(userId.toString())

      // Save message on database and don't respond
      if (!parsedMessage.needsReply) {
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
              chat_name: chatName,
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
      elevenlabsId: this.elevenLabsId,
    })

    // This will only catch errors in the middlewares.
    // It will not catch errors that are thrown in the internal polling loop methods like fetchUpdates:
    // https://github.com/grammyjs/grammY/blob/0348b93762ab2c7341b63b642f9923a0d31ed7d5/src/bot.ts#L584
    // https://github.com/grammyjs/grammY/issues/503
    this.bot.catch(async (error) => {
      const parsedMessage = parse(error.ctx)
      if (parsedMessage?.needsReply) {
        await sendError({
          error,
          ctx: error.ctx,
          extraErrorInformation: {
            replicaUuid: this.replicaUuid,
            userMessage: error.ctx.message?.text,
          },
        })
      } else {
        captureException(error as Error, {
          extra: {
            extraErrorInformation: {
              replicaUuid: this.replicaUuid,
              userMessage: error.ctx.message?.text,
            },
          },
        })
      }
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

async function createUserIfNotExist(userId: string): Promise<void> {
  // First, try to get the user using the users/me endpoint
  const getUserResult = await getV1UsersMe({
    throwOnError: false,
    headers: {
      'X-USER-ID': userId,
      'X-USER-ID-TYPE': 'telegram',
    },
  })

  // If the response is successful, the user exists
  if (getUserResult.response.ok) {
    return
  }

  // If we get a 401 error, the user doesn't exist and we need to create them
  if (getUserResult.response.status === 401) {
    await createUser(userId)
    return
  }

  // For other error statuses, throw an error
  throw SensayApiError.fromResponse(getUserResult.response)
}

async function createUser(userId: string): Promise<void> {
  const createUserResult = await postV1Users({
    throwOnError: false,
    body: {
      linkedAccounts: [
        {
          accountID: userId,
          accountType: 'telegram',
        },
      ],
    },
  })

  if (createUserResult.response.status === 409) {
    // A user can already exist if multiple bots are sending
    // requests to create a user with the same user ID simultaneously
    return
  }

  if (!createUserResult.response.ok) {
    throw SensayApiError.fromResponse(createUserResult.response)
  }
}
