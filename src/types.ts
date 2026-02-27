import type { CoreMessage } from "ai";

export type MinicawConfig = {
  model: string;
  maxSteps: number;
  shellTimeout: number;
  conversationLimit: number;
  telegramBotToken?: string;
};

export type OAuthCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type AgentResult = {
  text: string;
  messages: CoreMessage[];
};
