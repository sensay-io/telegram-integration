import {
  SensayApiError,
  postV1ReplicasByReplicaUuidChatCompletionsTelegram,
} from '@sensay/telegram-shared'
import { ctxReply } from './helpers'
import { getReplyParameters } from './helpers'
import { captureException } from './helpers'
import type {
  SendErrorArgs,
  SendMessageArgs,
  TelegramContext,
} from './types/responses'

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
        chat_name: parsedMessage.chatName,
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
  let errorMessage = message ?? 'Sorry, I am experiencing difficulties at the moment.'
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

export async function sendSubscriptionRenewMessage(ctx: TelegramContext) {
  await sendError({
    ctx,
    message:
      'Please renew your subscription. https://www.sensay.io/pricing to visit Sensay pricing.',
  })
}
