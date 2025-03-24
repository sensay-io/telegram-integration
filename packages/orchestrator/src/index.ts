import cluster from "node:cluster";
import { FakeSensayAPI } from "./api";
import { config } from "./config";
import { HostProcess } from "./host-process";
import { Orchestrator } from "./orchestrator";

if (cluster.isPrimary) {
  const api = new FakeSensayAPI(config.sensayApiUrl, config.sensayApiKey);
  const orchestrator = new Orchestrator({
    api,
    reconciliationIntervalMs: 1000,
    gracefulShutdownTimeoutMs: 1000,
    healthCheckTimeoutMs: 1000,
    maxFailedHealthChecks: 3,
  });
  orchestrator.start();
}

if (cluster.isWorker) {
  await HostProcess.start();
}
