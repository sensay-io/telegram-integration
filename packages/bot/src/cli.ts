import process from 'node:process'
import { BotClient } from './bot'
import { env } from './env'

if (!env.BOT_TOKEN) { // TODO: MICHELE: unify with env from orchestrator (move to common?)
  throw new Error('BOT_TOKEN is not defined')
}

if (!env.REPLICA_UUID) { // TODO: MICHELE: unify with env from orchestrator (move to common?)
  throw new Error('REPLICA_UUID is not defined')
}

if (!env.OWNER_UUID) { // TODO: MICHELE: unify with env from orchestrator (move to common?)
  throw new Error('OWNER_UUID is not defined')
}

const bot = new BotClient(env.BOT_TOKEN, env.REPLICA_UUID, env.OWNER_UUID)

// TODO: MICHELE: Needs testing

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

process.on('SIGINT', stopBot) // TODO: MICHELE: magic strings, if reused
process.on('SIGTERM', stopBot) // TODO: MICHELE: magic strings, if reused

bot.start()
