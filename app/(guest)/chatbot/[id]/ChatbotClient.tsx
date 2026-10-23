'use client';

import { useEffect, useRef, useState } from "react";
import { Message } from "@/types/types";
import startNewChat from "@/lib/startNewChat";
import Avatar from "@/components/ui/Avatar";
import Messages from "@/components/ui/Messages";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from '@hookform/resolvers/zod';
import { FormControl, FormField, FormItem, FormMessage, Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const messageSchema = z.object({
  message: z.string().min(1, 'Please enter a message.'),
});

const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.'),
  email: z.string().trim().email('Please enter a valid email address.'),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

function ChatbotClient({ id, chatbotName }: { id: string, chatbotName: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [chatId, setChatId] = useState(0);
  const [sessionCapability, setSessionCapability] = useState('');
  const [loading, setLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [message, setMessage] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom whenever messages change (new message or AI streaming)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [message]);

  const messageForm = useForm<z.infer<typeof messageSchema>>({
    resolver: zodResolver(messageSchema),
    defaultValues: {
      message: ''
    }
  });

  const onboardingForm = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: '',
      email: '',
    },
  });

  useEffect(() => {
    if (!chatId || !sessionCapability) return
    let cancelled = false
    fetch(`/api/chat-sessions/${chatId}/messages`, {
      headers: { Authorization: "Bearer " + sessionCapability },
    })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'Failed to load messages')
        return result as Message[]
      })
      .then(dbMessages => {
        if (!cancelled) setMessage(dbMessages)
      })
      .catch(error => console.error('Failed to load chat messages:', error))
    return () => { cancelled = true }
  }, [chatId, sessionCapability])

  async function onOnboardingSubmit(values: OnboardingValues) {
    setOnboardingError(null);
    setLoading(true);
    try {
      const startedChat = await startNewChat(values.name, values.email, Number(id));
      setName(values.name);
      setEmail(values.email);
      setChatId(startedChat.chatSessionId);
      setSessionCapability(startedChat.capability);
      setShowOnboarding(false);
    } catch (error) {
      console.error('Error starting chat:', error);
      setOnboardingError(
        error instanceof Error
          ? error.message
          : 'Sorry, I had trouble setting up your session. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function onMessageSubmit(values: z.infer<typeof messageSchema>) {
    const { message: formMessage } = values;
    messageForm.reset();

    if (!chatId) return;

    const userMessage: Message = {
      id: Date.now(),
      content: formMessage,
      chat_session_id: chatId,
      sender: 'user',
      created_at: new Date().toISOString(),
    };

    const loadingMessage: Message = {
      id: Date.now() + 1,
      content: 'Thinking...',
      chat_session_id: chatId,
      created_at: new Date().toISOString(),
      sender: 'ai',
    };
    setMessage((prevMessages) => [...prevMessages, userMessage, loadingMessage]);

    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: "Bearer " + sessionCapability,
        },
        body: JSON.stringify({
          name: name,
          chat_session_id: chatId,
          chabot_id: Number(id),
          content: formMessage,
          created_at: new Date().toISOString(),
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Failed to send message')
      const responseShownAt = new Date().toISOString();
      setMessage((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === loadingMessage.id
            ? { ...msg, content: result.content, id: result.id, created_at: responseShownAt }
            : msg
        )
      );
    } catch (error) {
      console.error('Error Sending Message:', error);
      const errorShownAt = new Date().toISOString();
      setMessage((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === loadingMessage.id
            ? {
                ...msg,
                content: 'I could not send your message just now. Please try again.',
                created_at: errorShownAt,
              }
            : msg
        )
      );
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 text-slate-900 md:p-6 md:pb-0">
      <div className="flex flex-col w-full max-w-3xl mx-auto flex-1 overflow-hidden md:rounded-t-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 bg-white py-3 px-4 md:py-6 md:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 md:space-x-4 min-w-0">
            <div className="relative shrink-0">
              <Avatar
                seed={chatbotName ?? 'default-seed'}
                className="w-9 h-9 md:w-10 md:h-10 bg-gray-100 rounded-full border border-gray-200"
              />
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></div>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm md:text-base font-semibold text-slate-900">
                {chatbotName || 'Assistant'}
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                Online
              </p>
            </div>
          </div>
          <div className="hidden sm:block text-[11px] font-medium text-slate-400 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
            Secure Session
          </div>
        </div>

        <div className="flex-1 bg-white overflow-y-auto">
          <Messages messages={message} chatbotName={chatbotName || ''} />
          {/* Invisible anchor — scrolled into view whenever messages change */}
          <div ref={bottomRef} className="h-4" />
        </div>

        <div className="shrink-0 w-full bg-white p-3 md:p-5 border-t border-gray-100">
          <Form {...messageForm}>
            <form
              className="relative flex items-center gap-2 md:gap-3 max-w-4xl mx-auto"
              onSubmit={messageForm.handleSubmit(onMessageSubmit)}
            >
              <div className="relative flex-1">
                <FormField
                  control={messageForm.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Type a message..."
                          className="p-3 md:p-5 rounded-xl bg-gray-50 border-gray-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <Button
                type="submit"
                disabled={messageForm.formState.isSubmitting || !messageForm.formState.isValid || loading}
                className="h-12 w-12 md:h-16 md:w-16 rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition-all shrink-0"
              >
                {loading ? (
                  <div className="h-6 w-6 md:h-8 md:w-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <p className="cursor-pointer text-sm md:text-base">Send</p>)}
              </Button>
            </form>
          </Form>
        </div>
      </div>

      {showOnboarding && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <Avatar
                seed={chatbotName ?? 'default-seed'}
                className="w-10 h-10 bg-gray-100 rounded-full border border-gray-200"
              />
              <div>
                <h2 id="onboarding-title" className="text-base font-semibold text-slate-900">
                  Welcome! Let's get started
                </h2>
                <p className="text-xs text-slate-500">
                  Chatting with {chatbotName || 'Assistant'}
                </p>
              </div>
            </div>

            <Form {...onboardingForm}>
              <form
                onSubmit={onboardingForm.handleSubmit(onOnboardingSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={onboardingForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Name"
                          autoComplete="name"
                          className="p-3 rounded-xl bg-gray-50 border-gray-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={onboardingForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="Email"
                          autoComplete="email"
                          className="p-3 rounded-xl bg-gray-50 border-gray-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {onboardingError && (
                  <p className="text-sm text-red-600" role="alert">
                    {onboardingError}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={loading || !onboardingForm.formState.isValid}
                  className="w-full h-12 rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition-all"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Starting chat…
                    </span>
                  ) : (
                    'Start chatting'
                  )}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatbotClient;
