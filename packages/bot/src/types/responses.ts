import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { FileFlavor } from '@grammyjs/files'
import type { LanguageModelUsage } from 'ai'
import type { Context } from 'grammy'
import type { Methods, RawApi } from 'grammy/out/core/client'
import type { ParsedTelegramChat, ReplyParameterType } from '../helpers'

export type SendMessageArgs = {
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

export type SendErrorArgs = {
  message: string
  ctx: FileFlavor<Context & AutoChatActionFlavor>
  error?: unknown
  disableErrorCapture?: boolean
  extraErrorInformation?: { [key: string]: string }
}

export type SendVoiceRecordingArgs = {
  ctx: FileFlavor<Context & AutoChatActionFlavor>
  parsedMessage: ParsedTelegramChat
  messageText: string
  replicaUuid: string
  elevenlabsId: string | undefined
  replyParameters: ReplyParameterType<Methods<RawApi>>
  needsReply: boolean
  messageThreadId: number | undefined
  isTopicMessage: boolean | undefined
}
