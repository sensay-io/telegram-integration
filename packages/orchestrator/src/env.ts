import dotenv from 'dotenv'
import assert from 'node:assert'

const dotenvOutput = dotenv.config({ path: '.env.local' })

if (dotenvOutput.error) {
  throw dotenvOutput.error
}

assert(dotenvOutput.parsed)

export const env = dotenvOutput.parsed
