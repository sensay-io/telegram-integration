import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { FileFlavor } from '@grammyjs/files'
import type { Context, RawApi } from 'grammy'
import type { Other as OtherApi } from 'grammy/out/core/api.js'
import type { Message, Update } from '@grammyjs/types'

import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { codeBlock } from 'common-tags'
import type { Methods } from 'grammy/out/core/client.js'
import { z } from 'zod'
import { NonCriticalError } from './bot-actions'

export function removeMentionIfNeeded(text: string, mention: string, reply?: boolean) {
  const mentionWithSymbol = `@${mention}`

  if (mention) {
    const regex = new RegExp(mentionWithSymbol, 'g')
    return text.replace(regex, '').replace(/\s+/g, ' ').trim()
  }
  return text
}

export const hasUserRepliedToReplica = (reply: ParsedTelegramChat['reply'], mention: string) => {
  if (!reply) return false

  const hasReplyContent = !!(reply.text || reply.voice || reply.caption)

  const isReplyFromMentionedUser = reply.from === mention

  return hasReplyContent && isReplyFromMentionedUser
}

// TODO: check from www the plan  // TODO: MICHELE: WWW forbidden dependency? Should www be the one with the responsibiity? To be discussed as things might change. Michele needs to talk with Aleksander
export function isPlanValid(overridePlan: boolean, userId: string) {
  if (overridePlan) return true

  const isAllowed = true

  if (!isAllowed) {
    throw new NonCriticalError(
      'Please renew your subscription. https://www.sensay.io/pricing to visit Sensay pricing.',
    )
  }
  return isAllowed
}

export type ReplyParameterType<M extends Methods<RawApi>, X extends string = never> = OtherApi<
  RawApi,
  M,
  X
>

export function getReplyParameters(
  chatType: 'group' | 'private',
  parameters: {
    needsReply: boolean
    messageId: number
    messageThreadId: number | undefined
    chatId: number
    isTopicMessage: boolean | undefined
  },
): ReplyParameterType<'sendMessage', 'chat_id' | 'text'> {
  const { messageId, messageThreadId, chatId, needsReply } = parameters

  if (needsReply) {
    return {
      reply_parameters: { chat_id: chatId, message_id: messageId },
      parse_mode: 'Markdown',
    }
  }

  if (chatType === 'group' && parameters.isTopicMessage)
    return { message_thread_id: messageThreadId, parse_mode: 'Markdown' }

  return { parse_mode: 'Markdown' }
}

export async function ctxReply(
  message: string,
  ctx: FileFlavor<Context & AutoChatActionFlavor>,
  replyParameters?: ReplyParameterType<'sendMessage', 'text' | 'chat_id'>,
) {
  return await ctx.reply(escapeMarkdown(message), replyParameters)
}

export async function voiceRequest(input: string) {
  const personaSystemMessage = codeBlock`You are tasked with analyzing input to identify mentions of voice messages. Your goals are to determine whether the input includes a request made via a voice message.

 The object you will return will have this schema  {"voice":boolean}.

Voice messages:
  - Check the provided context for any mention of voice messages.
  - Return an object with key 'voice' indicating whether a voice message is discussed.
  - Example:
    - If they say "what is the price of the car" you will return '{"voice":false}'.
    - If they say "hey OpenAI, tell me what time it is with a voice message" you will return '{"voice":true}'.


Pay attention to the context to correctly identify whether it is a voice message request. Return an object with key 'voice' in that case.

Examples:
- If they say "hey OpenAI, tell me what time it is with a voice message" you will return '{"voice":true}'.
- If they say "what is the price of the car" you will return '{"voice":false}'.
- If they say "what's the price of the SNSY token" you will return '{"voice":false}'.
- If they say "hey, send me a voice message with the price of the SNSY token" you will return '{"voice":true}'.
 `

  const schema = z.object({
    voice: z.boolean(),
  })

  const { object }: { object: { voice: boolean } } = await generateObject({
    model: openai('gpt-4o-mini'),
    system: personaSystemMessage,
    prompt: input,
    schema,
    temperature: 0.4,
    maxTokens: 250,
    mode: 'json',
  })

  return { ...object }
}

export function parse(message: Message & Update.NonChannel): ParsedTelegramChat | undefined {
  const messageText = message.text || message.caption
  const messageId = message.message_id
  const chatId = message.chat.id
  const messageThreadId = message.message_thread_id
  const isTopicMessage = message.is_topic_message

  if (!messageText) {
    throw new NonCriticalError('No message was provided')
  }

  if (!chatId) {
    throw new NonCriticalError('Failed to process message: Unable to identify chat.')
  }

  if (!messageId) {
    throw new NonCriticalError('Failed to process message: Unable to identify message id.')
  }

  const reply = message.reply_to_message
    ? {
        text: message.reply_to_message.text,
        from: message.reply_to_message.from?.username,
        voice: !!message.reply_to_message.voice,
        caption: message.reply_to_message.caption,
      }
    : undefined

  return {
    messageText: messageText,
    messageThreadId: messageThreadId,
    isTopicMessage: isTopicMessage,
    firstName: message.from.first_name,
    lastName: message.from.last_name,
    username: message.from.username,
    isBot: message.from.is_bot,
    userId: message.from.id,
    messageId: message.message_id,
    chatId: message.chat.id,
    type: message.chat.type,
    reply,
  }
}

export type ParsedTelegramChat = {
  messageText: string
  messageThreadId: number | undefined
  isTopicMessage: boolean | undefined
  firstName: string
  lastName?: string
  username?: string
  isBot: boolean | null
  userId: number
  messageId: number
  chatId: number
  type: 'private' | 'group' | 'supergroup'
  reply?: {
    text: string | undefined
    from: string | undefined
    voice: boolean | undefined
    caption: string | undefined
  }
}

export const captureException = (error: Error, extra?: unknown) => {
  console.error(error, extra)
}

export function escapeMarkdown(text: string): string {
  const specialChars = [
    '*',
    '[',
    ']',
    '(',
    ')',
    '~',
    '`',
    '>',
    '#',
    '+',
    '-',
    '=',
    '|',
    '{',
    '}',
    '.',
    '!',
  ]

  // First escape underscores
  const escapedText = text.replace(/_/g, '\\_')

  // Then escape all other special characters
  return specialChars.reduce((escapedText, char) => {
    const regex = new RegExp(`\\${char}`, 'g')
    return escapedText.replace(regex, `\\${char}`)
  }, escapedText)
}
