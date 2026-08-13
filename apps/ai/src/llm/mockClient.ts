import type { ChatMessage, LLMClient } from "./llmClient.js";

export type MockClientCall = {
  messages: ChatMessage[];
  options?: { jsonMode?: boolean; temperature?: number };
};

/** Fake LLMClient for tests — no network, no vendor, records every call it received. */
export class MockClient implements LLMClient {
  readonly calls: MockClientCall[] = [];

  constructor(private readonly cannedResponse: string) {}

  async complete(
    messages: ChatMessage[],
    options?: { jsonMode?: boolean; temperature?: number },
  ): Promise<string> {
    this.calls.push({ messages, options });
    return this.cannedResponse;
  }
}
