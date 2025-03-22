import dotenv from "dotenv";
import { initializeBotClient } from "./bot.js";

dotenv.config({ path: ".env.local" });
if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN is not defined");
}

initializeBotClient(process.env.BOT_TOKEN);
