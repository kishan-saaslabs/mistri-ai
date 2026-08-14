export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Mistri AI API",
    version: "0.1.0",
    description:
      "Open-source conversation intelligence API. Authenticated routes use a Bearer JWT from register or login. Use Authorize in Swagger UI after login.",
    license: { name: "MIT" },
  },
  servers: [{ url: "http://localhost:3001", description: "Local development" }],
  tags: [
    { name: "Health", description: "Liveness" },
    { name: "Auth", description: "Register, login, and current user" },
    { name: "Users", description: "Organization members. OWNER and ADMIN can add users." },
    { name: "Deals", description: "Deal records. One deal can have many calls." },
    { name: "Calls", description: "Call recordings and deal mapping" },
    { name: "Transcriptions", description: "PyAI Hear Telephony batch jobs with diarized speaker segments" },
    { name: "Insights", description: "LLM-generated call insights: summary, objections, customer wants, next steps" },
    { name: "Search", description: "Direct hybrid (vector + lexical) search over a call's or deal's chunked transcript" },
    { name: "Chat", description: "Multi-turn chat over one call or deal, with evidence citations back to real transcript lines" },
  ],
  components: {
    securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "access_token",
        },
    },
    parameters: {
      UuidId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          details: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          org: { type: "string", nullable: true, description: "Organization name" },
          organizationId: { type: "string", format: "uuid" },
          role: { type: "string", enum: ["OWNER", "ADMIN", "TEAM_MEMBER"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          token: {
            type: "string",
            description:
              "JWT access token (sub, email, role, organization_id). Also set as an HttpOnly cookie named access_token. Send as Authorization: Bearer <token>, or rely on the cookie with credentials.",
          },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["email", "password", "name"],
        properties: {
          email: { type: "string", format: "email", maxLength: 320 },
          password: { type: "string", minLength: 8, maxLength: 200 },
          name: { type: "string", minLength: 1, maxLength: 120 },
          org: {
            type: "string",
            maxLength: 120,
            description: "Organization name. A new organization is created on signup. Defaults to \"{name}'s organization\" if omitted.",
          },
          role: {
            type: "string",
            enum: ["OWNER", "ADMIN", "TEAM_MEMBER"],
            description: "Optional. Defaults to OWNER if omitted.",
          },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
      Deal: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organization_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          created_by: { type: "string", format: "uuid", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      CreateDealRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
        },
      },
      Call: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          organization_id: { type: "string", format: "uuid" },
          deal_id: { type: "string", format: "uuid", nullable: true },
          uploaded_by: { type: "string", format: "uuid", nullable: true },
          label: { type: "string" },
          filename: { type: "string", nullable: true },
          duration_seconds: { type: "integer" },
          status: {
            type: "string",
            enum: ["queued", "PROCESSING", "PYAI_SUCCESS", "PYAI_FAILED"],
            description: "PyAI transcription phase only. Speaker-name inference status is tracked per transcription, not here — see Transcription.status.",
          },
          fileUrl: {
            type: "string",
            format: "uri",
            nullable: true,
            description:
              "Absolute URL to play the recording. Uploaded files are served at GET /api/calls/{id}/file (auth required). Linked calls use source_url.",
          },
          source_url: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      TranscriptSegment: {
        type: "object",
        required: ["id", "type", "text"],
        properties: {
          id: { type: "string", example: "seg_1" },
          type: { type: "string", enum: ["final", "partial"] },
          start: { type: "number", nullable: true, description: "Start time in seconds" },
          end: { type: "number", nullable: true, description: "End time in seconds" },
          speaker: { type: "string", nullable: true, description: "Diarized speaker label from PyAI Hear Telephony (e.g. speaker_0)" },
          text: { type: "string" },
          speakerName: {
            type: "string",
            description: "Present once speaker-name inference succeeds for this segment's transcription: resolved display name from call_transcripts",
          },
        },
      },
      Transcription: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          call_id: { type: "string", format: "uuid" },
          provider: { type: "string", example: "pyai" },
          model: { type: "string", example: "pyai-hear-telephony" },
          status: {
            type: "string",
            enum: [
              "PROCESSING",
              "PYAI_TRANSCRIBING",
              "PYAI_SUCCESS",
              "PYAI_FAILED",
              "LLM_TRANSCRIBING",
              "LLM_SUCCESS",
              "LLM_FAILED",
            ],
          },
          language: { type: "string", nullable: true },
          duration_seconds: { type: "number", nullable: true },
          full_text: { type: "string", nullable: true },
          segments: {
            type: "array",
            items: { $ref: "#/components/schemas/TranscriptSegment" },
          },
          error: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      InferredSpeaker: {
        type: "object",
        required: ["label", "suggestedName", "confidence", "evidence"],
        properties: {
          label: { type: "string", example: "speaker_1" },
          suggestedName: { type: "string", example: "Nick" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          evidence: { type: "string", description: "Short quote or reason from the transcript" },
        },
      },
      NamedTranscriptSegment: {
        type: "object",
        required: ["id", "type", "text", "speakerName"],
        properties: {
          id: { type: "string", example: "seg_1" },
          type: { type: "string", enum: ["final", "partial"] },
          start: { type: "number", nullable: true, description: "Start time in seconds" },
          end: { type: "number", nullable: true, description: "End time in seconds" },
          speaker: { type: "string", nullable: true, description: "Diarized speaker label from PyAI Hear Telephony (e.g. speaker_0)" },
          text: { type: "string" },
          speakerName: {
            type: "string",
            description: "Resolved display name, or the raw speaker label / \"Unknown Speaker\" when unresolved",
          },
        },
      },
      InferAndRenameResponse: {
        type: "object",
        required: ["inferred", "transcript", "readable"],
        properties: {
          inferred: {
            type: "array",
            items: { $ref: "#/components/schemas/InferredSpeaker" },
            description: "Suggestions only, not final answers — confirm with a human before committing to a name",
          },
          transcript: {
            type: "array",
            items: { $ref: "#/components/schemas/NamedTranscriptSegment" },
          },
          readable: { type: "string", description: "Flattened \"SpeakerName: text\" lines" },
          reason: {
            type: "string",
            description:
              "Present only when inference was short-circuited, e.g. no diarization data or no segments — inferred is [] in that case",
          },
        },
      },
      Evidence: {
        type: "object",
        required: ["segmentId", "quote"],
        properties: {
          segmentId: { type: "string", example: "seg_3" },
          quote: { type: "string", description: "Verbatim quote from that exact segment's text" },
        },
      },
      CallInsightSummaryItem: {
        type: "object",
        required: ["title", "text", "evidence"],
        properties: {
          title: { type: "string" },
          text: { type: "string" },
          evidence: { type: "array", items: { $ref: "#/components/schemas/Evidence" } },
        },
      },
      CallInsightObjection: {
        type: "object",
        required: ["title", "text", "evidence"],
        properties: {
          title: { type: "string" },
          text: { type: "string" },
          evidence: { type: "array", items: { $ref: "#/components/schemas/Evidence" } },
        },
      },
      CallInsightCustomerWant: {
        type: "object",
        required: ["label", "confidence", "evidence"],
        properties: {
          label: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          evidence: { type: "array", items: { $ref: "#/components/schemas/Evidence" } },
        },
      },
      CallInsightNextStep: {
        type: "object",
        required: ["text", "owner", "evidence"],
        properties: {
          text: { type: "string" },
          owner: { type: "string" },
          evidence: { type: "array", items: { $ref: "#/components/schemas/Evidence" } },
        },
      },
      CallInsightFollowUpEmail: {
        type: "object",
        required: ["subject", "body", "confidence", "evidence"],
        properties: {
          subject: { type: "string" },
          body: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          evidence: { type: "array", items: { $ref: "#/components/schemas/Evidence" } },
        },
      },
      CallInsight: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          call_id: { type: "string", format: "uuid" },
          transcription_id: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: ["PROCESSING", "SUCCESS", "FAILED"],
            description: "PROCESSING while the LLM call is in flight; summary/objections/etc. are [] until SUCCESS",
          },
          summary: { type: "array", items: { $ref: "#/components/schemas/CallInsightSummaryItem" } },
          objections: { type: "array", items: { $ref: "#/components/schemas/CallInsightObjection" } },
          customer_wants: { type: "array", items: { $ref: "#/components/schemas/CallInsightCustomerWant" } },
          next_steps: { type: "array", items: { $ref: "#/components/schemas/CallInsightNextStep" } },
          follow_up_email: {
            allOf: [{ $ref: "#/components/schemas/CallInsightFollowUpEmail" }],
            nullable: true,
          },
          error: { type: "string", nullable: true, description: "Set when status is FAILED" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      SearchRequest: {
        type: "object",
        required: ["query", "scopeType"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 2000 },
          scopeType: { type: "string", enum: ["call", "deal"] },
          callId: { type: "string", format: "uuid", description: "Required when scopeType is 'call'" },
          dealId: { type: "string", format: "uuid", description: "Required when scopeType is 'deal'" },
        },
      },
      SearchResult: {
        type: "object",
        properties: {
          rank: { type: "integer" },
          chunkId: { type: "string", format: "uuid" },
          callId: { type: "string", format: "uuid" },
          transcriptionId: { type: "string", format: "uuid" },
          segmentIds: { type: "array", items: { type: "string" } },
          text: {
            type: "string",
            description:
              "The exact bounded-expansion text shown for this hit: topic label/summary + the matched turn-window chunk + up to 2 neighbouring turns, each turn prefixed with its real segment id (e.g. [seg_20]).",
          },
          attributionUncertain: {
            type: "boolean",
            description: "True if any turn in this block came from a speaker resolved with less than high confidence.",
          },
        },
      },
      SearchResponse: {
        type: "object",
        properties: {
          results: { type: "array", items: { $ref: "#/components/schemas/SearchResult" } },
          trace: {
            type: "object",
            properties: {
              route: { type: "string", enum: ["SEMANTIC", "WHOLE_CALL", "STRUCTURED_LITE"] },
              scopeDescription: { type: "string" },
              effectiveTranscripts: { type: "integer" },
            },
          },
        },
      },
      CreateConversationRequest: {
        type: "object",
        required: ["scopeType"],
        properties: {
          scopeType: { type: "string", enum: ["call", "deal"] },
          callId: { type: "string", format: "uuid", description: "Required when scopeType is 'call'" },
          dealId: { type: "string", format: "uuid", description: "Required when scopeType is 'deal'" },
        },
      },
      Conversation: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          scope_type: { type: "string", enum: ["call", "deal"] },
          scope_call_id: { type: "string", format: "uuid", nullable: true },
          scope_deal_id: { type: "string", format: "uuid", nullable: true },
          title: { type: "string", nullable: true },
          turn_count: { type: "integer" },
          created_at: { type: "string", format: "date-time" },
          last_activity_at: { type: "string", format: "date-time" },
        },
      },
      CreateConversationResponse: {
        type: "object",
        properties: {
          conversationId: { type: "string", format: "uuid" },
          effectiveTranscriptCount: {
            type: "integer",
            description: "Number of transcriptions in scope the caller can actually read. 0 means nothing to answer from yet.",
          },
          scopeDescription: { type: "string", example: "this call (\"InboundSampleRecording\")" },
        },
      },
      PostMessageRequest: {
        type: "object",
        required: ["content"],
        properties: {
          content: { type: "string", minLength: 1, maxLength: 4000 },
        },
      },
      ChatCitation: {
        type: "object",
        required: ["segmentId", "chunkId", "quote"],
        properties: {
          segmentId: { type: "string", example: "seg_20" },
          chunkId: { type: "string", description: "A real chunks.id, or a synthetic topic:<id>/insight:<id> reference for whole-call/structured-lite answers." },
          quote: {
            type: "string",
            description:
              "Verbatim quote, verified to be an exact substring of the exact text shown to the model for this chunkId — never re-checked against a fresh lookup of the original segment's full text.",
          },
        },
      },
      ChatMessage: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          conversation_id: { type: "string", format: "uuid" },
          role: { type: "string", enum: ["user", "assistant"] },
          content: { type: "string" },
          original_query: { type: "string", nullable: true },
          rewritten_query: {
            type: "string",
            nullable: true,
            description: "Set only when the message was rewritten as a follow-up (see §8.2-style contextualization). Null on the first turn or a self-contained message.",
          },
          citations: { type: "array", items: { $ref: "#/components/schemas/ChatCitation" } },
          context_stats: {
            type: "object",
            nullable: true,
            description: "Per-turn diagnostics: route taken, history/evidence token-budget outcome, citations dropped by the evidence gate, whether an attribution-uncertainty caveat fired.",
          },
          created_at: { type: "string", format: "date-time" },
        },
      },
      LinkCallRequest: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri", maxLength: 2048 },
          dealId: { type: "string", format: "uuid", nullable: true },
          label: { type: "string", maxLength: 200 },
        },
      },
      PresignUploadRequest: {
        type: "object",
        required: ["filename", "size"],
        properties: {
          filename: { type: "string", minLength: 1, maxLength: 240 },
          contentType: { type: "string", maxLength: 100 },
          size: { type: "integer", minimum: 1, description: "Declared file size in bytes" },
          dealId: { type: "string", format: "uuid", nullable: true },
        },
      },
      PresignUploadResponse: {
        type: "object",
        required: ["objectKey", "uploadUrl", "headers", "expiresIn"],
        properties: {
          objectKey: { type: "string" },
          uploadUrl: { type: "string", format: "uri" },
          headers: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Headers the client must send on the PUT. Do not log uploadUrl.",
          },
          expiresIn: { type: "integer", description: "Seconds until the PUT URL expires" },
        },
      },
      CompleteUploadRequest: {
        type: "object",
        required: ["objectKey", "filename"],
        properties: {
          objectKey: { type: "string", minLength: 1, maxLength: 512 },
          filename: { type: "string", minLength: 1, maxLength: 240 },
          dealId: { type: "string", format: "uuid", nullable: true },
        },
      },
      UpdateCallRequest: {
        type: "object",
        required: ["dealId"],
        properties: {
          dealId: { type: "string", format: "uuid", nullable: true, description: "Set null to unassign" },
        },
      },
      AddOrgUserRequest: {
        type: "object",
        required: ["email", "password", "name"],
        properties: {
          email: { type: "string", format: "email", maxLength: 320 },
          password: {
            type: "string",
            minLength: 8,
            maxLength: 200,
            description: "Temporary password to share with the teammate. Not returned in the response.",
          },
          name: { type: "string", minLength: 1, maxLength: 120 },
          role: {
            type: "string",
            enum: ["OWNER", "ADMIN", "TEAM_MEMBER"],
            description: "Optional. Defaults to TEAM_MEMBER. ADMIN cannot create OWNER.",
          },
        },
      },
      AddDealUserRequest: {
        type: "object",
        required: ["userIds"],
        properties: {
          userIds: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: { type: "string", format: "uuid" },
            description: "User IDs in the same organization to map onto this deal",
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        security: [],
        responses: {
          "200": {
            description: "API is up",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", example: "ok" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } } },
        },
        responses: {
          "201": {
            description: "Account created. Sets an HttpOnly `access_token` cookie in addition to the JSON token.",
            headers: {
              "Set-Cookie": {
                schema: { type: "string" },
                description: "HttpOnly cookie named access_token",
              },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } },
          },
          "400": { description: "Validation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "409": { description: "Email already exists", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Too many attempts" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } },
        },
        responses: {
          "200": {
            description: "Authenticated. Sets an HttpOnly `access_token` cookie in addition to the JSON token.",
            headers: {
              "Set-Cookie": {
                schema: { type: "string" },
                description: "HttpOnly cookie named access_token",
              },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } },
          },
          "401": { description: "Invalid email or password", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Too many attempts" },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        description:
          "Clears the HttpOnly `access_token` cookie. Does not revoke JWTs already issued; clients should also drop any stored Bearer token. Works without a valid session so expired cookies can still be cleared.",
        security: [],
        responses: {
          "204": {
            description: "Cookie cleared",
            headers: {
              "Set-Cookie": {
                schema: { type: "string" },
                description: "Expires the access_token cookie",
              },
            },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Authenticated user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { user: { $ref: "#/components/schemas/User" } },
                },
              },
            },
          },
          "401": { description: "Missing or invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "List users in the current organization",
        description:
          "Returns every user in the caller's organization. Available to any authenticated member — used to populate team lists and deal member pickers.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Organization users",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: { type: "array", items: { $ref: "#/components/schemas/User" } },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
      post: {
        tags: ["Users"],
        summary: "Add a user to the current organization",
        description:
          "OWNER and ADMIN only. Creates a login in the caller's organization. Set email and password in the body, then share those credentials with the teammate. The password is hashed and is not returned.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AddOrgUserRequest" } } },
        },
        responses: {
          "201": {
            description: "User created in the organization",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { user: { $ref: "#/components/schemas/User" } },
                },
              },
            },
          },
          "400": { description: "Validation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Authentication required" },
          "403": { description: "Caller is not OWNER/ADMIN, or ADMIN tried to create OWNER" },
          "409": { description: "Email already exists" },
          "429": { description: "Too many attempts" },
        },
      },
    },
    "/api/deals": {
      get: {
        tags: ["Deals"],
        summary: "List deals",
        description:
          "OWNER and ADMIN see all deals in their organization. TEAM_MEMBER sees only deals they are mapped to in user_deals.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Deal list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deals: { type: "array", items: { $ref: "#/components/schemas/Deal" } },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
      post: {
        tags: ["Deals"],
        summary: "Create deal",
        description: "Creates a deal and maps the current user in user_deals.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateDealRequest" } } },
        },
        responses: {
          "201": {
            description: "Deal created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { deal: { $ref: "#/components/schemas/Deal" } },
                },
              },
            },
          },
          "400": { description: "Validation failed" },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/deals/{id}/calls": {
      get: {
        tags: ["Deals"],
        summary: "List calls for a deal",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description: "Calls mapped to this deal",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    calls: { type: "array", items: { $ref: "#/components/schemas/Call" } },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this deal" },
          "404": { description: "Deal not found" },
        },
      },
    },
    "/api/deals/{id}/users": {
      get: {
        tags: ["Deals"],
        summary: "List users mapped to a deal",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description: "Deal members",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: { type: "array", items: { $ref: "#/components/schemas/User" } },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this deal" },
          "404": { description: "Deal not found" },
        },
      },
      post: {
        tags: ["Deals"],
        summary: "Map users to a deal",
        description:
          "OWNER, ADMIN, or the deal creator can map one or more organization users to the deal. Already-mapped users are skipped.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AddDealUserRequest" } } },
        },
        responses: {
          "201": {
            description: "Users mapped to the deal",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: { type: "array", items: { $ref: "#/components/schemas/User" } },
                  },
                },
              },
            },
          },
          "400": { description: "User not found" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to share this deal" },
          "404": { description: "Deal not found" },
        },
      },
    },
    "/api/calls": {
      get: {
        tags: ["Calls"],
        summary: "List calls",
        description:
          "OWNER and ADMIN see all calls in their organization. TEAM_MEMBER sees calls on mapped deals plus their own unassigned uploads.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "All calls, newest first",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    calls: { type: "array", items: { $ref: "#/components/schemas/Call" } },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/calls/uploads/presign": {
      post: {
        tags: ["Calls"],
        summary: "Mint a presigned upload URL",
        description:
          "Returns a short-lived PUT URL for S3-compatible object storage. The browser uploads the file directly, then calls POST /api/calls/uploads/complete. Do not log the URL.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/PresignUploadRequest" } },
          },
        },
        responses: {
          "201": {
            description: "Presigned PUT",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/PresignUploadResponse" } },
            },
          },
          "400": { description: "Unsupported type or invalid deal" },
          "401": { description: "Authentication required" },
          "413": { description: "File too large" },
          "503": { description: "Object storage is not configured" },
        },
      },
    },
    "/api/calls/uploads/complete": {
      post: {
        tags: ["Calls"],
        summary: "Finish a direct object-storage upload",
        description:
          "Confirms the object exists in the private bucket, creates the call, and starts PyAI Hear with a presigned audio_url (PyAI fetches the object; the API does not re-upload the bytes).",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CompleteUploadRequest" } },
          },
        },
        responses: {
          "201": {
            description: "Call created; transcription started",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { call: { $ref: "#/components/schemas/Call" } },
                },
              },
            },
          },
          "400": { description: "Invalid key, missing object, or unknown deal" },
          "401": { description: "Authentication required" },
          "413": { description: "File too large" },
        },
      },
    },
    "/api/calls/upload": {
      post: {
        tags: ["Calls"],
        summary: "Upload a recording",
        description:
          "Multipart upload. Field name must be `file`. Optional `dealId`. The API stores the file in object storage and starts PyAI Hear. Prefer POST /api/calls/uploads/presign for large files. Poll GET /api/calls/{id} until the transcription status is PYAI_SUCCESS or PYAI_FAILED.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "MP3, WAV, M4A, or MP4",
                  },
                  dealId: { type: "string", format: "uuid", description: "Optional deal to map this call to" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Call created; transcription started",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { call: { $ref: "#/components/schemas/Call" } },
                },
              },
            },
          },
          "400": { description: "Missing file, unsupported type, or unknown deal" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to assign this deal" },
          "413": { description: "File too large" },
        },
      },
    },
    "/api/calls/link": {
      post: {
        tags: ["Calls"],
        summary: "Create a call from a recording URL",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LinkCallRequest" } } },
        },
        responses: {
          "201": {
            description: "Call created from link",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { call: { $ref: "#/components/schemas/Call" } },
                },
              },
            },
          },
          "400": { description: "Invalid URL or deal" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to assign this deal" },
        },
      },
    },
    "/api/calls/{id}/file": {
      get: {
        tags: ["Calls"],
        summary: "Play or download the uploaded recording",
        description:
          "Streams the stored file with Range support. Requires the same access as GET /api/calls/{id}. Use the `fileUrl` on the call object as an absolute URL.",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description: "Audio or video bytes",
            content: {
              "audio/mpeg": { schema: { type: "string", format: "binary" } },
              "audio/wav": { schema: { type: "string", format: "binary" } },
              "audio/mp4": { schema: { type: "string", format: "binary" } },
              "video/mp4": { schema: { type: "string", format: "binary" } },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this call" },
          "404": { description: "Call or recording file not found" },
        },
      },
    },
    "/api/calls/{id}": {
      get: {
        tags: ["Calls"],
        summary: "Get call with transcriptions",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description:
              "Call and its transcription rows. Segments come from `transcriptions` until speaker-name inference finishes. When a transcription's status is LLM_SUCCESS, `segments` are served from `call_transcripts` (named speakers) for that transcription_id.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    call: { $ref: "#/components/schemas/Call" },
                    transcriptions: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Transcription" },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this call" },
          "404": { description: "Call not found" },
        },
      },
      patch: {
        tags: ["Calls"],
        summary: "Map call to a deal",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateCallRequest" } } },
        },
        responses: {
          "200": {
            description: "Updated call",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { call: { $ref: "#/components/schemas/Call" } },
                },
              },
            },
          },
          "400": { description: "Deal not found" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to map this call or target deal" },
          "404": { description: "Call not found" },
        },
      },
    },
    "/api/calls/{id}/audio": {
      get: {
        tags: ["Calls"],
        summary: "Stream the uploaded recording",
        description:
          "Authenticated download of the stored file. Supports HTTP Range. Calls that only have a source URL (no upload) return 404 — play `source_url` on the client instead.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description: "Full recording",
            content: {
              "audio/mpeg": { schema: { type: "string", format: "binary" } },
              "audio/wav": { schema: { type: "string", format: "binary" } },
              "audio/mp4": { schema: { type: "string", format: "binary" } },
              "video/mp4": { schema: { type: "string", format: "binary" } },
            },
          },
          "206": { description: "Partial content" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this call" },
          "404": { description: "Call or recording not found" },
          "416": { description: "Invalid Range" },
        },
      },
    },
    "/api/calls/{id}/transcriptions": {
      get: {
        tags: ["Transcriptions"],
        summary: "List transcriptions for a call",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description:
              "Transcription rows. Segments come from transcriptions by default, and from call_transcripts (named speakers) once speaker-name inference succeeds for that transcription.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    transcriptions: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Transcription" },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this call" },
          "404": { description: "Call not found" },
        },
      },
    },
    "/api/calls/{id}/transcribe": {
      post: {
        tags: ["Transcriptions"],
        summary: "Re-run PyAI Hear on the stored file",
        description: "Creates a new transcriptions row. Waits until Hear finishes.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description: "Call plus updated transcriptions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    call: { $ref: "#/components/schemas/Call" },
                    transcriptions: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Transcription" },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "No uploaded file on this call" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this call" },
          "404": { description: "Call not found" },
        },
      },
    },
    "/api/calls/{id}/infer-and-rename": {
      post: {
        tags: ["Transcriptions"],
        summary: "Queue LLM speaker-name inference for a call's transcription",
        description:
          "Enqueues a BullMQ job (queue: infer-and-rename) that infers a real name per diarized speaker label from the call's most recent ready transcription, via an OpenAI-compatible LLM (see apps/ai). Processing happens asynchronously in a worker within the apps/api process, not on this request — this endpoint only validates and enqueues, then returns immediately. Results (suggestions with confidence/evidence, not final answers) are upserted into call_transcripts keyed by transcription_id once the job completes; GET /api/calls/{id} and GET /api/calls/{id}/transcriptions reflect the named transcript once available, but there is no dedicated endpoint to poll call_transcripts directly.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "202": {
            description: "Job queued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "queued" },
                    transcriptionId: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
          "400": { description: "Call has no transcription to infer speakers from" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this call" },
          "404": { description: "Call not found" },
          "409": { description: "Transcription is not ready yet" },
        },
      },
    },
    "/api/calls/{id}/insights": {
      get: {
        tags: ["Insights"],
        summary: "Get LLM-generated insights for a call's latest transcription",
        description:
          "Reads the call_insights row for the call's most recent transcription — does not trigger generation. insights is null if speaker-name inference hasn't produced a call_transcripts row yet for this transcription (nothing has ever been queued). Once a row exists, check status: PROCESSING means a call-insights job is currently running (summary/objections/customer_wants/next_steps are still [] until it finishes), SUCCESS means the fields are populated, FAILED means check error and expect the next automatic run (after a fresh speaker-naming pass) to retry.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description: "Insights row, or null if none has ever been queued for this transcription",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    insights: {
                      allOf: [{ $ref: "#/components/schemas/CallInsight" }],
                      nullable: true,
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Call has no transcription yet" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this call" },
          "404": { description: "Call not found" },
        },
      },
    },
    "/api/search": {
      post: {
        tags: ["Search"],
        summary: "Hybrid (vector + lexical) search over a call's or deal's chunked transcript",
        description:
          "Direct retrieval, independent of chat — useful for testing retrieval quality without contextualization, generation, or the evidence gate. Scope is resolved through the same access-control gate as everything else (CallService.requireCall / listByDeal): an empty result with effectiveTranscripts: 0 means nothing readable is in scope yet, not an error.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SearchRequest" } } },
        },
        responses: {
          "200": {
            description: "Search results, ranked by RRF-fused vector + lexical score",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SearchResponse" } } },
          },
          "400": { description: "Validation failed, or missing callId/dealId for the given scopeType" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this call/deal" },
          "404": { description: "Call or deal not found" },
        },
      },
    },
    "/api/conversations": {
      get: {
        tags: ["Chat"],
        summary: "List AI chat conversations for the current user",
        description:
          "Returns the signed-in user's conversations, newest activity first. Optional `callId` or `dealId` filters to chats on that call or deal.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "callId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
            description: "Only conversations scoped to this call",
          },
          {
            name: "dealId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
            description: "Only conversations scoped to this deal",
          },
        ],
        responses: {
          "200": {
            description: "Conversations for the current user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    conversations: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Conversation" },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Validation failed" },
          "401": { description: "Authentication required" },
        },
      },
      post: {
        tags: ["Chat"],
        summary: "Start a chat conversation scoped to one call or one deal",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateConversationRequest" } } },
        },
        responses: {
          "201": {
            description: "Conversation created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateConversationResponse" } } },
          },
          "400": { description: "Validation failed, or missing callId/dealId for the given scopeType" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to access this call/deal" },
          "404": { description: "Call or deal not found" },
        },
      },
    },
    "/api/conversations/search": {
      get: {
        tags: ["Chat"],
        summary: "Search the current user's conversations by title",
        description:
          "Case-insensitive substring match on `conversations.title`. Results are limited to the signed-in user's conversations in their organization, newest activity first. Optional `callId` or `dealId` further filters to chats on that call or deal. Conversations with a null title are not returned.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 200 },
            description: "Substring to match against conversation title",
          },
          {
            name: "callId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
            description: "Only conversations scoped to this call",
          },
          {
            name: "dealId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
            description: "Only conversations scoped to this deal",
          },
        ],
        responses: {
          "200": {
            description: "Matching conversations for the current user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    conversations: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Conversation" },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Validation failed" },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/conversations/{id}": {
      delete: {
        tags: ["Chat"],
        summary: "Delete a conversation",
        description:
          "Deletes the signed-in user's conversation. Messages are removed with it (ON DELETE CASCADE). Returns 404 if the conversation does not exist or belongs to another user.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "204": { description: "Conversation deleted" },
          "400": { description: "Validation failed" },
          "401": { description: "Authentication required" },
          "404": { description: "Conversation not found" },
        },
      },
    },
    "/api/conversations/{id}/messages": {
      get: {
        tags: ["Chat"],
        summary: "List messages in a conversation",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description: "Messages in creation order",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { messages: { type: "array", items: { $ref: "#/components/schemas/ChatMessage" } } },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
      post: {
        tags: ["Chat"],
        summary: "Post a chat turn — streamed as Server-Sent Events",
        description:
          "Content-Type: text/event-stream. Events, in order: `stage` (authorizing/retrieving/generating), `answer` (the full text — this repo's LLMClient isn't token-streamed from the provider yet, so this arrives as one write, not many token events), zero or more `citation`, an optional `notice` (kind: attribution_uncertain, when a cited chunk drew on a speaker resolved with less than high confidence), then `done` with the persisted messageId. On failure, a single `error` event with a status and message.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/PostMessageRequest" } } },
        },
        responses: {
          "200": {
            description: "SSE stream (see description) — not a plain JSON response",
            content: { "text/event-stream": { schema: { type: "string" } } },
          },
          "401": { description: "Authentication required" },
          "404": { description: "Conversation not found" },
        },
      },
    },
  },
} as const;
