'use client';

import { Message } from "../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { UserCircle } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

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

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

function Messages({
  messages,
  chatbotName,
  logoUrl,
  isReviewPage = false,
}: {
  messages: Message[];
  chatbotName: string;
  logoUrl?: string;
  isReviewPage?: boolean;
}) {
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

  const markdownComponents = {
    ul: ({ node, ...props }: any) => <ul {...props} />,
    ol: ({ node, ...props }: any) => <ol {...props} />,
    a: ({ node, ...props }: any) => <a rel="noopener noreferrer" target="_blank" {...props} />,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {messages.map((message) => {
        const isSender = message.sender !== "user";
        const isThinking = message.content === "" || message.content === "Thinking...";
        const showMeta = !isThinking && (hoveredId === message.id || isReviewPage);

        return (
          <div
            className="assistly-message-row"
            key={message.id}
            onMouseEnter={() => setHoveredId(message.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              display: 'flex',
              flexDirection: isSender ? 'row' : 'row-reverse',
              alignItems: 'center',
              justifyContent: 'flex-start',
              width: '100%',
              gap: 10,
            }}
          >
            <div
              className="assistly-message-avatar"
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: isSender
                  ? 'var(--assistly-paper-2)'
                  : 'var(--assistly-user-bubble)',
                color: isSender ? 'var(--assistly-ink)' : 'var(--assistly-user-ink)',
                border: '1px solid var(--assistly-hairline-strong)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
              aria-hidden
            >
              {isSender && logoUrl ? (
                <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : isSender ? (
                <span
                  style={{
                    fontFamily: 'Fraunces, Georgia, serif',
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {chatbotName.charAt(0).toUpperCase()}
                </span>
              ) : (
                <UserCircle size={14} strokeWidth={1.6} />
              )}
            </div>
            <div
              style={{
                display: 'flex',
                flex: '0 1 640px',
                flexDirection: 'column',
                alignItems: isSender ? 'flex-start' : 'flex-end',
                minWidth: 0,
                maxWidth: 'calc(100% - 36px)',
              }}
            >
              <div
                className="assistly-font-mono"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  padding: '0 4px',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--assistly-ink-mute)',
                }}
              >
                <span style={{ color: 'var(--assistly-ink-soft)', fontWeight: 500 }}>
                  {isSender ? chatbotName : 'you'}
                </span>
                <span
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: '50%',
                    background: 'var(--assistly-ink-mute)',
                    opacity: showMeta ? 1 : 0,
                    transition: 'opacity 200ms',
                  }}
                />
                <span style={{ opacity: showMeta ? 1 : 0, transition: 'opacity 200ms' }}>
                  {formatTime(message.created_at)}
                </span>
              </div>

              {/* ----- Bubble ----- */}
              <div
                className={`assistly-message-bubble ${isSender ? 'assistly-bubble-in' : ''}`}
                style={{
                  position: 'relative',
                  maxWidth: '100%',
                  width: 'fit-content',
                  padding: '12px 16px',
                  borderRadius: 'var(--assistly-radius)',
                  background: isSender ? 'var(--assistly-paper)' : 'var(--assistly-user-bubble)',
                  color: isSender ? 'var(--assistly-ink)' : 'var(--assistly-user-ink)',
                  border: isSender
                    ? '1px solid var(--assistly-hairline-strong)'
                    : '1px solid var(--assistly-user-bubble)',
                  boxShadow: isSender
                    ? '0 1px 0 rgba(16,24,32,0.02), 0 8px 24px rgba(16,24,32,0.05)'
                    : '0 1px 0 rgba(255,255,255,0.12) inset, 0 8px 24px rgba(43,100,227,0.20)',
                  fontSize: 15,
                  lineHeight: 1.6,
                }}
              >
                {isThinking ? (
                  <div className="assistly-thinking" role="status" aria-label="Assistant is thinking">
                    <span className="assistly-dot" />
                    <span className="assistly-dot" />
                    <span className="assistly-dot" />
                  </div>
                ) : (
                  <div className={`assistly-prose ${isSender ? '' : 'assistly-prose-user'}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={ref} />
    </div>
  );
}

export default Messages;
