import { env } from 'node:process'

const API_BASE_URL = env.API_BASE_URL
const SENSAY_ORGANIZATION_SECRET = env.SENSAY_ORGANIZATION_SECRET
const VERCEL_PROTECTION_BYPASS_KEY = env.VERCEL_PROTECTION_BYPASS_KEY

interface TelegramData {
  chat_type: string
  chat_id: string
  user_id: string
  username: string
  message_id: string
  message_thread_id: string | undefined
}

interface UserData {
  id?: string
  name?: string
  email?: string
}

interface ErrorResponse {
  error?: string
  message?: string
}

interface CompletionRequest {
  content: string
  source: string
  skip_chat_history: boolean
  telegram_data: TelegramData
}

interface SaveMessageRequest {
  content: string
  skip_chat_history: false
  telegram_data: TelegramData
}

export async function getTelegramResponse(
  replicaUuid: string,
  messageAuthorId: string,
  request: CompletionRequest,
) {
  const response = await fetch(`${API_BASE_URL}/v1/replicas/${replicaUuid}/chat/completions`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'X-ORGANIZATION-SECRET': SENSAY_ORGANIZATION_SECRET!,
      'X-USER-ID': messageAuthorId,
      'X-USER-ID-TYPE': 'telegram',
      // needed for vercel protection in staging
      'x-vercel-protection-bypass': VERCEL_PROTECTION_BYPASS_KEY!,
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const responseMessageJson = (await response.json()) as {
      error?: string
      message?: string
    }
    throw new Error(responseMessageJson.error || responseMessageJson.message)
  }

  const data = await response.json()

  return data as string
}

export async function saveTelegramMessage(
  replicaUuid: string,
  messageAuthorId: string,
  request: SaveMessageRequest,
) {
  const response = await fetch(`${API_BASE_URL}/v1/replicas/${replicaUuid}/chat/history/telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ORGANIZATION-SECRET': SENSAY_ORGANIZATION_SECRET!,
      'X-USER-ID': messageAuthorId,
      'X-USER-ID-TYPE': 'telegram',
      // needed for vercel protection in staging
      'x-vercel-protection-bypass': VERCEL_PROTECTION_BYPASS_KEY!,
    },
    body: JSON.stringify(request),
  })

  return await response.json()
}

export async function checkAndCreateUser(userId: string): Promise<UserData> {
  try {
    // First, try to get the user using the users/me endpoint
    const userResponse = await fetch(`${API_BASE_URL}/v1/users/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-ORGANIZATION-SECRET': SENSAY_ORGANIZATION_SECRET || '',
        'X-USER-ID': userId,
        'X-USER-ID-TYPE': 'telegram',
        // needed for vercel protection in staging
        'x-vercel-protection-bypass': VERCEL_PROTECTION_BYPASS_KEY || '',
      },
    })

    // If the response is successful, the user exists
    if (userResponse.ok) {
      return (await userResponse.json()) as UserData
    }

    // If we get a 401 error, the user doesn't exist and we need to create them
    if (userResponse.status === 401) {
      const createResponse = await fetch(`${API_BASE_URL}/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ORGANIZATION-SECRET': SENSAY_ORGANIZATION_SECRET || '',
          // needed for vercel protection in staging
          'x-vercel-protection-bypass': VERCEL_PROTECTION_BYPASS_KEY || '',
        },
        body: JSON.stringify({
          IDs: [
            {
              userID: userId,
              userIDType: 'telegram',
            },
          ],
        }),
      })

      if (!createResponse.ok) {
        const errorData = (await createResponse.json()) as ErrorResponse
        throw new Error(errorData.error || errorData.message || 'Failed to create user')
      }

      return (await createResponse.json()) as UserData
    }

    // For other error statuses, throw an error
    const errorData = (await userResponse.json()) as ErrorResponse
    throw new Error(
      errorData.error || errorData.message || `Unexpected error: ${userResponse.status}`,
    )
  } catch (error: unknown) {
    // Re-throw the error with additional context
    if (error instanceof Error) {
      throw new Error(`Error checking/creating user: ${error.message}`)
    }
    throw new Error(`Error checking/creating user: ${String(error)}`)
  }
}
