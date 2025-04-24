import { postV1ReplicasByReplicaUuidChatCompletionsTelegram } from '@sensay/telegram-shared'
import { ElevenLabsClient } from 'elevenlabs'
import { InputFile } from 'grammy'
import removeMd from 'remove-markdown'
import { NonCriticalError } from './bot-actions'
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

export const sendError = async ({
  message,
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
      needsReply: true,
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
    throw new NonCriticalError('Please provide a valid Elevenlabs ID')
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
