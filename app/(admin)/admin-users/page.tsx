import sql from "@/lib/db";
import { isOwnerOfAnyChatbot } from "@/lib/adminAccess";
import type { AdminUser } from "@/types/types";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import InviteAdminForm from "./InviteAdminForm";
import RemoveAdminButton from "./RemoveAdminButton";

export const dynamic = "force-dynamic";

function RoleBadge({ role }: { role: string }) {
  const isEditor = role === "editor";
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        isEditor
          ? "bg-indigo-100 text-indigo-700"
          : "bg-slate-100 text-slate-600",
      ].join(" ")}
    >
      {isEditor ? "Editor" : "Viewer"}
    </span>
  );
}

export default async function AdminUsersPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const isOwner = await isOwnerOfAnyChatbot(userId);
  if (!isOwner) {
    return (
      <div className="flex-1 p-4 md:p-10 pb-24 text-gray-900 w-full max-w-5xl">
        <h1 className="text-2xl md:text-3xl font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Only chatbot owners can manage team members. Create a chatbot first
          to invite other members.
        </p>
      </div>
    );
  }

  // Read directly from NeonDB — no StepZen dependency for admin_users.
  const rows = await sql`
    SELECT id, owner_clerk_user_id, invited_email, role, created_at
    FROM admin_users
    WHERE owner_clerk_user_id = ${userId}
    ORDER BY created_at DESC
  `;
  const invites = rows as AdminUser[];

  return (
    <div className="flex-1 p-4 md:p-10 pb-24 text-gray-900 w-full max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-semibold">Team</h1>
      <p className="mt-2 text-sm md:text-base text-muted-foreground">
        Invite people to collaborate on your chatbots. Choose a role for each
        member — Editors can manage chatbot settings, Viewers can only review
        chat sessions.
      </p>

      {/* Invite section */}
      <section className="mt-6 md:mt-10 rounded-md border bg-white p-5 md:p-6">
        <h2 className="text-base md:text-lg font-semibold">Invite by email</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Enter their email address to invite them. They&apos;ll get access
          when they sign in with this email.
        </p>
        <div className="mt-4">
          <InviteAdminForm />
        </div>
      </section>

      {/* Members list */}
      <section className="mt-8 md:mt-10">
        <h2 className="text-base md:text-lg font-semibold">
          Team members ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No members invited yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y rounded-md border bg-white">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">
                      {invite.invited_email ?? "(no email)"}
                    </p>
                    <RoleBadge role={invite.role ?? "viewer"} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Invited {new Date(invite.created_at).toLocaleString()}
                  </p>
                </div>
                <RemoveAdminButton inviteId={invite.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}