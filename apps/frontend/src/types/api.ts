export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageStatus =
  | 'pending'
  | 'streaming'
  | 'complete'
  | 'cancelled'
  | 'error'
  | 'interrupted';

export interface Conversation {
  id: string;
  title: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: string; // Prisma Decimal serialized as string
  createdAt: string; // ISO
  completedAt?: string; // ISO
  errorReason?: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export interface Stats {
  messagesProcessed: number;
  costTotalUsd: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  retryAfter?: number; // 429
  error?: string;
  timestamp?: string;
  path?: string;
}
