import { type AutoChatActionFlavor, autoChatAction } from '@grammyjs/auto-chat-action'
import { type FileFlavor, hydrateFiles } from '@grammyjs/files'
import { limit } from '@grammyjs/ratelimiter'
import { apiThrottler } from '@grammyjs/transformer-throttler'
import { Bot, type Context } from 'grammy'
import type { Api, RawApi } from 'grammy'
import {
  ctxReply,
  isPlanValid,
  removeMentionIfNeeded,
  hasUserRepliedToReplica,
  type ParsedTelegramChat,
  getReplyParameters,
  parse,
  isUserAskingForSnsyTokenOrVoiceRecording,
} from './helpers.js'
import { sendError, sendMessage } from './responses.js'
import { sendVoiceRecording } from './responses.js'

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

const captureException = (error: unknown) => {
  console.error(error)
}

export type HandleTelegramBotArgs = {
  bot: Bot<FileFlavor<Context & AutoChatActionFlavor>, Api<RawApi>>
  botUsername: string
  replicaUuid: string
  overridePlan: boolean
  ownerUuid: string
  elevenlabsId: string | null
  needsReply: boolean
}

export const botActions = ({
  bot,
  botUsername,
  replicaUuid,
  overridePlan,
  ownerUuid,
  needsReply,
  elevenlabsId,
}: HandleTelegramBotArgs) => {
  // We need vision from the api to process photos
  // bot.on('message:photo', async (ctx) => {
  //   const parsedMessage = parse(ctx.message)
  //   if (parsedMessage.is_bot) return

  //   const caption = ctx.message.caption
  //   const isPrivateChat = parsedMessage.type === 'private'
  //   const isBotMentioned = caption?.includes(`@${botUsername}`)
  //   const isTopicMessage = ctx.message.is_topic_message

  //   if (!parsedMessage.chat_id) {
  //     await ctxReply(
  //       `Chat id is null Error Id:${captureException(new Error('chat_id is null'))}`,
  //       ctx,
  //     )
  //     return
  //   }

  //   if (!parsedMessage.message_id) {
  //     await ctxReply(
  //       `Message id is null Error Id:${captureException(new Error('chat_id is null'))}`,
  //       ctx,
  //     )
  //     return
  //   }

  //   if (!isBotMentioned && !needsReply && !isPrivateChat) return

  //   ctx.chatAction = 'typing'

  //   const messageThreadId = ctx?.message?.message_thread_id
  //   const replyParameters = getReplyParameters('private', {
  //     needsReply,
  //     messageId: parsedMessage.message_id,
  //     messageThreadId,
  //     isTopicMessage,
  //     chatId: parsedMessage.chat_id,
  //   })

  //   try {
  //     if (!caption) {
  //       await sendError({
  //         message: 'Caption is empty, please provide a message.',
  //         needsReply,
  //         messageId: parsedMessage.message_id,
  //         chatId: parsedMessage.chat_id,
  //         messageThreadId,
  //         isTopicMessage,
  //         ctx,
  //         disableErrorCapture: true,
  //       })
  //       return
  //     }

  //     // we need vision here on the API
  //     const fileUrl = (await ctx.getFile()).getUrl()
  //     if (isPrivateChat) {
  //       const text = await getTelegramResponse(replicaUuid, caption, {
  //         content: '',
  //         source: '',
  //         skip_chat_history: false,
  //         telegram_data: {
  //           chat_type: '',
  //           chat_id: '',
  //           user_id: '',
  //           username: '',
  //           message_id: '',
  //           message_thread_id: '',
  //         },
  //       })

  //       await ctxReply(text, ctx, replyParameters)
  //       return
  //     }

  //     const messageText = removeMentionIfNeeded(caption, botUsername, needsReply)

  //     let text = await getTelegramResponse(replicaUuid, messageText, {
  //       content: '',
  //       source: '',
  //       skip_chat_history: false,
  //       telegram_data: {
  //         chat_type: '',
  //         chat_id: '',
  //         user_id: '',
  //         username: '',
  //         message_id: '',
  //         message_thread_id: '',
  //       },
  //     })

  //     const mentionName = `@${parsedMessage.username}`
  //     if (botUsername && !needsReply) text = `${mentionName} ${text}`

  //     await ctxReply(text, ctx, replyParameters)
  //   } catch (error) {
  //     await sendError({
  //       message: 'An error occurred, please contact Sensay with the error id.',
  //       needsReply,
  //       messageId: parsedMessage.message_id,
  //       chatId: parsedMessage.chat_id,
  //       isTopicMessage,
  //       messageThreadId,
  //       ctx,
  //       error,
  //     })

  //     return
  //   }
  // })

  bot.on('message::mention', async (ctx) => {
    const messageThreadId = ctx.message.message_thread_id
    const messageText = ctx.message.text || ctx.message.caption
    const chat = parse(ctx.message)
    const isTopicMessage = ctx.message.is_topic_message

    try {
      if (chat.is_bot) return

      if (!messageText) {
        await ctxReply('No message was provided', ctx)
        return
      }

      await publicMessageResponse({
        isTopicMessage,
        botUsername,
        messageThreadId,
        parsedMessage: chat,
        overridePlan,
        ownerUuid,
        replicaUuid,
        text: messageText,
        elevenlabsId,
        ctx: ctx,
      })
      return
    } catch (err) {
      await sendError({
        message:
          err instanceof Error
            ? err.message
            : 'An error occurred, please contact Sensay with the error id.',
        needsReply,
        messageId: chat.message_id,
        chatId: chat.chat_id,
        messageThreadId,
        isTopicMessage,
        ctx,
        error: err,
      })
    }
  })
  bot.on('message', async (ctx) => {
    const chat = parse(ctx.message)
    const messageThreadId = ctx.message.message_thread_id
    const isTopicMessage = ctx.message.is_topic_message
    const messageText = ctx.message.text
    const isPrivateChat = chat.type === 'private'

    try {
      if (isPrivateChat) {
        const chatId = chat.chat_id
        const messageId = chat.message_id

        if (!messageText) {
          await sendError({
            message: 'No message was provided',
            needsReply: false,
            messageId,
            chatId,
            messageThreadId,
            isTopicMessage,
            ctx,
            disableErrorCapture: true,
          })
          return
        }

        if (!chatId) {
          await ctxReply(
            `Failed to process message: Unable to identify chat. Error ID: ${captureException(new Error('Chat id doesnt exist'))}.`,
            ctx,
          )
          return
        }

        if (!messageId) {
          await ctxReply(
            `Failed to process message: Unable to identify message id. Error ID: ${captureException(new Error('Message id doesnt exist'))}.`,
            ctx,
          )
          return
        }

        await replyToPrivateMessage({
          isTopicMessage,
          botUsername,
          replicaUuid,
          messageThreadId,
          parsedMessage: chat,
          overridePlan,
          ownerUuid,
          messageText,
          elevenlabsId,
          ctx: ctx,
        })

        return
      }

      if (!messageText) {
        await ctxReply('No message was provided', ctx)
        return
      }

      await publicMessageResponse({
        isTopicMessage,
        botUsername,
        messageThreadId,
        parsedMessage: chat,
        overridePlan,
        ownerUuid,
        replicaUuid,
        text: messageText,
        elevenlabsId,
        ctx,
      })
      return
    } catch (err) {
      await sendError({
        message:
          err instanceof Error
            ? err.message
            : 'An error occurred, please contact Sensay with the error id.',
        needsReply,
        messageId: chat.message_id,
        chatId: chat.chat_id,
        messageThreadId,
        isTopicMessage,
        ctx,
        error: err,
      })
    }
  })

  return bot
}

type ReplyToPrivateMessageArgs = {
  parsedMessage: ParsedTelegramChat
  replicaUuid: string
  messageThreadId: number | undefined
  botUsername: string
  ownerUuid: string
  overridePlan: boolean
  isTopicMessage: boolean | undefined
  messageText: string
  elevenlabsId: string | null
  ctx: FileFlavor<Context & AutoChatActionFlavor>
}

export async function replyToPrivateMessage({
  botUsername,
  parsedMessage,
  replicaUuid,
  messageThreadId,
  overridePlan,
  ownerUuid,
  messageText,
  isTopicMessage,
  elevenlabsId,
  ctx,
}: ReplyToPrivateMessageArgs) {
  const needsReply = hasUserRepliedToReplica(parsedMessage, botUsername)

  ctx.chatAction = 'typing'

  const hasValidPlan = await isPlanValid(overridePlan, ownerUuid)

  if (!hasValidPlan) {
    await sendError({
      message:
        'Please renew your subscription. https://www.sensay.io/pricing to visit Sensay pricing.',
      needsReply: false,
      messageId: parsedMessage.message_id,
      chatId: parsedMessage.chat_id,
      messageThreadId,
      isTopicMessage,
      ctx,
      disableErrorCapture: true,
    })
    return
  }

  const replyParameters = getReplyParameters('private', {
    needsReply,
    messageId: parsedMessage.message_id,
    messageThreadId,
    isTopicMessage,
    chatId: parsedMessage.chat_id,
  })

  const { voice, token, usage } = await isUserAskingForSnsyTokenOrVoiceRecording(messageText)

  if (voice) {
    if (!elevenlabsId) {
      await ctxReply('Please provide a valid Elevenlabs ID', ctx, replyParameters)
      return
    }
    await sendVoiceRecording({
      ctx: ctx,
      parsedMessage,
      messageText,
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
    messageText,
    replicaUuid,
    requestedToken: token,
    messageThreadId,
    botUsername: '',
    ctx,
    usage,
    replyParameters,
  })
  return
}

type ReplyToPublicMessageArgs = {
  isTopicMessage: boolean | undefined
  parsedMessage: ParsedTelegramChat
  messageThreadId: number | undefined
  botUsername: string
  ownerUuid: string
  overridePlan: boolean
  replicaUuid: string
  text: string
  elevenlabsId: string | null
  ctx: FileFlavor<Context & AutoChatActionFlavor>
}

export const publicMessageResponse = async ({
  isTopicMessage,
  parsedMessage,
  messageThreadId,
  botUsername,
  overridePlan,
  replicaUuid,
  ctx,
  ownerUuid,
  text,
  elevenlabsId,
}: ReplyToPublicMessageArgs) => {
  const needsReply = hasUserRepliedToReplica(parsedMessage, botUsername)

  if (!text.includes(`@${botUsername}`) && !needsReply) return

  ctx.chatAction = 'typing'

  const messageTextWithoutMention = removeMentionIfNeeded(text, botUsername, needsReply)

  if (!messageTextWithoutMention) {
    await sendError({
      message: 'No message was provided',
      needsReply: false,
      messageId: parsedMessage.message_id,
      chatId: parsedMessage.chat_id,
      messageThreadId,
      isTopicMessage,
      ctx,
      disableErrorCapture: true,
    })
    await ctxReply('What can I do for you?', ctx)
    return
  }

  const hasValidPlan = await isPlanValid(overridePlan, ownerUuid)

  if (!hasValidPlan) {
    await sendError({
      message:
        'Please renew your subscription. https://www.sensay.io/pricing to visit Sensay pricing.',
      needsReply: false,
      messageId: parsedMessage.message_id,
      chatId: parsedMessage.chat_id,
      messageThreadId,
      isTopicMessage,
      ctx,
      disableErrorCapture: true,
    })
    return
  }

  const replyParameters = getReplyParameters('group', {
    needsReply,
    messageId: parsedMessage.message_id,
    messageThreadId,
    chatId: parsedMessage.chat_id,
    isTopicMessage,
  })

  const { voice, token, usage } =
    await isUserAskingForSnsyTokenOrVoiceRecording(messageTextWithoutMention)

  if (replicaUuid && voice) {
    if (!elevenlabsId) {
      await ctxReply('Please provide a valid Elevenlabs ID', ctx, replyParameters)
      return
    }

    await sendVoiceRecording({
      ctx: ctx,
      parsedMessage,
      messageText: messageTextWithoutMention,
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
    messageText: messageTextWithoutMention,
    replicaUuid,
    requestedToken: token,
    messageThreadId,
    botUsername: botUsername,
    ctx,
    replyParameters,
    usage,
    isTopicMessage,
  })
  return
}
