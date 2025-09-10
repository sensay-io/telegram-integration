import { env } from 'node:process'
import type { RawApi } from 'grammy'
import type { Other as OtherApi } from 'grammy/out/core/api.js'
import type { Methods } from 'grammy/out/core/client.js'

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { codeBlock } from 'common-tags'
import pkg from 'jsonwebtoken'
import { z } from 'zod'
import { config } from './config'
import { PRIVATE_CHAT } from './constants'
import { sendError } from './responses'
import type { TelegramContext } from './types/responses'

// TODO: API-589 Refactor this file. Move functions to domain-specific files.

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, ParseError.prototype)
    this.name = 'ParseError'
  }
}

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
export async function isPlanValid(overridePlan: boolean, replicaUuid: string) {
  if (overridePlan) return true

  return await isLicenseActive(replicaUuid)
}

export const isLicenseActive = async (replicaUuid: string): Promise<boolean> => {
  const result = await fetch(`${env.SENSAY_URL}/api/license/telegram/${replicaUuid}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${createSignedToken()}`,
    },
  })

  if (!result.ok) {
    throw new Error('Failed to check license')
  }

  const data = (await result.json()) as { valid: boolean }
  return data.valid
}

const createSignedToken = () => {
  const payload = {
    sub: 'service-telegram-bots',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 5, // exp in 5 mins
  }

  if (!env.SENSAY_SECRET_KEY) {
    throw new Error('SENSAY_SECRET_KEY is not set')
  }

  const token = pkg.sign(payload, env.SENSAY_SECRET_KEY, {
    algorithm: 'HS256',
  })
  return token
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
  ctx: TelegramContext,
  replyParameters?: ReplyParameterType<'sendMessage', 'text' | 'chat_id'>,
) {
  return await ctx.reply(escapeMarkdown(message), replyParameters)
}

export async function voiceRequest(input: string) {
  try {
    const personaSystemMessage = codeBlock`You are tasked with analyzing input to identify mentions of voice messages. Your goals are to determine whether the input includes a request made via a voice message and filter out the reference of asking for a voice message.

 The object you will return will have this schema  {"voice":boolean, "text":string}.

Voice messages:
  - Check the provided context for any mention of voice messages.
  - Return an object with key 'voice' and 'text' indicating whether a voice message is discussed and the text without the reference of asking for a voice message.
  - Example:
    - If they say "what is the price of the car" you will return '{"voice":false , "text": "what is the price of the car"}'.
    - If they say "hey OpenAI, tell me what time it is with a voice message" you will return '{"voice":true, "text": "hey OpenAI, tell me what time it is"}'.


Pay attention to the context to correctly identify whether it is a voice message request. Return an object with key 'voice' and 'text' in that case.

Examples:
- If they say "hey OpenAI, tell me what time it is with a voice message" you will return '{"voice":true, "text": "hey OpenAI, tell me what time it is"}'.
- If they say "what is the price of the car" you will return '{"voice":false, "text": "what is the price of the car"}'.
- If they say "what's the price of the SNSY token" you will return '{"voice":false, "text": "what's the price of the SNSY token"}'.
- If they say "hey, send me a voice message with the price of the SNSY token" you will return '{"voice":true, "text": "hey, send the price of the SNSY token"}'.
 `

    const schema = z.object({
      voice: z.boolean(),
      text: z.string(),
    })

    const openai = createOpenAI({ apiKey: config.OPENAI_API_KEY.getSensitiveValue() })

    const {
      object: { voice, text },
    }: { object: { voice: boolean; text: string } } = await generateObject({
      model: openai('gpt-4o-mini'),
      system: personaSystemMessage,
      prompt: input,
      schema,
      temperature: 0.4,
      maxTokens: 250,
      mode: 'json',
    })

    return { voice_requested: voice, text }
  } catch (e) {
    captureException(e as Error)
    return { voice_requested: false, text: false }
  }
}

export function parse(ctx: TelegramContext): ParsedTelegramChat | undefined {
  const message = ctx.message
  if (!message) {
    config.logger.warn(ctx, 'Failed to process message: No message provided.')
    return
  }

  const messageText = message.text || message.caption
  const messageId = message.message_id
  const chatId = message.chat.id
  const messageThreadId = message.message_thread_id
  const isTopicMessage = message.is_topic_message

  const reply = message.reply_to_message
    ? {
      text: message.reply_to_message.text,
      from: message.reply_to_message.from?.username,
      voice: !!message.reply_to_message.voice,
      caption: message.reply_to_message.caption,
    }
    : undefined

  const isReplicaTagged = messageText?.includes(`@${ctx.me.username}`)
  const isReplyToReplica = hasUserRepliedToReplica(reply, ctx.me.username)
  const isPrivateChat = message.chat.type === PRIVATE_CHAT
  const needsReplyByReplica = isReplyToReplica || isReplicaTagged || isPrivateChat

  if (!messageText) {
    config.logger.warn(message, 'Failed to process message: No text or caption provided.')
    if (needsReplyByReplica) {
      sendError({ ctx, message: 'Caption is empty, please provide a message.' })
    }
    return
  }

  if (!messageId) {
    const response = 'Failed to process message: Unable to identify message id.'
    config.logger.warn(message, response)
    if (needsReplyByReplica) {
      sendError({ ctx, message: response })
    }
    return
  }

  if (!chatId) {
    const response = 'Failed to process message: Unable to identify chat.'
    config.logger.warn(message, response)
    if (needsReplyByReplica) {
      sendError({ ctx, message: response })
    }
    return
  }

  return {
    messageText: messageText,
    messageThreadId: messageThreadId,
    isTopicMessage: isTopicMessage,
    isPrivateChat: isPrivateChat,
    firstName: message.from.first_name,
    lastName: message.from.last_name,
    username: message.from.username,
    isBot: message.from.is_bot,
    userId: message.from.id,
    messageId: message.message_id,
    chatId: message.chat.id,
    type: message.chat.type,
    chatName: message.chat.title || message.chat.first_name || '',
    reply,
    needsReply: needsReplyByReplica,
  }
}

export type ParsedTelegramChat = {
  messageText: string
  messageThreadId: number | undefined
  isTopicMessage: boolean | undefined
  isPrivateChat: boolean | undefined
  firstName: string
  lastName?: string
  username?: string
  isBot: boolean | null
  userId: number
  messageId: number
  chatId: number
  type: 'private' | 'group' | 'supergroup'
  chatName: string
  reply?: {
    text: string | undefined
    from: string | undefined
    voice: boolean | undefined
    caption: string | undefined
  }
  needsReply: boolean
}

export const captureException = (error: Error, ...extra: unknown[]) => {
  return config.logger.error(error, undefined, ...extra)
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
  // biome-ignore lint: i need backticks to use \ without prettier deleting it
  const escapedText = text.replace(/_/g, `\\_`)

  // Then escape all other special characters
  return specialChars.reduce((escapedText, char) => {
    // biome-ignore lint: i need backticks to use \ without prettier deleting it
    const regex = new RegExp(`\${char}`, 'g')
    return escapedText.replace(regex, `\\${char}`)
  }, escapedText)
}
