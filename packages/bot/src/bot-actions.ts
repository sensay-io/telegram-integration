import { autoChatAction } from '@grammyjs/auto-chat-action'
import { hydrateFiles } from '@grammyjs/files'
import { limit } from '@grammyjs/ratelimiter'
// TODO: Replace @grammyjs/transformer-throttler with @grammyjs/auto-retry
// @grammyjs/transformer-throttler is unmaintained.
// The docs recommend using the auto-retry plugin instead:
// https://grammy.dev/plugins/transformer-throttler
import { apiThrottler } from '@grammyjs/transformer-throttler'
import { Bot } from 'grammy'
import type { Api, RawApi } from 'grammy'
import {
  getReplyParameters,
  hasUserRepliedToReplica,
  isPlanValid,
  parse,
  removeMentionIfNeeded,
  voiceRequest,
} from './helpers.js'
import { sendError, sendMessage, sendSubscriptionRenewMessage } from './responses.js'
import { sendVoiceRecording } from './responses.js'
import type { TelegramContext } from './types/responses'

export function initTelegramBot(token: string) {
  const bot = new Bot<TelegramContext>(token)

  const throttler = apiThrottler()

  bot.api.config.use(hydrateFiles(bot.token))
  bot.use(autoChatAction())
  bot.api.config.use(throttler)
  bot.use(
    limit({
      timeFrame: 10000,
      limit: 10,
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
  bot: Bot<TelegramContext, Api<RawApi>>
  botUsername: string
  replicaUuid: string
  overridePlan: boolean
  elevenlabsId?: string
}

export const botActions = ({
  bot,
  botUsername,
  replicaUuid,
  overridePlan,
  elevenlabsId,
}: HandleTelegramBotArgs) => {
  bot.on('message:photo', async (ctx) => {
    const parsedMessage = parse(ctx)

    if (!parsedMessage || parsedMessage.isBot) return

    const {
      chatId,
      messageText,
      messageId,
      messageThreadId,
      isTopicMessage,
      isPrivateChat,
      needsReply,
    } = parsedMessage

    if (!needsReply) return

    ctx.chatAction = 'typing'

    if (!(await isPlanValid(overridePlan, replicaUuid))) {
      await sendSubscriptionRenewMessage(ctx)
      return
    }

    const replyParameters = getReplyParameters('private', {
      needsReply,
      messageId,
      messageThreadId,
      isTopicMessage,
      chatId,
    })

    if (!messageText) {
      await sendError({
        ctx,
        message: 'Caption is empty, please provide a message.',
      })
      return
    }

    const imageURL = (await ctx.getFile()).getUrl()

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
  })

  bot.on('message::mention', async (ctx, next) => {
    const parsedMessage = parse(ctx)
    if (!parsedMessage) return

    const {
      messageText,
      messageId,
      chatId,
      messageThreadId,
      needsReply,
      isTopicMessage,
      isPrivateChat,
      isBot,
    } = parsedMessage

    if (isPrivateChat) {
      // Private messages are handled in the on('message') event
      await next()
      return
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
      await sendError({
        ctx,
        message: 'No message was provided',
      })
      return
    }

    ctx.chatAction = 'typing'

    if (!(await isPlanValid(overridePlan, replicaUuid))) {
      await sendSubscriptionRenewMessage(ctx)
      return
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
  })

  bot.on('message', async (ctx) => {
    const parsedMessage = parse(ctx)
    if (!parsedMessage) return

    const {
      messageText,
      messageId,
      chatId,
      messageThreadId,
      isPrivateChat,
      isTopicMessage,
      reply,
    } = parsedMessage

    const needsReply = hasUserRepliedToReplica(reply, botUsername)
    if (!messageText.includes(`@${botUsername}`) && !needsReply && !isPrivateChat) return

    ctx.chatAction = 'typing'

    if (!(await isPlanValid(overridePlan, replicaUuid))) {
      await sendSubscriptionRenewMessage(ctx)
      return
    }

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

    const userMessage = removeMentionIfNeeded(messageText, botUsername, needsReply)
    if (!userMessage) {
      await sendError({
        ctx,
        message: 'No message was provided',
      })
      return
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
  })

  return bot
}
