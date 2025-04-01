import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { FileFlavor } from '@grammyjs/files'
import type { Context, RawApi } from 'grammy'
import type { Other as OtherApi } from 'grammy/out/core/api.js'

import { openai } from '@ai-sdk/openai'
import { type LanguageModelUsage, generateObject } from 'ai'
import { codeBlock } from 'common-tags'
import type { Methods } from 'grammy/out/core/client.js'
import { z } from 'zod'

export function removeMentionIfNeeded(text: string, mention: string, reply?: boolean) {
  let messageText = text

  const mentionWithSymbol = `@${mention}`

  if (mentionWithSymbol) {
    const regex = new RegExp(mention, 'g')
    return messageText.replace(regex, '').trim()
  }

  if (!reply) messageText = messageText.split(' ').slice(1).join(' ')

  return messageText
}

export const requiresReply = (chat: ParsedTelegramChat, mention: string) => {
  if (!chat.reply) return false

  const hasReplyContent = !!(chat.reply.text || chat.reply.voice || chat.reply.caption)

  const isReplyFromMentionedUser = chat.reply.from === mention

  return hasReplyContent && isReplyFromMentionedUser
}

//ignore for now
export async function isPlanValid(overridePlan: boolean, userId: string) {
  if (overridePlan) return true

  // const isAllowed = await isAllowedToUseFeature({ userId }, 'Telegram Copilot')
  return true
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

function escapeMarkdown(text: string): string {
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
  // biome-ignore lint: i need backticks to use \ without prettier deleting it
  const escapedText = text.replace(/_/g, `\\_`)

  return specialChars.reduce((escapedText, char) => {
    // biome-ignore lint: i need backticks to use \ without prettier deleting it
    const regex = new RegExp(`\${char}`, 'g')
    return escapedText.replace(regex, `\\${char}`)
  }, escapedText)
}

export async function ctxReply(
  message: string,
  ctx: FileFlavor<Context & AutoChatActionFlavor>,
  replyParameters?: ReplyParameterType<'sendMessage', 'text' | 'chat_id'>,
) {
  return await ctx.reply(escapeMarkdown(message), replyParameters)
}

export function calculateTokenCost(tokenUsage: LanguageModelUsage) {
  const { promptTokens, completionTokens } = tokenUsage

  const promptCostPerMillion = 5.0
  const completionCostPerMillion = 15.0

  const costForPromptTokens = (promptTokens / 1000000) * promptCostPerMillion
  const costForCompletionTokens = (completionTokens / 1000000) * completionCostPerMillion

  const totalCost = costForPromptTokens + costForCompletionTokens

  return totalCost
}

export async function isUserAskingForSnsyTokenOrVoiceRecording(input: string) {
  const personaSystemMessage = codeBlock`You are tasked with analyzing input to identify mentions of voice messages and SNSY token prices. Your goals are to determine whether the input includes a request made via a voice message and whether it discusses the price of the SNSY token.

 The object you will return will have this schema  {"voice":boolean, "token":boolean}.

1. For voice messages:
  - Check the provided context for any mention of voice messages.
  - Return an object with key 'voice' indicating whether a voice message is discussed.
  - Example:
    - If they say "what is the price of the car" you will return '{"voice":false}'.
    - If they say "hey OpenAI, tell me what time it is with a voice message" you will return '{"voice":true}'.

2. For SNSY token prices:
  - Check the provided context for any mention of token prices, specifically focusing on the SNSY token.
  - Return an object with key 'token' indicating whether the SNSY token price is discussed.
  - Example:
    - If they ask you in general what is the price and nothing else specific you will return '{"token":true}'.
    - If they are not talking about the price you will return '{"token":false}'.

Pay attention to the context to correctly identify whether a voice message or SNSY token price is being discussed. Return an object with both keys 'voice' and 'token' to indicate the presence of each.

Examples:
- If they say "hey OpenAI, tell me what time it is with a voice message" you will return '{"voice":true, "token":false}'.
- If they say "what is the price of the car" you will return '{"voice":false, "token":false}'.
- If they say "what's the price of the SNSY token" you will return '{"voice":false, "token":true}'.
- If they say "hey OpenAI, send me a voice message with the price of the SNSY token" you will return '{"voice":true, "token":true}'.
 `

  const schema = z.object({
    token: z.boolean(),
    voice: z.boolean(),
  })

  const {
    object,
    usage,
  }: { object: { token: boolean; voice: boolean }; usage: LanguageModelUsage } =
    await generateObject({
      model: openai('gpt-4o-mini'),
      system: personaSystemMessage,
      prompt: input,
      schema,
      temperature: 0.4,
      maxTokens: 250,
      mode: 'json',
    })

  return { ...object, usage: usage }
}

import type { Message, Update } from '@grammyjs/types'

export function parse(message: Message & Update.NonChannel): ParsedTelegramChat {
  const reply = message.reply_to_message
    ? {
        text: message.reply_to_message.text,
        from: message.reply_to_message.from?.username,
        voice: !!message.reply_to_message.voice,
        caption: message.reply_to_message.caption,
      }
    : undefined

  return {
    first_name: message.from.first_name,
    last_name: message.from.last_name,
    username: message.from.username,
    is_bot: message.from.is_bot,
    user_id: message.from.id,
    message_id: message.message_id,
    chat_id: message.chat.id,
    type: message.chat.type,
    reply,
  }
}

export type ParsedTelegramChat = {
  first_name: string
  last_name?: string
  username?: string
  is_bot: boolean | null
  user_id: number | null
  message_id: number
  chat_id: number
  type: string
  reply:
    | {
        text: string | undefined
        from: string | undefined
        voice: boolean | undefined
        caption: string | undefined
      }
    | undefined
}
