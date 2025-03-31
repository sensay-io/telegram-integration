# Orchestrator

## Overview
The Orchestrator package is part of the Sensay Telegram Integration project. It is a service designed to run Telegram bots in cluster mode. It loads the bot definitions from the Sensay API and starts the bots in separate worker processes. It also provides a HTTP API for managing the bots.

## Key Features
- Cluster management of Telegram bots
- Health monitoring and automatic restart of failed bots
- Graceful termination of bot processes
- API endpoints for adding/removing bot instances
- Configurable health check intervals and timeouts

## Prerequisites
- TypeScript
- Node.js (version specified in package.json)
- npm
- Bun (used for development)

## Installation
```bash
# Install dependencies
npm install
```

## Environment Variables
Copy the example environment file to create your local configuration:
```bash
cp .env.example .env.local
```

Required environment variables:
- `NODE_ENV` - Environment mode (development, production)
- `LOG_LEVEL` - Logging level (trace, debug, info, warn, error, fatal)
- `SENSAY_API_URL` - URL of the Sensay API service
- `SENSAY_API_KEY` - API key for authentication with Sensay API
- `HTTP_PORT` - Port for the HTTP API server
- `ORCHESTRATOR_AUTH_TOKEN` - Authentication token for the orchestrator API
- `RELOAD_BOTS_INTERVAL_MS` - Interval for reloading bot definitions (default: 5 minutes)
- `PRINT_BOTS_STATUS_INTERVAL_MS` - Interval for printing bot status (default: 1 minute)
- `HEALTH_CHECK_TIMEOUT_MS` - Timeout for health checks (default: 1000ms)
- `HEALTH_CHECK_INTERVAL_MS` - Interval between health checks (default: 5000ms)
- `GRACEFUL_SHUTDOWN_TIMEOUT_MS` - Timeout for graceful shutdown (default: 1000ms)
- `MAX_FAILED_RESTARTS` - Maximum number of failed restart attempts (default: 3)

## Development
```bash
# Run in development mode using Bun
npm run dev
```

## Building
```bash
# Build the package
npm run build
```

The built files will be available in the `dist` directory.

## Running
```bash
# Run in production mode
npm run start
```

## Testing
```bash
# Run tests
npm run test
```

## Architecture
The orchestrator follows a cluster architecture with a primary process and worker processes:

1. **Primary Process (Orchestrator)**: Manages the lifecycle of bot worker processes and reconciles the desired state with the actual state.

2. **Worker Processes (Bots)**: Each bot runs in its own worker process, allowing for isolation and independent management.

3. **Bot Orchestration Algorithm**:
   - The orchestrator maintains a desired state (DS) of bot definitions
   - The actual state (AS) tracks currently running bot processes
   - A periodic reconciliation process ensures AS matches DS
   - Failed bots are restarted with appropriate backoff strategies
   - Health checks are performed to ensure bots are functioning correctly

## API
The orchestrator exposes HTTP endpoints for managing bot instances and monitoring system status.

### Base URL
- Default: `http://localhost:3000` (configurable via `HTTP_PORT` environment variable)

### Authentication
API endpoints under `/bots` are protected with Bearer authentication. Use the `ORCHESTRATOR_AUTH_TOKEN` environment variable to set the token.

### Endpoints

#### Health Check
- **GET** `/health`
  - Description: Check if the orchestrator is healthy
  - Authentication: None
  - Response:
    - `200 OK` - Returns health status
    ```json
    {
      "status": "healthy|unhealthy",
      "uptime": 123.45
    }
    ```

#### Status
- **GET** `/status`
  - Description: Get detailed status of all bots managed by the orchestrator
  - Authentication: None
  - Response:
    - `200 OK` - Returns the current state of all bots

#### Add Bot
- **POST** `/bots`
  - Description: Add a new bot to be managed by the orchestrator
  - Authentication: Bearer Token
  - Request Body: Bot definition JSON
  - Response:
    - `201 Created` - Bot added successfully
    - `400 Bad Request` - Invalid bot definition
    - `500 Internal Server Error` - Failed to add bot

#### Update Bot
- **PUT** `/bots/{replicaUUID}`
  - Description: Update an existing bot's configuration
  - Authentication: Bearer Token
  - Parameters:
    - `replicaUUID` (path) - The UUID of the bot replica
  - Request Body: Partial bot definition JSON
  - Response:
    - `204 No Content` - Bot updated successfully
    - `201 Created` - Bot created (if it didn't exist)
    - `400 Bad Request` - Invalid bot definition
    - `404 Not Found` - Bot not found
    - `500 Internal Server Error` - Failed to update bot

#### Delete Bot
- **DELETE** `/bots/{replicaUUID}`
  - Description: Remove a bot from management by the orchestrator
  - Authentication: Bearer Token
  - Parameters:
    - `replicaUUID` (path) - The UUID of the bot replica
  - Response:
    - `204 No Content` - Bot deleted successfully
    - `404 Not Found` - Bot not found
    - `500 Internal Server Error` - Failed to delete bot

### API Documentation
- **GET** `/` - Home page with links to documentation
- **GET** `/ui` - Swagger UI for interactive API documentation
- **GET** `/schema` - OpenAPI schema

