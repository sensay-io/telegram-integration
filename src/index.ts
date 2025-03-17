import cluster from "node:cluster";
import http from "node:http";

const PORT = 3000;

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);

  for (let i = 0; i < 3; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(
      `Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`,
    );

    console.log("Starting a new worker");
    cluster.fork();
  });

  const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end(`Hello from Primary ${process.pid}\n`);

    if (cluster.workers) {
      try {
        const workerIds = Object.keys(cluster.workers);
        const workerId =
          workerIds[Math.floor(Math.random() * workerIds.length)];
        const worker = cluster.workers[workerId];

        if (!worker) return;

        try {
          worker.send("request");
          console.log(
            `Delegated background processing to Worker ${worker.process.pid}`,
          );
        } catch (error: unknown) {
          console.error(
            `Failed to send message to worker ${worker.process.pid}:`,
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      } catch (err) {
        console.error("Error delegating to worker:", err);
      }
    }
  });

  server.on("error", (err) => {
    console.error("Server error:", err);
  });

  server.listen(PORT, () => {
    console.log(`Primary server listening on port ${PORT}`);
  });

  process.on("SIGINT", () => {
    console.log("Shutting down server...");
    server.close(() => {
      console.log("Server shut down");
      process.exit(0);
    });
  });
}

if (!cluster.isPrimary) {
  console.log(`Worker ${process.pid} started`);

  process.on("message", (msg) => {
    try {
      if (msg === "request") {
        // Simulate CPU-intensive work
        let counter = 0;
        for (let i = 0; i < 1e7; i++) {
          counter++;
        }
        console.log(
          `Worker ${process.pid} processed request, counter: ${counter}`,
        );
      }
    } catch (err) {
      console.error(`Worker ${process.pid} error:`, err);
    }
  });

  process.on("error", (err) => {
    console.error(`Worker ${process.pid} error:`, err);
  });
}
