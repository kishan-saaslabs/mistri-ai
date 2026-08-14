export type Role = "OWNER" | "ADMIN" | "TEAM_MEMBER";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  org: string | null;
  organizationId: string;
  role: Role;
  createdAt: string;
};

export type AuthResponse = {
  user: AuthUser;
  token: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
  org?: string;
  role?: Role;
};

export type Deal = {
  id: string;
  organization_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
};

export type CallStatus =
  | "PROCESSING"
  | "PYAI_TRANSCRIBING"
  | "PYAI_SUCCESS"
  | "PYAI_FAILED"
  | "LLM_TRANSCRIBING"
  | "LLM_SUCCESS"
  | "LLM_FAILED";

export type TranscriptionStatus = CallStatus;

export function isPendingStatus(status: CallStatus) {
  return (
    status === "PROCESSING" ||
    status === "PYAI_TRANSCRIBING" ||
    status === "LLM_TRANSCRIBING"
  );
}

export function isFailedStatus(status: CallStatus) {
  return status === "PYAI_FAILED" || status === "LLM_FAILED";
}

export type Call = {
  id: string;
  organization_id: string;
  deal_id: string | null;
  uploaded_by: string | null;
  label: string;
  filename: string | null;
  duration_seconds: number;
  status: CallStatus;
  fileUrl: string | null;
  source_url: string | null;
  created_at: string;
};

export type TranscriptSegment = {
  id: string;
  type: "final" | "partial";
  start: number | null;
  end: number | null;
  speaker: string | null;
  text: string;
  speakerName?: string;
};

export type Transcription = {
  id: string;
  call_id: string;
  provider: string;
  model: string;
  status: TranscriptionStatus;
  language: string | null;
  duration_seconds: number | null;
  full_text: string | null;
  segments: TranscriptSegment[];
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type CallDetail = {
  call: Call;
  transcriptions: Transcription[];
};

export type InsightEvidence = {
  segmentId: string;
  quote: string;
};

export type CallInsightStatus = "PROCESSING" | "SUCCESS" | "FAILED";

export type CallInsight = {
  id: string;
  call_id: string;
  transcription_id: string;
  status: CallInsightStatus;
  summary: { title: string; text: string; evidence: InsightEvidence[] }[];
  objections: { title: string; text: string; evidence: InsightEvidence[] }[];
  customer_wants: {
    label: string;
    confidence: "high" | "medium" | "low";
    evidence: InsightEvidence[];
  }[];
  next_steps: {
    text: string;
    owner: string;
    evidence: InsightEvidence[];
  }[];
  follow_up_email: {
    subject: string;
    body: string;
    confidence: "high" | "medium" | "low";
    evidence: InsightEvidence[];
  } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateOrgUserInput = {
  email: string;
  password: string;
  name: string;
  role?: Role;
};

export type ChatScopeType = "call" | "deal";

export type AskAttach = {
  type: ChatScopeType;
  id: string;
  name: string;
};

export type Conversation = {
  id: string;
  scope_type: ChatScopeType;
  scope_call_id: string | null;
  scope_deal_id: string | null;
  title: string;
  last_activity_at: string;
};

export type ChatCitation = {
  segmentId: string;
  chunkId: string;
  quote: string;
};

export type ChatStage = "authorizing" | "retrieving" | "generating";

export type ChatNotice = {
  kind: string;
  text: string;
};

export type ChatTurnResult = {
  text: string;
  citations: ChatCitation[];
  notice: ChatNotice | null;
  messageId: string | null;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[];
  notice?: ChatNotice | null;
  created_at: string;
};

/** POST /api/conversations — CreateConversationResponse in Swagger */
export type CreateConversationResult = {
  conversationId: string;
  effectiveTranscriptCount: number;
  scopeDescription: string;
};

export function conversationFromCreate(
  result: CreateConversationResult,
  attach: AskAttach,
): Conversation {
  const at = new Date().toISOString();
  return {
    id: result.conversationId,
    scope_type: attach.type,
    scope_call_id: attach.type === "call" ? attach.id : null,
    scope_deal_id: attach.type === "deal" ? attach.id : null,
    title: attach.name,
    last_activity_at: at,
  };
}

/**
 * Base path for the API. Requests go through Vite's dev proxy (`/api` ->
 * http://localhost:3001) so cookies are same-origin. In production this can be
 * pointed at an absolute URL via VITE_API_URL.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // For multipart uploads let the browser set Content-Type (with the boundary).
  const isForm =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  if (!isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      // Send/receive the HttpOnly access_token cookie set by the auth endpoints.
      credentials: "include",
      ...init,
      headers,
    });
  } catch {
    throw new ApiError(0, "Network error — is the API running?");
  }

  const isJson = res.headers
    .get("content-type")
    ?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message =
      (payload && (payload.error || payload.message)) ||
      defaultErrorMessage(res.status);
    throw new ApiError(res.status, message);
  }

  return payload as T;
}

function defaultErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return "Invalid email or password.";
    case 409:
      return "An account with that email already exists.";
    case 429:
      return "Too many attempts. Please try again in a moment.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export const authApi = {
  login: (input: LoginInput) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  register: (input: RegisterInput) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  logout: () =>
    request<null>("/auth/logout", {
      method: "POST",
    }),

  me: () => request<{ user: AuthUser }>("/auth/me"),
};

export const dealsApi = {
  list: () =>
    request<{ deals: Deal[] }>("/deals").then((r) => r.deals),

  create: (name: string) =>
    request<{ deal: Deal }>("/deals", {
      method: "POST",
      body: JSON.stringify({ name }),
    }).then((r) => r.deal),

  calls: (dealId: string) =>
    request<{ calls: Call[] }>(`/deals/${dealId}/calls`).then((r) => r.calls),

  members: (dealId: string) =>
    request<{ users: AuthUser[] }>(`/deals/${dealId}/users`).then(
      (r) => r.users,
    ),

  addMembers: (dealId: string, userIds: string[]) =>
    request<{ users: AuthUser[] }>(`/deals/${dealId}/users`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    }).then((r) => r.users),
};

export const usersApi = {
  list: () =>
    request<{ users: AuthUser[] }>("/users").then((r) => r.users),

  create: (input: CreateOrgUserInput) =>
    request<{ user: AuthUser }>("/users", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.user),
};

export const callsApi = {
  list: () =>
    request<{ calls: Call[] }>("/calls").then((r) => r.calls),

  get: (id: string) => request<CallDetail>(`/calls/${id}`),

  insights: (id: string) =>
    request<{ insights: CallInsight | null }>(`/calls/${id}/insights`).then(
      (r) => r.insights,
    ),

  audioUrl: (id: string) => `/api/calls/${id}/audio`,

  uploadToDeal: async (dealId: string, file: File) => {
    const contentType = file.type || undefined;
    const presign = await request<{
      objectKey: string;
      uploadUrl: string;
      headers: Record<string, string>;
    }>("/calls/uploads/presign", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        contentType,
        size: file.size,
        dealId,
      }),
    });

    let uploaded: Response;
    try {
      uploaded = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: presign.headers,
        body: file,
      });
    } catch {
      throw new ApiError(0, "Could not reach object storage — is MinIO running?");
    }
    if (!uploaded.ok) {
      throw new ApiError(uploaded.status, "Could not upload the recording.");
    }

    return request<{ call: Call }>("/calls/uploads/complete", {
      method: "POST",
      body: JSON.stringify({
        objectKey: presign.objectKey,
        filename: file.name,
        dealId,
      }),
    }).then((r) => r.call);
  },

  linkToDeal: (input: { url: string; dealId: string; label?: string }) =>
    request<{ call: Call }>("/calls/link", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.call),
};

export const conversationsApi = {
  create: (input: {
    scopeType: ChatScopeType;
    callId?: string;
    dealId?: string;
  }) =>
    request<CreateConversationResult>("/conversations", {
      method: "POST",
      body: JSON.stringify(
        input.scopeType === "call"
          ? { scopeType: "call", callId: input.callId }
          : { scopeType: "deal", dealId: input.dealId },
      ),
    }),

  messages: (id: string) =>
    request<{ messages: ChatMessage[] }>(
      `/conversations/${encodeURIComponent(id)}/messages`,
    ).then((r) => r.messages),

  send: (
    id: string,
    content: string,
    onStage?: (stage: ChatStage) => void,
  ) => postConversationMessage(id, content, onStage),
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function postConversationMessage(
  id: string,
  content: string,
  onStage?: (stage: ChatStage) => void,
) {
  if (!UUID_RE.test(id)) {
    throw new ApiError(400, "Conversation id is required.");
  }

  let res: Response;
  try {
    res = await fetch(
      `${API_BASE}/api/conversations/${encodeURIComponent(id)}/messages`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ content }),
      },
    );
  } catch {
    throw new ApiError(0, "Network error — is the API running?");
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isSse = contentType.includes("text/event-stream");
  if (!isSse) {
    const payload = contentType.includes("application/json")
      ? await res.json().catch(() => null)
      : null;
    throw new ApiError(
      res.status || 0,
      (payload && (payload.error || payload.message)) ||
        defaultErrorMessage(res.status),
    );
  }

  const result: ChatTurnResult & {
    error: { status: number; message: string } | null;
  } = {
    text: "",
    citations: [],
    notice: null,
    messageId: null,
    error: null,
  };

  await readSse(res, (event, data) => {
    if (event === "stage" && data && typeof data === "object" && "stage" in data) {
      const stage = String((data as { stage: unknown }).stage);
      if (
        stage === "authorizing" ||
        stage === "retrieving" ||
        stage === "generating"
      ) {
        onStage?.(stage);
      }
    } else if (event === "answer" && data && typeof data === "object" && "text" in data) {
      result.text = String((data as { text: unknown }).text ?? "");
    } else if (event === "citation" && data && typeof data === "object") {
      const c = data as ChatCitation;
      if (c.segmentId && c.quote) result.citations.push(c);
    } else if (event === "notice" && data && typeof data === "object") {
      const n = data as { kind?: unknown; text?: unknown };
      result.notice = {
        kind: typeof n.kind === "string" ? n.kind : "notice",
        text: typeof n.text === "string" ? n.text : "",
      };
    } else if (event === "done" && data && typeof data === "object") {
      const id = (data as { messageId?: unknown }).messageId;
      result.messageId = typeof id === "string" ? id : null;
    } else if (event === "error" && data && typeof data === "object") {
      const err = data as { status?: unknown; message?: unknown };
      result.error = {
        status: typeof err.status === "number" ? err.status : 500,
        message:
          typeof err.message === "string"
            ? err.message
            : "Chat generation failed",
      };
    }
    return event === "done" || event === "error";
  });

  if (result.error) {
    throw new ApiError(result.error.status, result.error.message);
  }
  return {
    text: result.text,
    citations: result.citations,
    notice: result.notice,
    messageId: result.messageId,
  };
}

function parseSseBlock(
  block: string,
  onEvent: (event: string, data: unknown) => boolean | void,
) {
  let event = "message";
  let payload = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) payload += line.slice(5).trim();
  }
  if (!payload) return false;
  try {
    return onEvent(event, JSON.parse(payload) as unknown) === true;
  } catch {
    return onEvent(event, payload) === true;
  }
}

async function readSse(
  res: Response,
  onEvent: (event: string, data: unknown) => boolean | void,
) {
  const reader = res.body?.getReader();
  if (!reader) throw new ApiError(0, "Empty chat response");
  const decoder = new TextDecoder();
  let buf = "";
  const finish = () => reader.cancel().catch(() => undefined);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";
    for (const block of blocks) {
      if (parseSseBlock(block, onEvent)) {
        void finish();
        return;
      }
    }
  }
  buf += decoder.decode();
  if (buf.trim()) parseSseBlock(buf, onEvent);
}
