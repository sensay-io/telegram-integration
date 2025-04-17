import process from 'node:process'
import { BotClient } from './bot'
import { env } from '@sensay/orchestrator/src/env'
import { Signal } from '@sensay/orchestrator/src/types/process'

if (!env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not defined')
}

if (!env.REPLICA_UUID) {
  throw new Error('REPLICA_UUID is not defined')
}

if (!env.OWNER_UUID) {
  throw new Error('OWNER_UUID is not defined')
}

const bot = new BotClient(env.BOT_TOKEN, env.REPLICA_UUID, env.OWNER_UUID)

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
