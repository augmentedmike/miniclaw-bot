import type { CoreMessage } from "ai";

export type Channel = "cli" | "telegram" | "email" | "api" | "dispatch";

export type Persona = {
  name: string;
  sections: Record<string, string>;
  raw: string;
};

export type MinicawConfig = {
  model: string;
  maxSteps: number;
  shellTimeout: number;
  conversationLimit: number;
  telegramBotToken?: string;
  jailDir?: string;
  activePersona?: string;
  dispatchMaxConcurrent?: number;
  dispatchIntervalMinutes?: number;
  dispatchMaxSteps?: number;
  dispatchWorkDir?: string;
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
