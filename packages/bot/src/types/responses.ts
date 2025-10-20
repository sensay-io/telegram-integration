import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { FileFlavor } from '@grammyjs/files'
import type { LanguageModelUsage } from 'ai'
import type { Context } from 'grammy'
import type { Methods, RawApi } from 'grammy/out/core/client'
import type { ParsedTelegramChat, ReplyParameterType } from '../helpers'

export type TelegramContext = FileFlavor<Context & AutoChatActionFlavor>

export type SendMessageArgs = {
  parsedMessage: ParsedTelegramChat
  needsReply: boolean
  messageText: string
  replicaUuid: string
  messageThreadId: number | undefined
  botUsername: string
  ctx: TelegramContext
  replyParameters: ReplyParameterType<Methods<RawApi>>
  isTopicMessage?: boolean
  usage?: LanguageModelUsage | undefined
  imageURL?: string
}

export type SendErrorArgs = {
  ctx: TelegramContext
  error?: unknown
  message?: string
  extraErrorInformation?: Record<string, string | undefined>
}

export type SendVoiceRecordingArgs = {
  ctx: TelegramContext
  parsedMessage: ParsedTelegramChat
  messageText: string
  replicaUuid: string
  replyParameters: ReplyParameterType<Methods<RawApi>>
  needsReply: boolean
  messageThreadId: number | undefined
  isTopicMessage: boolean | undefined
}
