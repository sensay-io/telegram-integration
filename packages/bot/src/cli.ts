import { Signal, process } from '@sensay/telegram-shared'
import { BotClient } from './bot'
import { config } from './config'

const bot = new BotClient(
  config.logger,
  config.BOT_TOKEN.getSensitiveValue(),
  config.REPLICA_UUID,
  config.OWNER_UUID,
  config.ELEVENLABS_ID,
)

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
