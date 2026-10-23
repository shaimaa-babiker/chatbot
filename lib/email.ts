import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// Config — Gmail SMTP with App Password
// ---------------------------------------------------------------------------
const GMAIL_USER  = process.env.GMAIL_USER?.trim();       // e.g. supportoptika@gmail.com
const GMAIL_PASS  = process.env.GMAIL_APP_PASSWORD?.trim(); // 16-char App Password from Google
const ADMIN_EMAIL = (process.env.ADMIN_NOTIFY_EMAIL ?? GMAIL_USER ?? "").trim();

if (!GMAIL_USER || !GMAIL_PASS) {
  console.warn("[email] GMAIL_USER or GMAIL_APP_PASSWORD not set — emails will be skipped.");
} else {
  console.log("[email] Gmail SMTP ready");
}

function createTransport() {
  if (!GMAIL_USER || !GMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS,
    },
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type AdminDigestPayload = {
  chatbotName: string;
  guestName: string | null;
  guestEmail: string | null;
  sessionId: number;
  sessionCreatedAt: string;
  appBaseUrl: string;
};

export type InviteEmailPayload = {
  invitedEmail: string;
  role: "editor" | "viewer";
  appBaseUrl: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const transport = createTransport();
  if (!transport) {
    return { ok: false, error: "Gmail credentials not configured" };
  }

  try {
    const info = await transport.sendMail({
      from: `"Assistly" <${GMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    console.log(`[email] Sent to ${options.to}`, { id: info.messageId });
    return { ok: true, id: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gmail SMTP error";
    console.error("[email] Gmail SMTP error:", msg);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// HTML builders
// ---------------------------------------------------------------------------
function buildDigestHtml(payload: AdminDigestPayload): string {
  const guestName = payload.guestName?.trim() || "A visitor";
  const guestEmail = payload.guestEmail?.trim();
  const sessionUrl = `${payload.appBaseUrl.replace(/\/$/, "")}/review-sessions/${payload.sessionId}`;
  const safeName = escapeHtml(guestName);
  const safeEmail = guestEmail ? escapeHtml(guestEmail) : "";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e1e1e; line-height: 1.5;">
      <h2 style="margin: 0 0 16px; font-size: 18px;">New chat session</h2>
      <p style="margin: 0 0 16px;"><strong>Name:</strong> ${safeName}</p>
      ${safeEmail ? `<p style="margin: 0 0 16px;"><strong>Email:</strong> ${safeEmail}</p>` : ""}
      <p style="margin: 0 0 24px;"><strong>Session ID:</strong> #${payload.sessionId}</p>
      <p style="margin: 0 0 24px;">
        <a href="${sessionUrl}" style="display: inline-block; background: #1e1e1e; color: #faf6ef; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Open conversation
        </a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #6b6b6b;">
        Sent by Assistly · ${escapeHtml(payload.chatbotName)} · ${escapeHtml(payload.sessionCreatedAt)}
      </p>
    </div>
  `.trim();
}

function buildInviteHtml(payload: InviteEmailPayload): string {
  const signInUrl = `${payload.appBaseUrl.replace(/\/$/, "")}/login?invited=1`;
  const roleLabel = payload.role === "editor" ? "Editor" : "Viewer";
  const roleDesc =
    payload.role === "editor"
      ? "You can review chat sessions and manage chatbot settings."
      : "You can review chat sessions in read-only mode.";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e1e1e; line-height: 1.5;">
      <h2 style="margin: 0 0 16px; font-size: 18px;">Assistly team invitation</h2>
      <p style="margin: 0 0 16px;">
        An Assistly workspace owner added this email address as a team member with the <strong>${roleLabel}</strong> role.
      </p>
      <p style="margin: 0 0 24px; color: #4b4b4b; font-size: 14px;">${roleDesc}</p>
      <p style="margin: 0 0 24px;">
        <a href="${signInUrl}" style="display: inline-block; background: #1e1e1e; color: #faf6ef; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Sign in to Assistly
        </a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #6b6b6b;">
        Sign in using ${escapeHtml(payload.invitedEmail)}. If you do not have an account, create one using this same email address.
      </p>
      <p style="margin: 16px 0 0; font-size: 12px; color: #6b6b6b;">
        If you were not expecting this invitation, you can ignore this email.
      </p>
    </div>
  `.trim();
}

function buildInviteText(payload: InviteEmailPayload): string {
  const signInUrl = `${payload.appBaseUrl.replace(/\/$/, "")}/login?invited=1`;
  const roleLabel = payload.role === "editor" ? "Editor" : "Viewer";
  const roleDesc =
    payload.role === "editor"
      ? "You can review chat sessions and manage chatbot settings."
      : "You can review chat sessions in read-only mode.";

  return [
    "Assistly team invitation",
    "",
    `An Assistly workspace owner added ${payload.invitedEmail} as a ${roleLabel}.`,
    roleDesc,
    "",
    `Sign in to Assistly: ${signInUrl}`,
    `Use this email address to sign in: ${payload.invitedEmail}`,
    "If you do not have an account, create one using the same email address.",
    "",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export async function sendAdminNewMessageDigest(
  payload: AdminDigestPayload,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const subject = `New chat session from ${payload.guestName?.trim() || "a visitor"} on ${payload.chatbotName}`;
  return sendMail({
    to: ADMIN_EMAIL,
    subject,
    html: buildDigestHtml(payload),
    text: [
      "New chat session",
      `Name: ${payload.guestName?.trim() || "A visitor"}`,
      `Email: ${payload.guestEmail?.trim() || "Not provided"}`,
      `Session ID: ${payload.sessionId}`,
      `Chatbot: ${payload.chatbotName}`,
      `${payload.appBaseUrl.replace(/\/$/, "")}/review-sessions/${payload.sessionId}`,
    ].join("\n"),
  });
}

export async function sendInviteEmail(
  payload: InviteEmailPayload,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const roleLabel = payload.role === "editor" ? "Editor" : "Viewer";
  return sendMail({
    to: payload.invitedEmail,
    subject: `Assistly workspace invitation (${roleLabel})`,
    html: buildInviteHtml(payload),
    text: buildInviteText(payload),
  });
}
