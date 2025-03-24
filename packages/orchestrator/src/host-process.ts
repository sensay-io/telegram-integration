import assert from "node:assert";
import cluster, { type Worker } from "node:cluster";
import { initializeBotClient } from "@sensay/bot";
import type { BotDefinition } from "./bot-definition";

export class HostProcess {
  private constructor(
    private readonly botDefinition: BotDefinition,
    private readonly worker: Worker,
  ) {}

  static async start() {
    assert(
      cluster.isWorker && cluster.worker,
      "Host process must be started in a worker",
    );
    assert(
      process.env.BOT_DEFINITION,
      "BOT_DEFINITION environment variable must be set",
    );

    // TODO: Validate the bot definition.
    const botDefinition = JSON.parse(
      process.env.BOT_DEFINITION,
    ) as BotDefinition;

    const worker = cluster.worker;
    worker.on("message", (message) => {
      if (message.type === "HEALTH_CHECK_REQUEST") {
        worker.send({ type: "HEALTH_CHECK_RESPONSE", status: "ok" });
        return;
      }

      throw new Error(`Unknown message type: ${message.type}`);
    });

    await initializeBotClient(botDefinition.token);

    return new HostProcess(botDefinition, worker);
  }
}
