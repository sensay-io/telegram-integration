import cluster from 'node:cluster'
import path from 'node:path'
import process from 'node:process'
import { BotClient, config } from '@sensay/telegram-bot'
import { Event, Signal } from '@sensay/telegram-shared'
import type { BotDefinition } from './bot-definition'
import { BotWorker } from './bot-worker'

/**
 * This file is used to start a child process for a bot.
 * By default, the node cluster module starts the same file from
 * which the main process was started.
 * Having a separate file for the worker process makes it easier
 * to use different environment variables for the bot process.
 */

if (config.isTesting) {
  const { setupMocks } = await import('./mocks/telegram')
  const { server } = setupMocks()
  server.listen()
}

const logger = config.logger.child({
  module: path.basename(import.meta.filename),
  replicaUUID: config.REPLICA_UUID,
  replicaSlug: config.REPLICA_SLUG,
  ownerID: config.OWNER_ID,
  PID: process.pid,
})

if (!cluster.isWorker || !cluster.worker) {
  await logger.fatal('Bot worker must be initialized from a worker process')
  process.exit(1)
}

const botDefinition = {
  token: config.BOT_TOKEN,
  replicaUUID: config.REPLICA_UUID,
  replicaSlug: config.REPLICA_SLUG,
  ownerID: config.OWNER_ID,
} satisfies BotDefinition

const botClient = new BotClient(
  botDefinition.token.getSensitiveValue(),
  botDefinition.replicaUUID,
  botDefinition.ownerID,
)

const botWorker = new BotWorker(botDefinition, botClient, cluster.worker, logger)

const shutdown = (signal: Signal) => {
  logger.trace(`${signal} received, shutting down bot worker`)
  botWorker
    .stop()
    .then(() => {
      logger.trace('Bot worker shut down successfully')
      process.exit(0)
    })
    .catch((error) => {
      logger.error(error, 'Error shutting down bot worker')
      process.exit(1)
    })
}

process.on(Signal.SIGINT, () => shutdown(Signal.SIGINT))
process.on(Signal.SIGTERM, () => shutdown(Signal.SIGTERM))
process.on(Event.UNCAUGHT_EXCEPTION, async (error) => {
  await logger.fatal(error, Event.UNCAUGHT_EXCEPTION)
  process.exit(1)
})
process.on(Event.UNHANDLED_REJECTION, async (error) => {
  await logger.fatal(error as Error, Event.UNHANDLED_REJECTION)
  process.exit(1)
})

await botWorker.start()

// The lack of default export makes Sentry bundler plugin unhappy
// https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/471
export default {}
