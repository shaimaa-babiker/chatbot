import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  '/chatbot(.*)',
  '/api/send-message(.*)',
  '/api/start-chat(.*)',
  '/api/chatbots(.*)',
  '/api/chat-sessions(.*)',
  '/api/invite/mark(.*)',
  '/login(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  await auth.protect({ unauthenticatedUrl: req.nextUrl.origin + '/login' });
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};