'use client'

import { Message } from "@/types/types"
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Avatar from "./Avatar";
import { UserCircle } from "lucide-react";
import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import { AiBubble, UserBubble, FourDotWave } from "./ChatMotion";

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function TypewriterMarkdown({ text, isFresh, components, onType }: { text: string, isFresh: boolean, components: any, onType?: () => void }) {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setDisplayedText("");
    setIndex(0);
  }, [text]);

  useEffect(() => {
    if (isFresh && text && index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[index]);
        setIndex((prev) => prev + 1);
        if (onType) onType();
      }, 15);
      return () => clearTimeout(timeout);
    } else if (!isFresh) {
      setDisplayedText(text || "");
    }
  }, [index, text, isFresh]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
    >
      {isFresh ? displayedText : text}
    </ReactMarkdown>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

function Messages({ messages, chatbotName, logoUrl, isReviewPage: isReviewPageProp }: { messages: Message[], chatbotName: string, logoUrl?: string, isReviewPage?: boolean }) {
  const path = usePathname();
  const isReviewPage = isReviewPageProp ?? path.includes('review-sessions');
  const ref = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

  const scrollToBottom = (smooth = true) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const markdownComponents = {
    ul: ({ node, ...props }: any) => (<ul className="list-disc list-inside ml-5 mb-3" {...props} />),
    ol: ({ node, ...props }: any) => (<ol className="list-decimal list-inside ml-5 mb-3" {...props} />),
    h1: ({ node, ...props }: any) => (<h1 className="text-2xl font-bold mb-3 font-display" {...props} />),
    h2: ({ node, ...props }: any) => (<h2 className="text-xl font-bold mb-3 font-display" {...props} />),
    h3: ({ node, ...props }: any) => (<h3 className="text-lg font-bold mb-3 font-display" {...props} />),
    table: ({ node, ...props }: any) => (<table className="table-auto mb-3 w-full border-separate border-2 rounded-sm border-spacing-4" style={{ borderColor: "rgba(26,20,15,0.18)" }} {...props} />),
    th: ({ node, ...props }: any) => (<th className="text-left underline" {...props} />),
    p: ({ node, ...props }: any) => (<p className="whitespace-pre-wrap mb-3 last:mb-0 leading-relaxed" {...props} />),
    a: ({ node, ...props }: any) => (<a className="hover:underline font-semibold" style={{ color: "#c45d4f" }} rel="noopener noreferrer" target="_blank" {...props} />),
    code: ({ node, ...props }: any) => (
      <code
        className="px-1.5 py-0.5 rounded font-mono text-[13px]"
        style={{ background: "rgba(26,20,15,0.10)" }}
        {...props}
      />
    ),
  };

  return (
    <div className="flex flex-1 flex-col space-y-7 py-8 px-5 md:px-10 bg-transparent rounded-lg scroll-smooth ">
      {messages.map((message, index) => {
        const isSender = message.sender !== "user";
        const isThinking = message.content === "" || message.content === "Thinking...";
        const isFresh = index === messages.length - 1;
        const showMeta = hoveredId === message.id || isReviewPage;

        return (
          <div
            key={message.id || index}
            onMouseEnter={() => setHoveredId(message.id)}
            onMouseLeave={() => setHoveredId(null)}
            className={`chat ${isSender ? "chat-start" : "chat-end"} relative group overflow-hidden`}
          >
            {isReviewPage && (
              <p className="absolute -bottom-5 text-xs text-gray-300">
                sent {new Date(message.created_at).toLocaleString()}
              </p>
            )}

            {isFresh && (
              <span
                aria-hidden
                className="ring-out pointer-events-none absolute -inset-2 rounded-[26px]"
              />
            )}

            <div className={`chat-image avatar w-10 ${!isSender && "mr-4"}`}>
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={chatbotName || "Chatbot logo"}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full border object-cover"
                  style={{ borderColor: "var(--hairline)" }}
                  unoptimized
                />
              ) : isSender ? (
                <div
                  className="border h-12 w-12 rounded-full bg-white overflow-hidden"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <Avatar seed={chatbotName} className="h-12 w-12" />
                </div>
              ) : (
                <div className="h-12 w-12 rounded-full grid place-items-center" style={{ background: "rgba(244,234,215,0.06)" }}>
                  <UserCircle className="text-[var(--brass-2)]" />
                </div>
              )}
            </div>

            {isSender ? (
              <AiBubble
                springIn={isFresh}
                typing={isThinking}
                className="chat-bubble relative rounded-2xl px-4 py-3 max-w-[80%] font-body text-[15px] leading-relaxed"
                style={isThinking ? {} : { border: "1px solid rgba(224,176,112,0.18)" }}
              >
                {isThinking ? (
                  <div className="flex items-center gap-3 py-1" style={{ color: "#1e1e1e" }}>
                    <FourDotWave />
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] opacity-70">
                      Thinking...
                    </span>
                  </div>
                ) : (
                  <TypewriterMarkdown
                    text={message.content}
                    isFresh={isFresh}
                    components={markdownComponents}
                    onType={() => scrollToBottom(false)}
                  />
                )}
              </AiBubble>
            ) : (
              <UserBubble
                springIn={isFresh}
                className="chat-bubble relative rounded-2xl px-4 py-3 max-w-[80%] font-body text-[15px] leading-relaxed"
                style={{
                  background: "#e9e3e3ff",
                  color: "#1e1e1e",
                  border: "1px solid rgba(231, 228, 224, 0.22)",
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {message.content}
                </ReactMarkdown>
              </UserBubble>
            )}

            <div
              className={`mt-1.5 px-1  flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-opacity duration-200 ${showMeta ? "opacity-100" : "opacity-0"
                }`}
              style={{ color: "var(--muted-2)" }}
            >
              <span>{isSender ? chatbotName || "assistant" : "you"}</span>
              <span className="w-1 h-1 rounded-full" style={{ background: "var(--muted-2)" }} />
              <span>{formatTime(message.created_at)}</span>
            </div>
          </div>
        );
      })}
      <div ref={ref} />
    </div>
  );
}

export default Messages;
