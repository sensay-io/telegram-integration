import assert from "node:assert";
import cluster, { type Worker } from "node:cluster";
import { createHash } from "node:crypto";
import type { SensayAPI } from "./api";
import type { BotDefinition, BotID, BotToken } from "./bot-definition";

type BotState = {
  id: BotID;
  token: BotToken;
  worker: Worker;
  failedHealthChecks: number;
};

type HealthCheckRequest = {
  type: "HEALTH_CHECK_REQUEST";
};

type BotCommand = HealthCheckRequest;

type HealthCheckResponse = {
  type: "HEALTH_CHECK_RESPONSE";
  status: "ok" | "error";
};

type HealthCheckResult = {
  status: "ok" | "error";
};

type BotEvent = HealthCheckResponse;

type OrchestratorConfig = {
  api: SensayAPI;
  reconciliationIntervalMs: number;
  gracefulShutdownTimeoutMs: number;
  healthCheckTimeoutMs: number;
  maxFailedHealthChecks: number;
};

export class Orchestrator {
  private reconciliationIntervalId: NodeJS.Timeout | undefined;
  private botDefinitions: Map<BotID, BotDefinition> = new Map();
  private botStates: Map<BotID, BotState> = new Map();

  constructor(private readonly config: OrchestratorConfig) {}

  async start() {
    assert(cluster.isPrimary, "Orchestrator must be running in primary mode");
    console.log("Starting orchestrator", process.env.NODE_ENV);

    // TODO: Use official Sensay API SDK
    // TODO: Implement retry logic
    const replicas = await this.config.api.getReplicas({
      intergrations: "telegram",
    });

    // TODO: Load bots in parallel
    for (const replica of replicas) {
      const bots = await this.config.api.getTelegramBots({
        replicaUUID: replica.uuid,
      });

      for (const bot of bots) {
        // TODO: Decide how to infer bot ID from the token and replica UUID
        const botId = `${replica.uuid}:${createHash("sha256").update(bot.token).digest("hex")}`;
        const botDefinition: BotDefinition = {
          id: botId,
          token: bot.token,
          replicaUUID: replica.uuid,
        };
        this.botDefinitions.set(botDefinition.id, botDefinition);
        this.startBot(botDefinition);
      }
    }

    this.reconciliationIntervalId = setInterval(() => {
      this.reconcileBotStates();
    }, this.config.reconciliationIntervalMs);
  }

  async shutdown() {
    if (this.reconciliationIntervalId) {
      clearInterval(this.reconciliationIntervalId);
    }

    await Promise.all(
      Array.from(this.botStates.values()).map((state) =>
        this.stopWorker(state.worker),
      ),
    );
  }

  private async reconcileBotStates(): Promise<void> {
    await Promise.all(
      Array.from(this.botDefinitions.values()).map((definition) =>
        this.reconcileBotState(definition),
      ),
    );

    for (const state of this.botStates.values()) {
      if (!this.botDefinitions.has(state.id)) {
        this.botStates.delete(state.id);
      }
    }
  }

  private async reconcileBotState(definition: BotDefinition): Promise<void> {
    const state = this.botStates.get(definition.id);
    if (!state || state.worker.isDead()) {
      this.startBot(definition);
      return;
    }

    const healthCheckResult = await this.healthCheck(state);
    if (healthCheckResult.status === "error") {
      state.failedHealthChecks++;
      if (state.failedHealthChecks >= this.config.maxFailedHealthChecks) {
        await this.stopWorker(state.worker);
        this.startBot(definition);
      }
    } else {
      state.failedHealthChecks = 0;
    }
  }

  private async healthCheck(state: BotState): Promise<HealthCheckResult> {
    state.worker.send({
      type: "HEALTH_CHECK_REQUEST",
    } satisfies BotCommand);

    return new Promise<HealthCheckResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.worker.off("message", onHealthCheckResponse);

        reject(
          new Error(
            `Bot ${state.id} health check timed out after ${this.config.healthCheckTimeoutMs} ms`,
          ),
        );
      }, this.config.healthCheckTimeoutMs);

      const onHealthCheckResponse = (event: BotEvent) => {
        if (event.type === "HEALTH_CHECK_RESPONSE") {
          clearTimeout(timeout);

          state.worker.off("message", onHealthCheckResponse);

          resolve({ status: event.status });
        }

        reject(new Error(`Unknown event type: ${event.type}`));
      };

      state.worker.on("message", onHealthCheckResponse);
    });
  }

  private startBot(botDefinition: BotDefinition): void {
    const worker = cluster.fork({
      BOT_DEFINITION: JSON.stringify(botDefinition),
      NODE_ENV: process.env.NODE_ENV,
    });

    worker.on("exit", () => {
      // TODO: Send event to Sentry
      console.log(
        `Worker ${worker.id}:${botDefinition.id} exited, restarting...`,
      );

      // TODO: Add retries logic
      this.startBot(botDefinition);
    });

    this.botStates.set(botDefinition.id, {
      id: botDefinition.id,
      token: botDefinition.token,
      worker,
      failedHealthChecks: 0,
    });
  }

  private stopWorker(worker: Worker): Promise<void> {
    // SIGTERM should initiate a graceful shutdown
    worker.kill("SIGTERM");

    return new Promise<void>((resolve) => {
      worker.on("exit", () => {
        resolve();
      });

      // Give the worker a chance to exit gracefully
      setTimeout(() => {
        worker.kill("SIGKILL");
        resolve();
      }, this.config.gracefulShutdownTimeoutMs);
    });
  }
}
