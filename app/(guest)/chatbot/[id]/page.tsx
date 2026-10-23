import { getChatbot } from "@/lib/chatData";
import ChatbotClient from "./ChatbotClient";

export const dynamic = 'force-dynamic';

export default async function ChatbotPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  const chatbotId = Number(id);
  const chatbot = Number.isInteger(chatbotId) && chatbotId > 0
    ? await getChatbot(chatbotId)
    : null;
  const chatbotName = chatbot?.name || 'Assistant';

  return <ChatbotClient id={id} chatbotName={chatbotName} />;
}
