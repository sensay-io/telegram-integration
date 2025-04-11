import { env } from './env'

import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { FileFlavor } from '@grammyjs/files'
import type { LanguageModelUsage } from 'ai'
import { ElevenLabsClient } from 'elevenlabs'
import type { Context } from 'grammy'
import { InputFile } from 'grammy'
import type { Methods, RawApi } from 'grammy/out/core/client'
import removeMd from 'remove-markdown'
import type { ReplyParameterType } from './helpers'
import { ctxReply } from './helpers'
import { type ParsedTelegramChat, getReplyParameters } from './helpers'
import { postV1ReplicasByReplicaUuidChatCompletionsTelegram } from '../../client/sdk.gen'
import { NonCriticalError } from './bot-actions'

const captureException = (error: Error, extra?: unknown) => {
  console.error(error, extra)
}

type SendMessageArgs = {
  parsedMessage: ParsedTelegramChat
  needsReply: boolean
  messageText: string
  replicaUuid: string
  messageThreadId: number | undefined
  botUsername: string
  ctx: FileFlavor<Context & AutoChatActionFlavor>
  replyParameters: ReplyParameterType<Methods<RawApi>>
  isTopicMessage?: boolean
  usage?: LanguageModelUsage | undefined
}

export async function sendMessage({
  parsedMessage,
  needsReply,
  messageText,
  replicaUuid,
  messageThreadId,
  botUsername,
  ctx,
  replyParameters,
  isTopicMessage = false,
}: SendMessageArgs) {
  const completionResponse = await postV1ReplicasByReplicaUuidChatCompletionsTelegram({
    path: { replicaUUID: replicaUuid },
    body: {
      content: messageText,
      skip_chat_history: false,
      telegram_data: {
        chat_type: parsedMessage.type,
        chat_id: parsedMessage.chatId,
        user_id: parsedMessage.userId,
        username: parsedMessage.username || '',
        message_id: parsedMessage.messageId,
        message_thread_id: messageThreadId,
      },
    },
  })

  let fullResponse = completionResponse.data?.content

  if (!fullResponse) {
    throw new NonCriticalError(
      'An error occurred while generating your response, please contact Sensay with the error id.',
    )
  }

  const mentionName = `@${parsedMessage.username}`
  if (botUsername && !needsReply) fullResponse = `${mentionName} ${fullResponse}`

  try {
    await ctxReply(fullResponse, ctx, replyParameters)
  } catch (err) {
    await sendError({
      message:
        'An error occurred with sending your message, please contact Sensay with the error id.',
      needsReply,
      ctx,
      error: err,
      extraErrorInformation: {
        replicaUuid,
        userMessage: messageText,
        replicaResponse: fullResponse,
      },
    })
  }

  return
}

type SendErrorArgs = {
  message: string
  needsReply: boolean
  ctx: FileFlavor<Context & AutoChatActionFlavor>
  error?: unknown
  disableErrorCapture?: boolean
  extraErrorInformation?: { [key: string]: string }
}

export const sendError = async ({
  message,
  needsReply,
  ctx,
  error,
  disableErrorCapture,
  extraErrorInformation,
}: SendErrorArgs) => {
  try {
    if (!ctx.message) {
      await ctxReply(
        `An unexpected error occurred, please contact Sensay with the error id. ${captureException(new Error(message), { extra: { extraErrorInformation } })}`,
        ctx,
      )
      return
    }

    let messageResponse = message

    const replyObject = getReplyParameters('private', {
      needsReply,
      messageId: ctx.message.message_id,
      isTopicMessage: ctx.message.is_topic_message,
      messageThreadId: ctx.message.message_thread_id,
      chatId: ctx.message.chat.id,
    })

    if (disableErrorCapture) {
      await ctxReply(messageResponse, ctx, replyObject)
      return
    }

    messageResponse = `${message} Error Id :${captureException(new Error(String(error) || message), { extra: { extraErrorInformation } })}`
    await ctxReply(messageResponse, ctx, replyObject)
  } catch (err) {
    await ctxReply(
      `An unexpected error occurred, please contact Sensay with the error id. ${captureException(new Error(JSON.stringify(err)), { extra: { extraErrorInformation } })}`,
      ctx,
    )
  }
}

//ignore for now
const elevenLabs = new ElevenLabsClient({
  apiKey: env.ELEVENLABS_API_KEY,
})

type SendVoiceRecordingArgs = {
  ctx: FileFlavor<Context & AutoChatActionFlavor>
  parsedMessage: ParsedTelegramChat
  messageText: string
  replicaUuid: string
  elevenlabsId: string | null
  replyParameters: ReplyParameterType<Methods<RawApi>>
  needsReply: boolean
  messageThreadId: number | undefined
  isTopicMessage: boolean | undefined
}

export async function sendVoiceRecording({
  ctx,
  parsedMessage,
  messageText,
  elevenlabsId,
  replicaUuid,
  replyParameters,
}: SendVoiceRecordingArgs) {
  if (!elevenlabsId) {
    throw new NonCriticalError('Please provide a valid Elevenlabs ID')
  }

  const completionResponse = await postV1ReplicasByReplicaUuidChatCompletionsTelegram({
    path: { replicaUUID: replicaUuid },
    body: {
      content: messageText,
      skip_chat_history: false,
      telegram_data: {
        chat_type: parsedMessage.type,
        chat_id: parsedMessage.chatId,
        user_id: parsedMessage.userId,
        username: parsedMessage.username || '',
        message_id: parsedMessage.messageId,
        message_thread_id: undefined,
      },
    },
  })

  const text = completionResponse.data?.content

  if (!text) {
    throw new NonCriticalError(
      'An error occurred while generating your response, please contact Sensay with the error id.',
    )
  }

  const textWithoutMarkdown = removeMd(
    text.replaceAll('\\n-', '').replaceAll('\\n', '').replaceAll('  ', ' '),
    {
      stripListLeaders: true,
      listUnicodeChar: '',
      gfm: true,
      useImgAltText: false,
    },
  )

  const audioStream = await elevenLabs.generate({
    voice: elevenlabsId,
    model_id: 'eleven_multilingual_v2',
    text: textWithoutMarkdown,
  })

  await ctx.api.sendVoice(parsedMessage.chatId, new InputFile(audioStream), replyParameters)
}
