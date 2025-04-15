import process from 'node:process'
import { BotClient } from './bot'
import { env } from './env'

if (!env.BOT_TOKEN) { // TODO: MICHELE: only 1 env checked but more passed to the constructor of BotClient with no default?
  throw new Error('BOT_TOKEN is not defined')
}

const bot = new BotClient(env.BOT_TOKEN, env.REPLICA_UUID, env.BOT_VERSION)

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
