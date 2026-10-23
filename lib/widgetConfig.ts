export const FONT_FAMILIES = [
  "Inter, Arial, sans-serif",
  "Arial, sans-serif",
  "Georgia, serif",
  "system-ui, sans-serif",
  "'Trebuchet MS', sans-serif",
] as const;

export type WidgetConfig = {
  headerTitle: string;
  subtitle: string;
  primaryColor: string;
  panelBackground: string;
  textColor: string;
  userBubbleColor: string;
  userBubbleTextColor: string;
  fontFamily: (typeof FONT_FAMILIES)[number];
  logoUrl: string;
  inputPlaceholder: string;
  sendButtonLabel: string;
  borderRadius: number;
  showSecureBadge: boolean;
  showPoweredBy: boolean;
};

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  headerTitle: "",
  subtitle: "Online · replies in seconds",
  primaryColor: "#496b91",
  panelBackground: "#f4f6f8",
  textColor: "#101820",
  userBubbleColor: "#2b64e3",
  userBubbleTextColor: "#ffffff",
  fontFamily: FONT_FAMILIES[0],
  logoUrl: "",
  inputPlaceholder: "Write a message…",
  sendButtonLabel: "Send",
  borderRadius: 14,
  showSecureBadge: true,
  showPoweredBy: true,
};

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

export function normalizeWidgetConfig(value: unknown): WidgetConfig {
  let input = value;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      input = {};
    }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_WIDGET_CONFIG };
  }

  const config = input as Record<string, unknown>;
  const fontFamily = FONT_FAMILIES.find((font) => font === config.fontFamily);
  const logoUrl = typeof config.logoUrl === "string" && config.logoUrl.length <= 2048
    ? config.logoUrl
    : "";
  return {
    headerTitle: typeof config.headerTitle === "string" && config.headerTitle.length <= 80
      ? config.headerTitle
      : DEFAULT_WIDGET_CONFIG.headerTitle,
    subtitle: typeof config.subtitle === "string" && config.subtitle.length <= 120
      ? config.subtitle
      : DEFAULT_WIDGET_CONFIG.subtitle,
    primaryColor: isHexColor(config.primaryColor)
      ? config.primaryColor
      : DEFAULT_WIDGET_CONFIG.primaryColor,
    panelBackground: isHexColor(config.panelBackground)
      ? config.panelBackground
      : DEFAULT_WIDGET_CONFIG.panelBackground,
    textColor: isHexColor(config.textColor)
      ? config.textColor
      : DEFAULT_WIDGET_CONFIG.textColor,
    userBubbleColor: isHexColor(config.userBubbleColor)
      ? config.userBubbleColor
      : DEFAULT_WIDGET_CONFIG.userBubbleColor,
    userBubbleTextColor: isHexColor(config.userBubbleTextColor)
      ? config.userBubbleTextColor
      : DEFAULT_WIDGET_CONFIG.userBubbleTextColor,
    fontFamily: fontFamily ?? DEFAULT_WIDGET_CONFIG.fontFamily,
    logoUrl,
    inputPlaceholder: typeof config.inputPlaceholder === "string" &&
        config.inputPlaceholder.length > 0 && config.inputPlaceholder.length <= 80
      ? config.inputPlaceholder
      : DEFAULT_WIDGET_CONFIG.inputPlaceholder,
    sendButtonLabel: typeof config.sendButtonLabel === "string" &&
        config.sendButtonLabel.trim().length > 0 && config.sendButtonLabel.length <= 24
      ? config.sendButtonLabel
      : DEFAULT_WIDGET_CONFIG.sendButtonLabel,
    borderRadius: typeof config.borderRadius === "number" &&
        Number.isInteger(config.borderRadius) && config.borderRadius >= 0 && config.borderRadius <= 32
      ? config.borderRadius
      : DEFAULT_WIDGET_CONFIG.borderRadius,
    showSecureBadge: typeof config.showSecureBadge === "boolean"
      ? config.showSecureBadge
      : DEFAULT_WIDGET_CONFIG.showSecureBadge,
    showPoweredBy: typeof config.showPoweredBy === "boolean"
      ? config.showPoweredBy
      : DEFAULT_WIDGET_CONFIG.showPoweredBy,
  };
}

export function isValidWidgetConfig(value: unknown): value is WidgetConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  const normalized = normalizeWidgetConfig(config);
  const keys = Object.keys(DEFAULT_WIDGET_CONFIG) as Array<keyof WidgetConfig>;
  return keys.every((key) =>
    config[key] === normalized[key],
  ) && typeof config.logoUrl === "string" && (
    config.logoUrl === "" || isHttpUrl(config.logoUrl)
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" && url.password === "";
  } catch {
    return false;
  }
}
