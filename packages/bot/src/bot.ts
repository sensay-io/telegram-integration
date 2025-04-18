import assert from 'node:assert'
import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { FileFlavor } from '@grammyjs/files'
import type { Api, Bot, Context, RawApi } from 'grammy'
import {
  getV1UsersMe,
  postV1ReplicasByReplicaUuidChatHistoryTelegram,
  postV1Users,
} from '../../client/sdk.gen'
import { NonCriticalError, botActions } from './bot-actions'
import { initTelegramBot } from './bot-actions'
import { PRIVATE_CHAT, commonHeaders } from './constants'
import { hasUserRepliedToReplica } from './helpers'
import { parse } from './helpers'
import { sendError } from './responses'

type MyContext = FileFlavor<Context & AutoChatActionFlavor>
type MyBot = Bot<MyContext, Api<RawApi>>

export class BotClient {
  private readonly bot: MyBot
  private readonly replicaUuid: string
  private readonly ownerUuid: string
  private readonly isStarted = Promise.withResolvers<boolean>()

  constructor(botToken: string, replicaUuid: string, ownerUuid: string) {
    this.replicaUuid = replicaUuid
    this.ownerUuid = ownerUuid
    this.bot = initTelegramBot(botToken)
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
            ...commonHeaders,
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
      ownerUuid: this.ownerUuid,
      elevenlabsId: null,
    })

    this.bot.catch(async (error) => {
      await sendError({
        message:
          error instanceof NonCriticalError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'An error occurred, please contact Sensay with the error id.',
        ctx: error.ctx,
        error,
        disableErrorCapture: error instanceof NonCriticalError,
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
    headers: {
      ...commonHeaders,
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
  throw new Error(`Unexpected error in getUserResponse for userId: ${userId}`, {
    cause: getUserResponse,
  })
}

async function createUser(userId: string) {
  const createUserResponse = await postV1Users({
    headers: commonHeaders,
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
    throw new Error(`Unexpected error in createUserResponse for userId: ${userId}`, {
      cause: createUserResponse,
    })
  }

  return createUserResponse.data
}

function logUnexpectedResponse(response: Response, action: string) {
  // TODO: Move to Common
  // TODO: Use Sentry/Pino here
  console.error(`Unexpected response when ${action}: ${response.status} ${response.statusText}`)
  console.error('Headers:', Object.fromEntries(response.headers))
  console.error('Body:', response.body)
}
