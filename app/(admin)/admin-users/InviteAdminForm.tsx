"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Role = "editor" | "viewer";

type Props = {
  disabled?: boolean;
};

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  {
    value: "editor",
    label: "Editor",
    description: "Can review sessions & manage chatbot settings",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "Can only view review sessions (read-only)",
  },
];

export default function InviteAdminForm({ disabled }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin-users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        emailSent?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to send invite");
        return;
      }
      setSuccess(data.emailSent
        ? `Invite added for ${email.trim().toLowerCase()} as ${role === "editor" ? "Editor" : "Viewer"}. The email was accepted for delivery; if it is not in their inbox, ask them to check Spam and mark it as not spam.`
        : `Invite added for ${email.trim().toLowerCase()}, but the email could not be sent. They can sign in at the app's login page using this email address.`
      );
      setEmail("");
      setRole("viewer");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Role selector */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Role
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={disabled || submitting}
              onClick={() => setRole(opt.value)}
              className={[
                "flex flex-col gap-0.5 rounded-lg border-2 p-3 text-left transition-all",
                role === opt.value
                  ? opt.value === "editor"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                    : "border-slate-500 bg-slate-50 text-slate-900"
                  : "border-border bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
                (disabled || submitting) ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}
            >
              <span className="font-semibold text-sm">{opt.label}</span>
              <span className="text-xs text-muted-foreground leading-tight">
                {opt.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Email + submit */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <label
            htmlFor="invite-email"
            className="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1"
          >
            Email address
          </label>
          <Input
            id="invite-email"
            type="email"
            required
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled || submitting}
            className="w-full"
          />
        </div>
        <Button
          type="submit"
          disabled={disabled || submitting || !email.trim()}
          className={
            role === "editor"
              ? "bg-indigo-600 hover:bg-indigo-700 text-white"
              : ""
          }
        >
          {submitting ? "Sending…" : `Invite as ${role === "editor" ? "Editor" : "Viewer"}`}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-600" role="status">
          {success}
        </p>
      )}
    </form>
  );
}