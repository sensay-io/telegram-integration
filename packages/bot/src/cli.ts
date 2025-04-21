import process from 'node:process'
import { Signal } from '@sensay/telegram-orchestrator/src/types/process'
import { BotClient } from './bot'

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not defined')
}

if (!process.env.REPLICA_UUID) {
  throw new Error('REPLICA_UUID is not defined')
}

if (!process.env.OWNER_ID) {
  throw new Error('OWNER_ID is not defined')
}

const bot = new BotClient(process.env.BOT_TOKEN, process.env.REPLICA_UUID, process.env.OWNER_ID)

const stopBot = () => {
  bot
    .stop()
    .catch((err: Error) => {
      console.error('Failed to stop bot', err)
      process.exit(1)
    })
    .finally(() => {
      process.exit(0)
    })
}

process.on(Signal.SIGINT, stopBot)
process.on(Signal.SIGTERM, stopBot)

bot.start()
