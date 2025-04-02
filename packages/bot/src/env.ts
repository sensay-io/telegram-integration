import dotenv from 'dotenv'
import assert from 'node:assert'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const botDir = path.resolve(__dirname, '..')
const envPath = path.resolve(botDir, '.env.local')

const dotenvOutput = dotenv.config({ path: envPath })

if (dotenvOutput.error) {
  throw dotenvOutput.error
}

assert(dotenvOutput.parsed)


export const env = dotenvOutput.parsed
