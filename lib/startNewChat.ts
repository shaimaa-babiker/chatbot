type StartedChat = {
  chatSessionId: number;
  capability: string;
};

async function startNewChat(
  guestName: string,
  guestEmail: string,
  chatbotId: number,
): Promise<StartedChat> {
  const response = await fetch('/api/start-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: guestName,
      email: guestEmail,
      chatbot_id: chatbotId,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload?.error ?? `Failed to start chat (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
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
