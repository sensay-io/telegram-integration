const API_BASE_URL = process.env.API_BASE_URL || "";

interface TelegramData {
  chat_type: string;
  chat_id: string;
  user_id: string;
  username: string;
  message_id: string;
  message_thread_id: string | undefined;
}

interface CompletionRequest {
  content: string;
  source: string;
  skip_chat_history: boolean;
  telegram_data: TelegramData;
}

interface SaveMessageRequest {
  content: string;
  skip_chat_history: false;

  telegram_data: TelegramData;
}

export async function getTelegramResponse(
  replicaUuid: string,
  messageAuthorId: string,
  request: CompletionRequest,
) {
  const response = await fetch(
    `${API_BASE_URL}/v1/replicas/${replicaUuid}/chat/completions`,
    {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "X-ORGANIZATION-SECRET": process.env.SENSAY_ORGANIZATION_SECRET || "",
        "X-USER-ID": messageAuthorId,
        "X-USER-ID-TYPE": "discord",
        // needed for vercel protection in staging
        "x-vercel-protection-bypass":
          process.env.VERCEL_PROTECTION_BYPASS_KEY || "",
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    const responseMessageJson = (await response.json()) as {
      error?: string;
      message?: string;
    };
    throw new Error(responseMessageJson.error || responseMessageJson.message);
  }

  const data = await response.json();

  return data;
}

export async function saveDiscordMessage(
  replicaUuid: string,
  messageAuthorId: string,
  request: SaveMessageRequest,
) {
  const response = await fetch(
    `${API_BASE_URL}/v1/replicas/${replicaUuid}/chat/history/telegram`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ORGANIZATION-SECRET": process.env.SENSAY_ORGANIZATION_SECRET || "",
        "X-USER-ID": messageAuthorId,
        "X-USER-ID-TYPE": "discord",
        // needed for vercel protection in staging
        "x-vercel-protection-bypass":
          process.env.VERCEL_PROTECTION_BYPASS_KEY || "",
      },
      body: JSON.stringify(request),
    },
  );

  return await response.json();
}
