/**
 * Ollama integration types
 */

/** Ollama connection status */
export interface OllamaStatus {
  connected: boolean;
  version?: string;
  url: string;
}

/** Ollama configuration */
export interface OllamaConfig {
  url: string;
  model: string;
}

/** Chat message */
export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Generate request */
export interface OllamaGenerateRequest {
  model?: string;
  prompt: string;
  system?: string;
}

/** Generate response */
export interface OllamaGenerateResponse {
  response: string;
}

/** Chat request */
export interface OllamaChatRequest {
  model?: string;
  messages: OllamaChatMessage[];
}

/** Chat response */
export interface OllamaChatResponse {
  message: OllamaChatMessage;
}
