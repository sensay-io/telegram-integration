# Sensay Telegram Integration

A modular system for managing and orchestrating multiple Telegram bots at scale.

## Overview

This project provides a complete solution for running and managing multiple Telegram bots in a scalable way. It consists of two main packages:

1. **Bot** (`@sensay/telegram-bot`): The core Telegram bot implementation based on the Grammy library, responsible for handling bot interactions.

2. **Orchestrator** (`@sensay/orchestrator`): A service that manages multiple bot instances, ensuring they're running correctly, handling health checks, and providing a management API.

## Features

- **Scalable Architecture**: Run multiple bot instances in isolated processes
- **Health Monitoring**: Automatic health checks and recovery of failed bot instances
- **Management API**: HTTP API for adding, updating, and removing bots
- **Process Isolation**: Each bot runs in its own process for improved stability
- **Graceful Handling**: Proper startup, shutdown, and error handling

## Project Structure

```
/packages
  /bot           - Core Telegram bot implementation
  /orchestrator  - Bot orchestration and management service
```

## Prerequisites

- Node.js (v22.13.11 recommended)
- npm
- TypeScript

## Installation

```bash
# Install dependencies for all packages
npm install
```

## Development

### Running the Bot Package

```bash
# Run the bot in development mode
npm run dev:bot
```

### Running the Orchestrator

```bash
# Run the orchestrator in development mode
npm run dev:orc
```

### Building All Packages

```bash
# Build all packages
npm run build
```

### Running Tests

```bash
# Run tests for all packages
npm run test
```

### Code Quality

```bash
# Lint code
npm run lint

# Automatically fix linting issues
npm run lint:write

# Check code formatting and types
npm run check

# Automatically fix formatting issues
npm run check:write
```

## Packages

### Bot (`@sensay/telegram-bot`)

The bot package provides the core functionality for Telegram bot interactions. It handles messages, commands, and other Telegram events.

For detailed information, see the [Bot README](packages/bot/README.md).

### Orchestrator (`@sensay/orchestrator`)

The orchestrator manages multiple bot instances, ensuring they're running correctly, and provides a management API for adding, updating, and removing bots.

Key features:
- Bot process management in cluster mode
- Health monitoring and automatic restart
- API for bot management
- Graceful handling of bot processes

For detailed information, see the [Orchestrator README](packages/orchestrator/README.md).

## Environment Variables

Copy the example environment files to set up your configuration:

```bash
cp packages/bot/.env.example packages/bot/.env.local
cp packages/orchestrator/.env.example packages/orchestrator/.env.local
```

## License

This project is available under the [Apache 2.0 License](https://opensource.org/license/apache-2-0). See [LICENSE](./LICENSE) for the full license text.

