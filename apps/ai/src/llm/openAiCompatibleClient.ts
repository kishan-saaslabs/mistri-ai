import type { ChatMessage, LLMClient } from "./llmClient.js";

export type OpenAiCompatibleClientConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * Explicit reasoning toggle for reasoning models (e.g. minimax-m3) that
   * support it. undefined = don't send the field at all, use the model's
   * own default. Sent as chat_template_kwargs.enable_thinking, the vLLM/
   * Qwen3-style convention NIM-hosted open reasoning models tend to
   * follow — unverified against this exact model's docs, so treat this as
   * best-effort until confirmed live.
   */
  thinkingMode?: boolean;
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

    if (this.config.thinkingMode !== undefined) {
      body.chat_template_kwargs = { enable_thinking: this.config.thinkingMode };
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
