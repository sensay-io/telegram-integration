import assert from 'node:assert'
import process from 'node:process'
import dotenv from 'dotenv'
import { BotClient } from './bot'

const dotenvOutput = dotenv.config({ path: '.env.local' })
if (dotenvOutput.error) {
  throw dotenvOutput.error
}

assert(dotenvOutput.parsed)
const env = dotenvOutput.parsed

if (!env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is not defined')
}

const bot = new BotClient(env.BOT_TOKEN, env.REPLICA_UUID)

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

process.on('SIGINT', stopBot)
process.on('SIGTERM', stopBot)

bot.start()
