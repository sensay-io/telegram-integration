import { env } from '@sensay/orchestrator/src/env'

export const PRIVATE_CHAT = 'private'
export const GROUP_CHAT = 'group'

export const commonHeaders = {
  'Content-Type': 'application/json',
  'X-ORGANIZATION-SECRET': env.SENSAY_ORGANIZATION_SECRET || '',
  'x-vercel-protection-bypass': env.VERCEL_PROTECTION_BYPASS_KEY || '', // Needed to connect to non-production environments
}
