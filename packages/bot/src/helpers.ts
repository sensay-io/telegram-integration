import { env } from 'node:process'
import type { RawApi } from 'grammy'
import type { Other as OtherApi } from 'grammy/out/core/api.js'
import type { Methods } from 'grammy/out/core/client.js'

import pkg from 'jsonwebtoken'
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

export function removeMentionIfNeeded(text: string, mention: string) {
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

  try {
    const messageParts = splitMessage(escapeMarkdown(message));
    for (const messagePart of messageParts) {
      await ctx.reply(messagePart, replyParameters)
      // Introduce a small delay to respect Telegram's rate limits
      await new Promise(resolve => setTimeout(resolve, 500))
    }

  } catch (e) {
    captureException(e as Error)
  }
}

// A robust function to split a long message into smaller, valid messages.
function splitMessage(message: string): string[] {
  const parts = [];
  let remainingText = message;
  const maxChars = 4096;

  while (remainingText.length > maxChars) {
    // Find the last period, question mark, or exclamation point before the limit.
    const splitIndex = remainingText.lastIndexOf('.', maxChars) ||
      remainingText.lastIndexOf('?', maxChars) ||
      remainingText.lastIndexOf('!', maxChars);

    // If no sentence-ending punctuation is found, split by the last space.
    let endIndex = splitIndex;
    if (endIndex === -1 || endIndex < maxChars * 0.75) {
      endIndex = remainingText.lastIndexOf(' ', maxChars);
    }

    // If no space is found, do a hard character split.
    if (endIndex === -1) {
      endIndex = maxChars;
    }

    // Add the chunk and update the remaining text.
    parts.push(remainingText.slice(0, endIndex));
    remainingText = remainingText.slice(endIndex).trim();
  }

  parts.push(remainingText);
  return parts;
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
