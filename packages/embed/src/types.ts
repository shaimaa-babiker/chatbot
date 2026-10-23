export interface Message {
    id: number,
    chat_session_id: number,
    content: string,
    created_at: string,
    sender: "ai" | "user"
}

export type WidgetConfig = {
    headerTitle: string,
    subtitle: string,
    primaryColor: string,
    panelBackground: string,
    textColor: string,
    userBubbleColor: string,
    userBubbleTextColor: string,
    fontFamily: string,
    logoUrl: string,
    inputPlaceholder: string,
    sendButtonLabel: string,
    borderRadius: number,
    showSecureBadge: boolean,
    showPoweredBy: boolean,
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
    headerTitle: "",
    subtitle: "Online · replies in seconds",
    primaryColor: "#496b91",
    panelBackground: "#f4f6f8",
    textColor: "#101820",
    userBubbleColor: "#2b64e3",
    userBubbleTextColor: "#ffffff",
    fontFamily: "Inter, Arial, sans-serif",
    logoUrl: "",
    inputPlaceholder: "Write a message…",
    sendButtonLabel: "Send",
    borderRadius: 14,
    showSecureBadge: true,
    showPoweredBy: true,
}

export interface Guest {
    id: number,
    name: string,
    email: string,
    created_at: string,
}

export interface ChatSession {
    id: number,
    chatbot_id: number,
    guest_id: number | null,
    created_at: string,
    guests: Guest,
    messages: Message[]
}

export interface MessagesbyChatSessionIdResponse {
    chat_sessions: ChatSession[]
}

export interface MessagesbyChatSessionIdResponseVariables {
    chat_session_id: number,
}
