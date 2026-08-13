export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface LLMClient {
  /**
   * Sends a chat completion request and returns the raw text response.
   * Implementations should request JSON-only output when jsonMode is true
   * (via response_format or equivalent) so callers can parse structured data.
   */
  complete(
    messages: ChatMessage[],
    options?: { jsonMode?: boolean; temperature?: number },
  ): Promise<string>;
}
