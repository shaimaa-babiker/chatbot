async function startNewChat(
  guestName: string,
  guestEmail: string,
  chatbotId: number,
): Promise<number> {
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
  if (typeof data?.chat_session_id !== 'number') {
    throw new Error('Server returned an invalid response');
  }
  return data.chat_session_id;
}

export default startNewChat;
