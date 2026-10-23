import { Button } from "@/components/ui/button";
import { auth } from "@clerk/nextjs/server";
import { getMyGlobalRole } from "@/lib/adminAccess";
import { redirect } from "next/navigation";
import Link from "next/link";


export default async function Home() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const role = await getMyGlobalRole(userId);

  // Invited viewers and editors should never see the "Create chatbot" page.
  if (role === "viewer" || role === "editor") {
    redirect("/review-sessions");
  }

  return (
<main className="p-6 md:p-10 md:ml-32 m-4 md:m-10 flex flex-col justify-center rounded-md w-full">
  <h1 className="text-3xl md:text-4xl font-light" style={{ color: "#111111" }}> Welcome to {" "}
<span className="text-[#64B5F5] font-semibold">Assistly</span>
  </h1>
  <h2 className="mt-2 mb-6 md:mb-10 text-base md:text-lg text-[#64B5F5]">
    Your customisable AI  chat agent that helps your manager your customer conversations.
  </h2>
  <Link href={"/create-chatbot"} className="cursor-pointer">
  <Button className="bg-[#3b3b3b] text-white cursor-pointer">
    Lets get Started by creating Your first Chatbot
  </Button>
  </Link>
</main>
  );
}