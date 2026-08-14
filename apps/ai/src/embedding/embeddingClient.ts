export interface EmbeddingClient {
  /**
   * Embeds a batch of texts. `kind` distinguishes document-time text
   * (chunk bodies, long third-person dialogue) from query-time text
   * (short first-person questions) — some providers accept an input-type
   * hint for this; passed through when supported, ignored otherwise.
   */
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}

export type OpenAiCompatibleEmbeddingClientConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
};

/**
 * Implements EmbeddingClient against the OpenAI embeddings wire format
 * (POST {baseUrl}/embeddings) — the same "provider identity is just
 * config" principle as OpenAiCompatibleClient for chat completions, kept
 * as a separate class because the request/response shapes differ (no
 * messages/response_format, a flat `input` array, and a `dimensions`
 * parameter this repo pins per-org rather than accepting the provider's
 * default).
 */
export class OpenAiCompatibleEmbeddingClient implements EmbeddingClient {
  constructor(private readonly config: OpenAiCompatibleEmbeddingClientConfig) {}

  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    if (texts.length === 0) return [];

    // NVIDIA NIM's embedding endpoints (confirmed live against
    // nv-embedqa-e5-v5) use the asymmetric-encoder convention
    // 'query'/'passage' for input_type, not OpenAI's own
    // document/query wording — this is the one field this wire format
    // isn't actually shared verbatim across providers, so it's translated
    // here rather than passed through raw.
    const inputType = kind === "document" ? "passage" : "query";

    // `dimensions` (OpenAI's truncation parameter) is NOT sent — confirmed
    // live that at least one NIM embedding model (nv-embedqa-e5-v5) rejects
    // the request outright if it's present at all, unlike OpenAI's
    // text-embedding-3-* models where it's optional truncation. Instead,
    // `this.config.dimensions` is enforced below as a response-shape
    // invariant: the fixed-width `vector(N)` Postgres column can't safely
    // accept a mismatched length, so a provider/model returning a
    // different size fails loudly here rather than corrupting the column.
    const response = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "<unreadable body>");
      throw new Error(
        `Embedding request failed: ${response.status} ${response.statusText} — ${responseBody}`,
      );
    }

    const data = (await response.json()) as { data?: { embedding?: number[]; index?: number }[] };
    if (!Array.isArray(data.data) || data.data.length !== texts.length) {
      throw new Error(`Embedding response had unexpected shape: ${JSON.stringify(data).slice(0, 500)}`);
    }

    // Providers aren't guaranteed to return entries in request order — sort
    // by the returned `index` when present so embeddings[i] always lines
    // up with texts[i].
    const ordered = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return ordered.map((item) => {
      if (!Array.isArray(item.embedding)) {
        throw new Error(`Embedding response item missing embedding array: ${JSON.stringify(item).slice(0, 200)}`);
      }
      if (item.embedding.length !== this.config.dimensions) {
        throw new Error(
          `Embedding model ${this.config.model} returned ${item.embedding.length}-dim vectors, but ` +
            `LLM_EMBEDDING_DIMENSIONS is set to ${this.config.dimensions} (this must match the ` +
            `chunk_embeddings.embedding column width). Update LLM_EMBEDDING_DIMENSIONS to match — ` +
            `changing it after chunks already exist requires re-embedding.`,
        );
      }
      return item.embedding;
    });
  }
}
