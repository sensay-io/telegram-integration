import cluster from 'node:cluster'
import path from 'node:path'
import { OrchestratorAPI } from './api/orchestrator_api'
import { config } from './config/cluster'
import { Orchestrator } from './orchestrator'
import { FakeSensayAPIClient, SensayAPIClient } from './sensay_api'
import { Event, Signal, process } from './types/process'

const logger = config.logger.child({
  module: path.basename(import.meta.filename),
})

if (!cluster.isPrimary) {
  logger.fatal('This file must be run in a primary process')
  process.exit(1)
}

cluster.setupPrimary({
  exec: path.resolve(import.meta.dirname, 'start_worker.js'),
})

process.on(Signal.SIGINT, () => shutdown(Signal.SIGINT))
process.on(Signal.SIGTERM, () => shutdown(Signal.SIGTERM))
// Let it crash. The orchestrator process itself can be restarted by an external system like PM2 or systemd.
// When there are a lot of bots running, it might be better to let orchestrator keep running,
// and reconcile the state. It's not clear yet which approach is better. We need to test it based on real data.
process.on(Event.UNCAUGHT_EXCEPTION, (err) => {
  logger.error(err, Event.UNCAUGHT_EXCEPTION)
  process.exit(1)
})
process.on(Event.UNHANDLED_REJECTION, (err) => {
  logger.error(err, Event.UNHANDLED_REJECTION)
  process.exit(1)
})

const shutdown = (reason: Signal) => {
  logger.trace(`Shutting down orchestrator: ${reason}`)

  orchestratorAPI.stop().catch((err) => {
    logger.warn(err, 'Error shutting down API app')
  })

  orchestrator
    .shutdown()
    .then(() => {
      logger.trace('Orchestrator shut down successfully')
      process.exit(0)
    })
    .catch((err) => {
      logger.error(err, 'Error shutting down orchestrator')
      process.exit(1)
    })

  // bots are shutting down in parallel, but the total shutdown timeout might exceed
  const gracefulShutdownTimeout = config.GRACEFUL_SHUTDOWN_TIMEOUT_MS * 2

  setTimeout(() => {
    logger.warn(`Graceful shutdown timeout ${gracefulShutdownTimeout} ms`)
    process.exit(1)
  }, gracefulShutdownTimeout)
}

const api =
  config.isTesting || config.isChaos
    ? new FakeSensayAPIClient()
    : new SensayAPIClient(config.SENSAY_API_URL, config.SENSAY_API_KEY.getSensitiveValue())

const orchestrator = new Orchestrator({
  api,
  logger,
  telegramServiceName: config.TELEGRAM_SERVICE_NAME,
  reloadBotsIntervalMs: config.RELOAD_BOTS_INTERVAL_MS,
  printBotsStatusIntervalMs: config.PRINT_BOTS_STATUS_INTERVAL_MS,
  gracefulShutdownTimeoutMs: config.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
  healthCheckTimeoutMs: config.HEALTH_CHECK_TIMEOUT_MS,
  healthCheckIntervalMs: config.HEALTH_CHECK_INTERVAL_MS,
  maxFailedStartAttempts: config.MAX_FAILED_START_ATTEMPTS,
})

orchestrator.start()

const orchestratorAPI = new OrchestratorAPI(orchestrator, {
  logger,
  httpPort: config.HTTP_PORT,
  authToken: config.ORCHESTRATOR_API_KEY.getSensitiveValue(),
})

orchestratorAPI.start()

// The lack of any exports makes Sentry bundler plugin unhappy
// https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/471
export default {}
