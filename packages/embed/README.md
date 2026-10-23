# Assistly website embed

The embed is a React component, not an iframe. Install `@shaimaababiker/embed`
in a React site and mount it where the chat panel should appear:

```tsx
import { AssistlyChat } from "@shaimaababiker/embed";

export function SupportChat() {
  return (
    <div style={{ width: "100%", height: 640 }}>
      <AssistlyChat
        chatbotId={42}
        origin="https://your-assistly-deployment.example"
      />
    </div>
  );
}
```

The widget loads its saved appearance from the chatbot API. Owners can edit the
header, logo, colors, font, corner radius, input hint, send button, and optional
badges in the chatbot dashboard. `appearance` can be passed for a one-off
component override; `primaryColor` remains supported for existing integrations.

Before deploying this version, apply
[`../../migrations/add_chatbot_widget_config.sql`](../../migrations/add_chatbot_widget_config.sql)
to the production database. Rebuild and publish the package with `pnpm build`.
