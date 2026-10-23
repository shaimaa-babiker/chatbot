import { getApiBaseUrl, readApiJson } from './api';

async function startNewChat(
  origin: string,
  guestName: string,
  guestEmail: string,
  chatbotId: number,
): Promise<{ chatSessionId: number; capability: string }> {
  const baseUrl = getApiBaseUrl(origin);
  const response = await fetch(`${baseUrl}/api/start-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: guestName,
      email: guestEmail,
      chatbot_id: chatbotId,
    }),
  });

  if (!response.ok) {
    const payload = await readApiJson<{ error?: string }>(response);
    const message =
      payload?.error ?? `Failed to start chat (${response.status})`;
    throw new Error(message);
  }

  const data = await readApiJson<{
    chat_session_id?: unknown;
    capability?: unknown;
  }>(response);
  if (
    typeof data?.chat_session_id !== 'number' ||
    typeof data?.capability !== 'string'
  ) {
    throw new Error('Server returned an invalid response');
  }
  return {
    chatSessionId: data.chat_session_id,
    capability: data.capability,
  };
}

export default startNewChat;
