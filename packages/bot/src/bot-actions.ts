import { type AutoChatActionFlavor, autoChatAction } from '@grammyjs/auto-chat-action'
import { type FileFlavor, hydrateFiles } from '@grammyjs/files'
import { limit } from '@grammyjs/ratelimiter'
// TODO: Replace @grammyjs/transformer-throttler with @grammyjs/auto-retry
// @grammyjs/transformer-throttler is unmaintained.
// The docs recommend using the auto-retry plugin instead:
// https://grammy.dev/plugins/transformer-throttler
import { apiThrottler } from '@grammyjs/transformer-throttler'
import { Bot, type Context } from 'grammy'
import type { Api, RawApi } from 'grammy'
import { PRIVATE_CHAT } from './constants'
import {
  getReplyParameters,
  hasUserRepliedToReplica,
  isPlanValid,
  parse,
  removeMentionIfNeeded,
  voiceRequest,
} from './helpers.js'
import { sendError, sendMessage } from './responses.js'
import { sendVoiceRecording } from './responses.js'

export class NonCriticalError extends Error {
  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, NonCriticalError.prototype)
    this.name = 'NonCriticalError'
  }
}

export function initTelegramBot(token: string) {
  const bot = new Bot<FileFlavor<Context & AutoChatActionFlavor>>(token)

  const throttler = apiThrottler()

  bot.api.config.use(hydrateFiles(bot.token))
  bot.use(autoChatAction())
  bot.api.config.use(throttler)
  bot.use(
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
  return bot
}

export type HandleTelegramBotArgs = {
  bot: Bot<FileFlavor<Context & AutoChatActionFlavor>, Api<RawApi>>
  botUsername: string
  replicaUuid: string
  overridePlan: boolean
  ownerID: string
  elevenlabsId?: string
}

export const botActions = ({
  bot,
  botUsername,
  replicaUuid,
  overridePlan,
  ownerID,
  elevenlabsId,
}: HandleTelegramBotArgs) => {
  bot.on('message:photo', async (ctx) => {
    const parsedMessage = parse(ctx.message)

    if (!parsedMessage || parsedMessage.isBot) return

    const caption = ctx.message.caption
    const isPrivateChat = parsedMessage.type === 'private'
    const isBotMentioned = caption?.includes(`@${botUsername}`)
    const isTopicMessage = ctx.message.is_topic_message

    const needsReply = hasUserRepliedToReplica(parsedMessage.reply, botUsername)

    if (!isBotMentioned && !needsReply && !isPrivateChat) return

    ctx.chatAction = 'typing'

    const messageThreadId = ctx?.message?.message_thread_id
    const replyParameters = getReplyParameters('private', {
      needsReply,
      messageId: parsedMessage.messageId,
      messageThreadId,
      isTopicMessage,
      chatId: parsedMessage.chatId,
    })

    try {
      if (!caption) {
        await sendError({
          message: 'Caption is empty, please provide a message.',
          ctx,
          disableErrorCapture: true,
        })
        return
      }

      const imageURL = (await ctx.getFile()).getUrl()

      const messageText = removeMentionIfNeeded(caption, botUsername, needsReply)

      await sendMessage({
        parsedMessage,
        needsReply,
        messageText,
        replicaUuid,
        messageThreadId,
        botUsername: isPrivateChat ? '' : botUsername,
        ctx,
        replyParameters,
        isTopicMessage,
        imageURL,
      })
    } catch (error) {
      await sendError({
        message: 'An error occurred, please contact Sensay with the error id.',
        ctx,
        error,
      })
    }
  })

  bot.on('message::mention', async (ctx, next) => {
    try {
      const parsedMessage = parse(ctx.message)

      if (!parsedMessage) return
      const {
        messageText,
        messageId,
        chatId,
        messageThreadId,
        isTopicMessage,
        isBot,
        type,
        reply,
      } = parsedMessage

      const needsReply = hasUserRepliedToReplica(reply, botUsername)

      if (type === PRIVATE_CHAT) {
        // Private messages are handled in the on('message') event
        await next()
      }

      if (isBot) return

      const replyParameters = getReplyParameters('group', {
        needsReply,
        messageId,
        messageThreadId,
        chatId,
        isTopicMessage,
      })

      const userMessage = removeMentionIfNeeded(messageText, botUsername, needsReply)

      if (!userMessage) {
        throw new NonCriticalError('No message was provided')
      }

      const { voice_requested, text } = await voiceRequest(messageText)

      if (voice_requested) {
        await sendVoiceRecording({
          ctx,
          parsedMessage,
          messageText: text,
          replicaUuid,
          elevenlabsId,
          needsReply,
          messageThreadId,
          isTopicMessage,
          replyParameters,
        })
        return
      }

      await sendMessage({
        parsedMessage,
        needsReply,
        messageText: userMessage,
        replicaUuid,
        messageThreadId,
        botUsername: botUsername,
        ctx,
        replyParameters,
        isTopicMessage,
      })
      return
    } catch (err) {
      await sendError({
        message:
          err instanceof NonCriticalError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'An error occurred, please contact Sensay with the error id.',
        ctx,
        error: err,
        disableErrorCapture: err instanceof NonCriticalError,
      })
    }
  })

  bot.on('message', async (ctx) => {
    try {
      const parsedMessage = parse(ctx.message)
      if (!parsedMessage) return

      const { messageText, messageId, chatId, messageThreadId, isTopicMessage, type, reply } =
        parsedMessage
      const isPrivateChat = type === 'private'

      const needsReply = hasUserRepliedToReplica(reply, botUsername)
      if (!messageText.includes(`@${botUsername}`) && !needsReply && !isPrivateChat) return

      ctx.chatAction = 'typing'

      isPlanValid(overridePlan, ownerID)

      const { voice_requested, text } = await voiceRequest(messageText)

      const chatType = isPrivateChat ? 'private' : 'group'
      const replyParameters = getReplyParameters(chatType, {
        needsReply,
        messageId: messageId,
        messageThreadId,
        chatId: chatId,
        isTopicMessage,
      })

      if (voice_requested) {
        await sendVoiceRecording({
          ctx: ctx,
          parsedMessage,
          messageText: text,
          replicaUuid,
          elevenlabsId,
          needsReply,
          messageThreadId,
          isTopicMessage,
          replyParameters,
        })
        return
      }

      let userMessage = messageText

      userMessage = removeMentionIfNeeded(messageText, botUsername, needsReply)

      if (!userMessage) {
        throw new NonCriticalError('No message was provided')
      }

      await sendMessage({
        parsedMessage,
        needsReply,
        messageText: userMessage,
        replicaUuid,
        messageThreadId,
        botUsername: isPrivateChat ? '' : botUsername,
        ctx,
        replyParameters,
        isTopicMessage,
      })

      return
    } catch (err) {
      await sendError({
        message:
          err instanceof NonCriticalError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'An error occurred, please contact Sensay with the error id.',
        ctx,
        error: err,
        disableErrorCapture: err instanceof NonCriticalError,
      })
    }
  })

  return bot
}
