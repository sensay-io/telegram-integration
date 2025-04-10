import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { FileFlavor } from '@grammyjs/files'
import type { Api, Bot, Context, RawApi } from 'grammy'
import { botActions } from './bot-actions'
import { hasUserRepliedToReplica } from './helpers'
import { parse } from './helpers'
import { getV1UsersMe, postV1ReplicasByReplicaUuidChatHistoryTelegram } from '../../client/sdk.gen'
import { initTelegramBot } from './bot-actions'
import { env } from 'node:process'

const SENSAY_API_KEY = env.SENSAY_API_KEY
const SENSAY_ORGANIZATION_SECRET = env.SENSAY_ORGANIZATION_SECRET
const VERCEL_PROTECTION_BYPASS_KEY = env.VERCEL_PROTECTION_BYPASS_KEY

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
      const parsedMessage = parse(ctx.message)
      if (parsedMessage.is_bot) return
      if (!ctx.message.text) return

      await checkAndCreateUser(ctx.from?.id.toString() || '')

      const isReplicaTagged = ctx.message.text.includes(`@${this.bot.botInfo.username}`)
      const isPrivateChat = parsedMessage.type === 'private'

      const needsReplyByReplica =
        hasUserRepliedToReplica(parsedMessage, ctx.me.username) || isReplicaTagged || isPrivateChat

      // Save message on database and dont respond
      if (!needsReplyByReplica) {
        await postV1ReplicasByReplicaUuidChatHistoryTelegram({
          path: { replicaUUID: this.replicaUuid },
          body: {
            content: ctx.message.text,
            telegram_data: {
              chat_id: parsedMessage.chat_id,
              chat_type: parsedMessage.type,
              user_id: parsedMessage.user_id,
              username: parsedMessage.username || '',
              message_id: parsedMessage.message_id,
              message_thread_id: ctx.message.message_thread_id,
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
}

interface ErrorResponse {
  error?: string
  message?: string
}

async function checkAndCreateUser(userId: string) {
  try {
    const userResponse = await getV1UsersMe({
      headers: {
        'Content-Type': 'application/json',
        'X-ORGANIZATION-SECRET': SENSAY_ORGANIZATION_SECRET || '',
        'X-USER-ID': userId,
        'X-USER-ID-TYPE': 'telegram',
        // needed for vercel protection in staging
        'x-vercel-protection-bypass': VERCEL_PROTECTION_BYPASS_KEY || '',
      },
    })
    // First, try to get the user using the users/me endpoint

    // If the response is successful, the user exists
    if (userResponse.response.ok) {
      return userResponse.data
    }

    // If we get a 401 error, the user doesn't exist and we need to create them
    if (userResponse.response.status === 401) {
      const createResponse = await fetch(`${SENSAY_API_KEY}/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ORGANIZATION-SECRET': SENSAY_ORGANIZATION_SECRET || '',
          // needed for vercel protection in staging
          'x-vercel-protection-bypass': VERCEL_PROTECTION_BYPASS_KEY || '',
        },
        body: JSON.stringify({
          IDs: [
            {
              userID: userId,
              userIDType: 'telegram',
            },
          ],
        }),
      })

      if (!createResponse.ok) {
        const errorData = (await createResponse.json()) as ErrorResponse
        throw new Error(errorData.error || errorData.message || 'Failed to create user')
      }

      console.log('User created')

      return await createResponse.json()
    }

    // For other error statuses, throw an error
    const errorData = userResponse.error as ErrorResponse
    throw new Error(
      errorData.error || errorData.message || `Unexpected error: ${userResponse.response.status}`,
    )
  } catch (error: unknown) {
    // Re-throw the error with additional context
    if (error instanceof Error) {
      throw new Error(`Error checking/creating user: ${error.message}`)
    }
    throw new Error(`Error checking/creating user: ${String(error)}`)
  }
}
