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

export type CallStatus = "queued" | "processing" | "ready" | "failed";

export type Call = {
  id: string;
  organization_id: string;
  deal_id: string | null;
  uploaded_by: string | null;
  label: string;
  filename: string | null;
  duration_seconds: number;
  status: CallStatus;
  storage_path: string | null;
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
};

export type TranscriptionStatus =
  | "PROCESSING"
  | "PYAI_TRANSCRIBING"
  | "PYAI_SUCCESS"
  | "PYAI_FAILED";

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

export type CreateOrgUserInput = {
  email: string;
  password: string;
  name: string;
  role?: Role;
};

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
  get: (id: string) => request<CallDetail>(`/calls/${id}`),

  uploadToDeal: (dealId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("dealId", dealId);
    return request<{ call: Call }>("/calls/upload", {
      method: "POST",
      body: form,
    }).then((r) => r.call);
  },

  linkToDeal: (input: { url: string; dealId: string; label?: string }) =>
    request<{ call: Call }>("/calls/link", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.call),
};
