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
      LinkCallRequest: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri", maxLength: 2048 },
          dealId: { type: "string", format: "uuid", nullable: true },
          label: { type: "string", maxLength: 200 },
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
    "/api/calls/upload": {
      post: {
        tags: ["Calls"],
        summary: "Upload a recording",
        description:
          "Multipart upload. Field name must be `file`. Optional `dealId`. Transcription runs in the background via PyAI Hear. Poll GET /api/calls/{id} until the transcription status is PYAI_SUCCESS or PYAI_FAILED.",
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
          "Enqueues a BullMQ job (queue: infer-and-rename) that infers a real name per diarized speaker label from the call's most recent ready transcription, via an OpenAI-compatible LLM (see apps/ai). Processing happens asynchronously in a worker within the apps/api process, not on this request — this endpoint only validates and enqueues, then returns immediately. Results (suggestions with confidence/evidence, not final answers) are upserted into call_transcripts keyed by transcription_id once the job completes; there is currently no GET endpoint to poll that result over HTTP.",
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
  },
} as const;
