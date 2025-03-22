import assert from "node:assert";
import cluster, { type Worker } from "node:cluster";
import type { SensayAPI } from "./api";

type BotToken = string;

export class Orchestrator {
  constructor(
    private readonly api: SensayAPI,
    private readonly environmentTokens: BotToken[],
  ) {}

  async start() {
    assert(cluster.isPrimary, "Orchestrator must be running in primary mode");
    console.log("Starting orchestrator", process.env.NODE_ENV);

    // TODO: Use official Sensay API SDK
    // TODO: Implement retry logic
    const replicas = await this.api.getReplicas({ intergrations: "telegram" });
    // TODO: Load bots in parallel
    for (const replica of replicas) {
      const bots = await this.api.getTelegramBots({
        replicaUUID: replica.uuid,
      });
      for (const bot of bots) {
        this.startWorker(bot.token);
      }
    }

    for (const bot of this.environmentTokens) {
      this.startWorker(bot);
    }

    // TODO: Add health checks
  }

  shutdown() {
    assert(cluster.isPrimary, "Orchestrator must be running in primary mode");
    assert(cluster.workers);

    for (const worker of Object.values(cluster.workers)) {
      if (worker) {
        this.stopWorker(worker);
      }
    }
  }

  private startWorker(botToken: BotToken) {
    const worker = cluster.fork({
      token: botToken,
      NODE_ENV: process.env.NODE_ENV,
    });
    worker.on("exit", () => {
      // TODO: Add exponential backoff retries logic
      console.log(`Worker ${worker.id}:${botToken} exited, restarting...`);
      this.startWorker(botToken);
    });
  }

  private stopWorker(worker: Worker) {
    // TODO: Implement graceful shutdown
    // Force kill the worker
    worker.kill("SIGKILL");
  }
}
