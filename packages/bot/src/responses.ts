import {
  SensayApiError,
  postV1ReplicasByReplicaUuidChatCompletionsTelegram,
} from '@sensay/telegram-shared'
import { ElevenLabsClient } from 'elevenlabs'
import { InputFile } from 'grammy'
import removeMd from 'remove-markdown'
import { config } from './config'
import { ctxReply } from './helpers'
import { getReplyParameters } from './helpers'
import { captureException } from './helpers'
import type { SendErrorArgs, SendMessageArgs, SendVoiceRecordingArgs } from './types/responses'

export async function sendMessage({
  parsedMessage,
  needsReply,
  messageText,
  replicaUuid,
  messageThreadId,
  botUsername,
  ctx,
  replyParameters,
  imageURL,
}: SendMessageArgs) {
  const completionResponse = await postV1ReplicasByReplicaUuidChatCompletionsTelegram({
    path: { replicaUUID: replicaUuid },
    headers: {
      'X-USER-ID': ctx.from?.id.toString() || '',
      'X-USER-ID-TYPE': 'telegram',
    },
    body: {
      content: messageText,
      imageURL,
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
    throw SensayApiError.fromResponse(completionResponse.response)
  }

  const mentionName = `@${parsedMessage.username}`
  if (botUsername && !needsReply) fullResponse = `${mentionName} ${fullResponse}`

  try {
    await ctxReply(fullResponse, ctx, replyParameters)
  } catch (err) {
    await sendError({
      ctx,
      error: err,
      extraErrorInformation: {
        replicaUuid,
        userMessage: messageText,
        replicaResponse: fullResponse,
      },
    })
  }
}

export const sendError = async ({ ctx, error, message, extraErrorInformation }: SendErrorArgs) => {
  let errorMessage = message ?? 'Sorry, I am experiencing difficulties at the moment'
  if (error) {
    const sentryErrorID = captureException(error as Error, { extra: { extraErrorInformation } })
    errorMessage += ` (Error ID: ${sentryErrorID})`
  }

  try {
    if (!ctx.message) {
      await ctxReply(errorMessage, ctx)
      return
    }

    const replyObject = getReplyParameters('private', {
      needsReply: true,
      messageId: ctx.message.message_id,
      isTopicMessage: ctx.message.is_topic_message,
      messageThreadId: ctx.message.message_thread_id,
      chatId: ctx.message.chat.id,
    })

    await ctxReply(errorMessage, ctx, replyObject)
  } catch (err) {
    await ctxReply(errorMessage, ctx)
  }
}

// ignore for now
const elevenLabs = new ElevenLabsClient({
  apiKey: config.ELEVENLABS_API_KEY.getSensitiveValue(),
})

export async function sendVoiceRecording({
  ctx,
  parsedMessage,
  messageText,
  elevenlabsId,
  replicaUuid,
  replyParameters,
}: SendVoiceRecordingArgs) {
  if (!elevenlabsId) {
    await sendError({
      ctx,
      // User might not be the owner of the bot and woudln't know what is Elevenlabs and where to set it.
      // Let's capture the error in Sentry and send the default error message.
      error: new Error(`Elevenlabs ID is not set for replica ${replicaUuid}`),
    })
    return
  }

  const completionResponse = await postV1ReplicasByReplicaUuidChatCompletionsTelegram({
    path: { replicaUUID: replicaUuid },
    headers: {
      'X-USER-ID': ctx.from?.id.toString() || '',
      'X-USER-ID-TYPE': 'telegram',
    },
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
    throw SensayApiError.fromResponse(completionResponse.response)
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
