import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    {
      error:
        "Free-form AI classification has been removed. Configure tags in the chatbot edit page and apply them from Analytics.",
    },
    { status: 410 },
  );
}
