import process from 'node:process'
import { BotClient } from './bot'
import { Signal } from '@sensay/orchestrator/src/types/process'

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not defined')
}

if (!process.env.REPLICA_UUID) {
  throw new Error('REPLICA_UUID is not defined')
}

if (!process.env.OWNER_UUID) {
  throw new Error('OWNER_UUID is not defined')
}

const bot = new BotClient(process.env.BOT_TOKEN, process.env.REPLICA_UUID, process.env.OWNER_UUID)

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
