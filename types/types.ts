export interface Chatbot {
    id:number,
    name:string,
    clerk_user_id:string,
    created_at:string,
    chatbot_characteristics:ChatbotCharacteristic[],
    chat_sessions:ChatSession[]
    messages:Message[]
}

export interface ChatbotCharacteristic {
    id:number,
    content:string,
    created_at:string,
    chatbot_id:number
}

export interface Guest {
    id:number,
    created_at:string,
    email:string | null,
    name:string | null,
}
export interface ChatSession {
    id:number,
    chatbot_id:number,
    guest_id:number| null,
    created_at:string,
    guests:Guest | null
    messages:Message[]
}

export interface Message {
    id:number,
    chat_session_id:number
    content:string,
    created_at:string,
    sender:"ai"|"user"
}

export interface GetChatbotByIdResponse {
    chatbots:Chatbot
}

export interface GetChatbotByIdResponseVariables {
    id:string
}

export interface GetChatbotsByUserData {
    chatbotsByUser:Chatbot[]
}

export interface GetChatbotsByUserDataVariables {
    userId:number
}
 export interface ChatbotData {
    chatbotsList: Chatbot[];
}

export interface ChatbotsListByClerkUserIdResponse {
    chatbotsListByClerkUserId: Chatbot[];
}

export interface GetChatSessionsMessagesResponse{
    chat_sessions:{
id:number,
created_at:string,
messages:Message[],
chatbots:{
    id:number,
    name:string,
    clerk_user_id:string,
}
guests:{
    name:string,
    email:string
}
    }
}

export interface GetChatSessionsMessagesResponseVariables{
id:number
}

export interface MessagesbyChatSessionIdResponse {
    chat_sessions:ChatSession[]
}

export interface MessagesbyChatSessionIdResponseVariables {
chat_session_id:number,

}

export interface AdminUser {
    id: number
    owner_clerk_user_id: string
    invited_email: string
    role: 'editor' | 'viewer'
    created_at: string
}