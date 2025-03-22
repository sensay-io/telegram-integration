import assert from "node:assert";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

assert(process.env.BOT_TOKENS, "BOT_TOKENS is not defined");

export const config = {
  botTokens: process.env.BOT_TOKENS.split(","),
};
