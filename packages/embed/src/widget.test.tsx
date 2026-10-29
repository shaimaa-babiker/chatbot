/* Smoke test for the Assistly embed widget.
 *
 * This test catches the high-cost failure modes for code I just wrote:
 *   1. Imports resolve and the bundle doesn't throw on mount.
 *   2. The injected <style data-assistly-style> tag actually lands in <head>.
 *   3. Key structural elements are present (header, input, send button,
 *      secure badge, messages area).
 *   4. The `primaryColor` prop reaches the wrapper as a CSS variable.
 *
 * It does NOT verify the visual aesthetic — that needs a human eye in
 * a real browser. Run `pnpm dev` in packages/embed and view it. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import AssistlyChat from './widget';
import Messages from './ui/Messages';
import { ensureAssistlyStyles, __resetAssistlyStylesForTests } from './lib/injectStyles';
import assistlyCss from './lib/styles';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AssistlyChat', () => {
  beforeEach(() => {
    document.head.querySelectorAll('style[data-assistly-style]').forEach((el) => el.remove());
    __resetAssistlyStylesForTests();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ name: 'Demo Chatbot' }),
    }));
  });

  it('injects a <style> tag with the assistly stylesheet on mount', () => {
    // Sanity: the bundled CSS should be non-empty and contain our tokens.
    expect(assistlyCss).toBeTypeOf('string');
    expect(assistlyCss.length).toBeGreaterThan(500);
    expect(assistlyCss).toContain('--assistly-paper');
    expect(assistlyCss).toContain('--assistly-brass');
    expect(assistlyCss).toContain('--assistly-paper: #f4f6f8');
    expect(assistlyCss).toContain('--assistly-ink: #101820');
    expect(assistlyCss).toContain('--assistly-brass: #496b91');
    expect(assistlyCss).toContain('background: var(--assistly-brass)');
    expect(assistlyCss).toContain('.assistly-thinking');
    expect(assistlyCss).toContain('.assistly-prose');

    // Sanity: ensureAssistlyStyles actually creates the tag.
    ensureAssistlyStyles(assistlyCss);
    const tag = document.head.querySelector('style[data-assistly-style]');
    expect(tag).toBeTruthy();
    expect(tag?.textContent).toBe(assistlyCss);
  });

  it('renders the widget shell with header, input, and send button', async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AssistlyChat
          chatbotId={42}
          origin="https://example.com"
          primaryColor="#cc0000"
        />
      );
    });
    const { container } = result!;
    expect(fetch).toHaveBeenCalledWith('https://example.com/api/chatbots/42/name');

    // Header — use the name loaded from the chatbot API
    expect((await screen.findAllByText('Demo Chatbot')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Assistant')).toBeNull();
    expect(screen.getByText('Secure')).toBeTruthy();

    // Online status text
    expect(screen.getAllByText('Online · replies in seconds').length).toBeGreaterThan(0);

    // The onboarding form collects the guest's name.
    const input = screen.getByPlaceholderText('Name') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Send button has the right label
    const sendBtn = screen.getByLabelText('Send message');
    expect(sendBtn).toBeTruthy();

    // Send button starts disabled (zod requires min 3 chars, empty input fails)
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);

    // Tagline at the bottom
    expect(screen.getByText(/Powered by SMOEDESIGN/)).toBeTruthy();

    // The injected <style> tag is present after mount
    expect(document.head.querySelector('style[data-assistly-style]')).toBeTruthy();

    // The root wrapper exists with the assistly-root class
    const root = container.querySelector('.assistly-root') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.getAttribute('style') || '').toContain('--assistly-brass');
    expect(root.getAttribute('style') || '').toContain('#cc0000');
  });

  it('does not throw without primaryColor (optional prop)', async () => {
    await act(async () => {
      render(<AssistlyChat chatbotId={1} origin="https://example.com" />);
    });
    expect(await screen.findByText('Demo Chatbot')).toBeTruthy();
  });

  it('applies saved appearance settings to the panel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        name: 'Demo Chatbot',
        widget_config: {
          headerTitle: 'Help desk',
          subtitle: 'We are here to help',
          primaryColor: '#123456',
          panelBackground: '#eeeeee',
          textColor: '#222222',
          userBubbleColor: '#abcdef',
          userBubbleTextColor: '#111111',
          fontFamily: 'Arial, sans-serif',
          logoUrl: '',
          inputPlaceholder: 'Ask us anything',
          sendButtonLabel: 'Submit',
          borderRadius: 8,
          showSecureBadge: false,
          showPoweredBy: false,
        },
      }),
    }));

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<AssistlyChat chatbotId={42} origin="https://example.com" />);
    });
    expect((await screen.findAllByText('Help desk')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('We are here to help').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Ask us anything')).toBeTruthy();
    expect(screen.getByText('Submit')).toBeTruthy();
    expect(screen.queryByText('Secure')).toBeNull();
    expect(screen.queryByText(/Powered by SMOEDESIGN/)).toBeNull();
    const root = result!.container.querySelector('.assistly-root') as HTMLElement;
    expect(root.style.getPropertyValue('--assistly-paper')).toBe('#eeeeee');
    expect(root.style.getPropertyValue('--assistly-brass')).toBe('#123456');
    expect(root.style.borderRadius).toBe('8px');
  });

  it('keeps each sender avatar and message bubble in the same horizontal row', () => {
    const scrollDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });

    try {
      const { container } = render(
        <Messages
          chatbotName="Demo Chatbot"
          messages={[
            {
              id: 1,
              chat_session_id: 1,
              content: 'Hello',
              created_at: '2026-01-01T00:00:00.000Z',
              sender: 'ai',
            },
            {
              id: 2,
              chat_session_id: 1,
              content: 'Hi',
              created_at: '2026-01-01T00:01:00.000Z',
              sender: 'user',
            },
          ]}
        />,
      );

      const rows = container.querySelectorAll('.assistly-message-row');
      expect(rows).toHaveLength(2);
      rows.forEach((row) => {
        expect(row.querySelector('.assistly-message-avatar')).toBeTruthy();
        expect(row.querySelector('.assistly-message-bubble')).toBeTruthy();
      });
      expect((rows[0] as HTMLElement).style.flexDirection).toBe('row');
      expect((rows[1] as HTMLElement).style.flexDirection).toBe('row-reverse');
    } finally {
      if (scrollDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      }
    }
  });

  it('renders three small dots while the assistant is thinking', () => {
    const scrollDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });

    try {
      const { container } = render(
        <Messages
          chatbotName="Demo Chatbot"
          messages={[
            {
              id: 1,
              chat_session_id: 1,
              content: 'Thinking...',
              created_at: '2026-01-01T00:00:00.000Z',
              sender: 'ai',
            },
          ]}
        />,
      );

      expect(container.querySelectorAll('.assistly-dot')).toHaveLength(3);
      expect(assistlyCss).toContain('width: 5px');
      expect(assistlyCss).toContain('height: 5px');
    } finally {
      if (scrollDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      }
    }
  });

  it('uses the issued capability for transcript retrieval and message submission', async () => {
    const capability = 'a'.repeat(43);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const jsonResponse = (value: unknown) =>
        new Response(JSON.stringify(value), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      if (url.endsWith('/api/chatbots/42/name')) {
        return jsonResponse({ name: 'Demo Chatbot' });
      }
      if (url.endsWith('/api/start-chat')) {
        return jsonResponse({ chat_session_id: 21, capability });
      }
      if (url.endsWith('/api/chat-sessions/21/messages')) {
        return jsonResponse([]);
      }
      if (url.endsWith('/api/send-message')) {
        return jsonResponse({ id: 31, content: 'Assistant reply' });
      }
      throw new Error(`Unexpected request: ${url}; ${String(init?.method)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<AssistlyChat chatbotId={42} origin="https://example.com" />);
    });

    fireEvent.change(screen.getByPlaceholderText('Name'), {
      target: { value: 'Guest' },
    });
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'guest@example.com' },
    });
    const startButton = screen.getByRole('button', { name: 'Start chatting' });
    await waitFor(() => expect((startButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/api/chat-sessions/21/messages',
        expect.objectContaining({
          headers: { Authorization: 'Bearer ' + capability },
        }),
      );
    });

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {
      target: { value: 'Please help' },
    });
    const sendButton = screen.getByLabelText('Send message');
    await waitFor(() => expect((sendButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/api/send-message',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer ' + capability,
          }),
        }),
      );
    });
  });
});
