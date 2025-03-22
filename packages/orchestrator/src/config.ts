import assert from "node:assert";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

assert(process.env.SENSAY_API_URL, "SENSAY_API_URL is not defined");
assert(process.env.SENSAY_API_KEY, "SENSAY_API_KEY is not defined");
assert(process.env.BOT_TOKENS, "BOT_TOKENS is not defined");

export const config = {
  sensayApiUrl: process.env.SENSAY_API_URL,
  sensayApiKey: process.env.SENSAY_API_KEY,
  botTokens: process.env.BOT_TOKENS.split(","),
};
