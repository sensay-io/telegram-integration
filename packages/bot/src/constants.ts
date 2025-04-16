import { env } from 'node:process'

export const PRIVATE_CHAT = 'private'
export const GROUP_CHAT = 'group'

export const commonHeaders = {
  'Content-Type': 'application/json',
  'X-ORGANIZATION-SECRET': env.SENSAY_API_KEY || '',
  'x-vercel-protection-bypass': env.VERCEL_PROTECTION_BYPASS_KEY || '', // Needed to connect to non-production environments
}
