import assert from "node:assert";
import cluster, { type Worker } from "node:cluster";

type BotToken = string;

export class Orchestrator {
  constructor(private readonly botTokens: BotToken[]) {}

  start() {
    assert(cluster.isPrimary, "Orchestrator must be running in primary mode");

    // TODO: Load bot tokens from the API

    for (const bot of this.botTokens) {
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
    const worker = cluster.fork({ token: botToken });
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
