import type { ChatMessage, LLMClient } from "./llmClient.js";

export type OpenAiCompatibleClientConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

/**
 * Implements LLMClient against the OpenAI chat completions wire format.
 * NVIDIA NIM, OpenAI, Groq, Together.ai, and most other providers all speak
 * this same format — provider identity is just config (baseUrl + model),
 * never a reason to add a new implementation here.
 */
export class OpenAiCompatibleClient implements LLMClient {
  constructor(private readonly config: OpenAiCompatibleClientConfig) {}

  async complete(
    messages: ChatMessage[],
    options?: { jsonMode?: boolean; temperature?: number },
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: options?.temperature,
    };

    if (options?.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "<unreadable body>");
      throw new Error(
        `LLM request failed: ${response.status} ${response.statusText} — ${responseBody}`,
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error(
        `LLM response missing choices[0].message.content: ${JSON.stringify(data)}`,
      );
    }

    return content;
  }
}
