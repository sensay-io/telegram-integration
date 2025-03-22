import assert from "node:assert";
import cluster from "node:cluster";
import { initializeBotClient } from "@sensay/bot";
import { FakeSensayAPI } from "./api";
import { config } from "./config";
import { Orchestrator } from "./orchestrator";

if (cluster.isPrimary) {
  const api = new FakeSensayAPI(config.sensayApiUrl, config.sensayApiKey);
  const orchestrator = new Orchestrator(api, config.botTokens);
  orchestrator.start();
}

if (cluster.isWorker) {
  const token = process.env.token;
  assert(token, "Token not found in worker environment");
  initializeBotClient(token);
}
