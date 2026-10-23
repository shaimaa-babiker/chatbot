'use client';

import React, { useEffect, useState } from 'react';
import ChatbotClient from './ChatbotClient';
import { ensureAssistlyFonts, ensureAssistlyStyles } from './lib/injectStyles';
import assistlyCss from './lib/styles';
import { getApiBaseUrl, readApiJson } from './lib/api';
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from './types';

export type AssistlyChatProps = {
  chatbotId: number;
  /** Origin of the Assistly deployment that hosts the chat API, e.g. https://chatbot-xi-rose-68.vercel.app */
  origin: string;
  /** Optional brand color for the widget's blue accent */
  primaryColor?: string;
  /** Optional local overrides; saved chatbot appearance is loaded by default. */
  appearance?: Partial<WidgetConfig>;
  /** Fires when the chat panel has mounted and is ready to receive input */
  onReady?: () => void;
  /** Fires if the chat fails to mount */
  onError?: (err: Error) => void;
};

/**
 * Embeddable Assistly chat panel. Renders the full chat UI (intake form +
 * active chat) inside whatever container the customer places it in. Talks
 * directly to the Assistly API at `${origin}/api/...` — no iframe, no
 * cross-origin cookie issues.
 *
 * Styling is inlined into the published JS bundle (esbuild `text` loader
 * at build time, injected into <head> on mount). Consumers only need:
 *
 *   import { AssistlyChat } from '@shaimaababiker/embed';
 *
 * Theme tokens are exposed as CSS variables on the root wrapper, e.g.
 * `--assistly-brass`, `--assistly-ink`, `--assistly-paper`, so the host
 * page can override them at any ancestor level.
 */
export default function AssistlyChat({
  chatbotId,
  origin,
  primaryColor,
  appearance,
  onReady,
  onError,
}: AssistlyChatProps) {
  const [mounted, setMounted] = useState(false);
  const [chatbotName, setChatbotName] = useState<string | null>(null);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>(DEFAULT_WIDGET_CONFIG);

  useEffect(() => {
    let cancelled = false;
    setMounted(false);
    setChatbotName(null);

    async function loadChatbot() {
      try {
        const baseUrl = getApiBaseUrl(origin);
        const response = await fetch(`${baseUrl}/api/chatbots/${chatbotId}`);
        const result = await readApiJson<{ name?: unknown; error?: unknown; widget_config?: Partial<WidgetConfig> }>(response);
        if (!response.ok) {
          throw new Error(
            typeof result.error === 'string' ? result.error : 'Failed to load chatbot',
          );
        }

        const name = typeof result.name === 'string' ? result.name.trim() : '';
        if (!name) throw new Error('The chatbot response did not include a name');
        if (cancelled) return;

        ensureAssistlyStyles(assistlyCss);
        ensureAssistlyFonts();
        setChatbotName(name);
        setWidgetConfig({
          ...DEFAULT_WIDGET_CONFIG,
          ...(result.widget_config ?? {}),
          ...(appearance ?? {}),
          ...(primaryColor ? { primaryColor } : {}),
        });
        setMounted(true);
        onReady?.();
      } catch (error) {
        if (cancelled) return;
        const loadError = error instanceof Error ? error : new Error(String(error));
        console.error('Failed to load chatbot:', loadError);
        onError?.(loadError);
      }
    }

    void loadChatbot();
    return () => {
      cancelled = true;
    };
  }, [chatbotId, origin, onReady, onError, appearance, primaryColor]);

  if (!mounted || !chatbotName) return null;

  const themeVars: React.CSSProperties & { [key: `--${string}`]: string | number } = {
    '--assistly-paper': widgetConfig.panelBackground,
    '--assistly-ink': widgetConfig.textColor,
    '--assistly-brass': primaryColor ?? widgetConfig.primaryColor,
    '--assistly-primary': primaryColor ?? widgetConfig.primaryColor,
    '--assistly-user-bubble': widgetConfig.userBubbleColor,
    '--assistly-user-ink': widgetConfig.userBubbleTextColor,
    '--assistly-radius': `${widgetConfig.borderRadius}px`,
  };

  return (
    <div
      className="assistly-root"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 520,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: 'var(--assistly-paper)',
        color: 'var(--assistly-ink)',
        fontFamily: widgetConfig.fontFamily,
        borderRadius: widgetConfig.borderRadius,
        overflow: 'hidden',
        ...themeVars,
      }}
    >
      <ChatbotClient id={String(chatbotId)} chatbotName={chatbotName} origin={origin} widgetConfig={widgetConfig} />
    </div>
  );
}
