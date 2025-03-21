import assert from "node:assert";
import cluster from "node:cluster";
import { initializeBotClient } from "@sensay/bot";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

assert(process.env.BOT_TOKENS, "BOT_TOKENS is not defined");

const bots: string[] = process.env.BOT_TOKENS.split(",");

if (cluster.isPrimary) {
  console.log("Starting orchestrator");

  const workerBotTokens: Map<number, string> = new Map();

  // Map a worker to a bot
  bots.forEach((bot, _) => {
    const worker = cluster.fork({ token: bot });
    workerBotTokens.set(worker.id, bot);
  });
}

if (cluster.isWorker) {
  const token = process.env.token;
  if (!token) throw new Error("Token not found in worker environment");

  initializeBotClient(token);
}
