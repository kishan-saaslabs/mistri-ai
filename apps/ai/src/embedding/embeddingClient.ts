export interface EmbeddingClient {
  /**
   * The actual configured model name (e.g. "text-embedding-3-large"), NOT
   * a placeholder label — this is what gets recorded on chunk_embeddings
   * rows. Confirmed live: a hardcoded label here made a real embedding-
   * model-switch bug (stale NVIDIA vectors compared against new OpenAI
   * query vectors — same dimension, completely incompatible space, no
   * error, just silently meaningless retrieval) far harder to diagnose
   * than it needed to be. Every row should say what actually produced it.
   */
  readonly model: string;

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
  /**
   * Which provider's embeddings request quirks to speak — confirmed live
   * that these two are opposite in exactly the fields that matter:
   * - "nim": NVIDIA NIM's asymmetric-encoder models (e.g. nv-embedqa-e5-v5)
   *   require `input_type: 'query'|'passage'` and reject the request
   *   outright if `dimensions` is present at all.
   * - "openai": real OpenAI's /v1/embeddings has no asymmetric-encoder
   *   concept (no `input_type`) and validates its request schema strictly
   *   — sending an unrecognized field risks an outright 400, not a
   *   silently-ignored one. It DOES need `dimensions` to get anything
   *   other than the model's native width (3072 for text-embedding-3-large),
   *   which is exactly the parameter NIM rejects.
   * Set explicitly by the caller (getEmbeddingClient) from the configured
   * provider label — never guessed here. A third provider needs its own
   * verified entry, not an assumption that one of these two applies.
   */
  wireFormat: "nim" | "openai";
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

  get model(): string {
    return this.config.model;
  }

  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    if (texts.length === 0) return [];

    const body: Record<string, unknown> = {
      model: this.config.model,
      input: texts,
    };

    if (this.config.wireFormat === "nim") {
      // NVIDIA NIM's asymmetric-encoder models (confirmed live against
      // nv-embedqa-e5-v5) use 'query'/'passage', not OpenAI's own
      // document/query wording, and reject the request outright if
      // `dimensions` is present at all.
      body.input_type = kind === "document" ? "passage" : "query";
    } else {
      // Real OpenAI: no input_type concept, but `dimensions` is required
      // to get anything narrower than the model's native width (3072 for
      // text-embedding-3-large) — the exact parameter NIM rejects.
      body.dimensions = this.config.dimensions;
    }

    // `this.config.dimensions` is ALSO enforced below as a response-shape
    // invariant regardless of wireFormat: the fixed-width `vector(N)`
    // Postgres column can't safely accept a mismatched length, so a
    // provider/model returning an unexpected size fails loudly here
    // rather than silently corrupting the column.
    const response = await fetch(`${this.config.baseUrl}/embeddings`, {
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
