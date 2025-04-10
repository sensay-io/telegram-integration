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

const captureException = (error: Error, extra?: unknown) => {
  console.error(error, extra)
}

type SendMessageArgs = {
  parsedMessage: ParsedTelegramChat
  needsReply: boolean
  messageText: string
  replicaUuid: string
  requestedToken: boolean
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
  requestedToken,
  messageThreadId,
  botUsername,
  ctx,
  usage,
  replyParameters,
  isTopicMessage = false,
}: SendMessageArgs) {
  if (requestedToken) {
    await priceTemplate(ctx, messageThreadId, isTopicMessage)
    return
  }

  const completionResponse = await postV1ReplicasByReplicaUuidChatCompletionsTelegram({
    path: { replicaUUID: replicaUuid },
    body: {
      content: messageText,
      skip_chat_history: false,
      telegram_data: {
        chat_type: parsedMessage.type,
        chat_id: parsedMessage.chat_id,
        user_id: parsedMessage.user_id!,
        username: parsedMessage.username || '',
        message_id: parsedMessage.message_id,
        message_thread_id: messageThreadId,
      },
    },
  })

  let fullResponse = completionResponse.data?.content

  if (!fullResponse) {
    await sendError({
      message:
        'An error occurred while generating your response, please contact Sensay with the error id.',
      needsReply,
      messageId: parsedMessage.message_id,
      chatId: parsedMessage.chat_id,
      messageThreadId,
      ctx,
      isTopicMessage,
    })
    return
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
      messageId: parsedMessage.message_id,
      chatId: parsedMessage.chat_id,
      messageThreadId,
      isTopicMessage,
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
  messageId: number
  chatId: number
  messageThreadId: number | undefined
  ctx: FileFlavor<Context & AutoChatActionFlavor>
  isTopicMessage: boolean | undefined
  error?: unknown
  disableErrorCapture?: boolean
  extraErrorInformation?: { [key: string]: string }
}

export const sendError = async ({
  message,
  needsReply,
  messageId,
  chatId,
  messageThreadId,
  ctx,
  error,
  isTopicMessage,
  disableErrorCapture,
  extraErrorInformation,
}: SendErrorArgs) => {
  try {
    let messageResponse = message

    const replyObject = getReplyParameters('private', {
      needsReply,
      messageId,
      isTopicMessage,
      messageThreadId,
      chatId,
    })

    if (disableErrorCapture) {
      await ctxReply(messageResponse, ctx, replyObject)
      return
    }

    messageResponse = `${message} Error Id :${captureException(new Error(String(error) || message), { extra: { extraErrorInformation } })}`
    await ctxReply(messageResponse, ctx, replyObject)
  } catch (err) {
    captureException(new Error(JSON.stringify(err)))
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
  elevenlabsId: string
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
  messageThreadId,
  isTopicMessage,
  replyParameters,
  needsReply,
}: SendVoiceRecordingArgs) {
  if (!elevenlabsId) {
    await ctxReply('Please provide a valid Elevenlabs ID', ctx, replyParameters)
    return
  }

  const completionResponse = await postV1ReplicasByReplicaUuidChatCompletionsTelegram({
    path: { replicaUUID: replicaUuid },
    body: {
      content: messageText,
      skip_chat_history: false,
      telegram_data: {
        chat_type: parsedMessage.type,
        chat_id: parsedMessage.chat_id,
        user_id: parsedMessage.user_id!,
        username: parsedMessage.username || '',
        message_id: parsedMessage.message_id,
        message_thread_id: undefined,
      },
    },
  })

  const text = completionResponse.data?.content

  if (!text) {
    await sendError({
      message:
        'An error occurred while generating your response, please contact Sensay with the error id.',
      needsReply,
      messageId: parsedMessage.message_id,
      chatId: parsedMessage.chat_id,
      messageThreadId,
      ctx,
      isTopicMessage,
    })
    return
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

  await ctx.api.sendVoice(
    parsedMessage.chat_id as number,
    new InputFile(audioStream),
    replyParameters,
  )
}

interface DexScreenerResponse {
  pairs: Array<{
    priceUsd: string
    liquidity: { usd: number }
    volume: { h24: number }
  }>
}

async function priceTemplate(
  ctx: FileFlavor<Context & AutoChatActionFlavor>,
  messageThreadId: number | undefined,
  isTopicMessage: boolean,
) {
  const dexScreenerUrl =
    'https://api.dexscreener.io/latest/dex/search?q=0x6c1bcf1b99d9f0819459dad661795802d232437e'

  const response = await fetch(dexScreenerUrl, {
    method: 'GET',
  })

  const imageUrl = 'https://www.snsy.ai/_next/image?url=%2Fassets%2Fbackground.png&w=2048&q=75'

  const token = (await response.json()) as DexScreenerResponse
  const price = token.pairs[0].priceUsd
  const liquidity = token.pairs[0].liquidity.usd
  const volume = token.pairs[0].volume.h24

  return await ctx.replyWithPhoto(imageUrl, {
    caption: `
     Sensay Coin $SNSY ⛩✨

🌕 Price:<b> ${price}</b>
💵 Liquidity:<b> ${liquidity}$</b>
📈 Volume:<b> ${volume}$</b>

📃 Contract:<a href='https://etherscan.io/address/0x82a605D6D9114F4Ad6D5Ee461027477EeED31E34'> 0x82a605D6D9114F4Ad6D5Ee461027477EeED31E34</a>
🔐 Staking:<a href="https://app.snsy.ai/"> Staking</a>
💰 Vesting:<a href='https://claim.snsy.ai/'> Claim Tokens</a>

💻 <a href="https://www.snsy.ai/">Website</a> | 🔄 <a href="https://app.uniswap.org/explore/tokens/ethereum/0x82a605d6d9114f4ad6d5ee461027477eeed31e34">Uniswap</a> | 💱 <a href="https://www.mexc.com/exchange/SNSY_USDT">MEXC</a>

`,
    parse_mode: 'HTML',
    ...(isTopicMessage && { message_thread_id: messageThreadId }),
  })
}
