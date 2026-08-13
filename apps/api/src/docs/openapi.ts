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
          org: { type: "string", nullable: true },
          role: { type: "string", enum: ["OWNER", "ADMIN", "TEAM_MEMBER"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          token: { type: "string", description: "JWT access token (sub, email, role). Send as Authorization: Bearer <token>." },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["email", "password", "name"],
        properties: {
          email: { type: "string", format: "email", maxLength: 320 },
          password: { type: "string", minLength: 10, maxLength: 200 },
          name: { type: "string", minLength: 1, maxLength: 120 },
          org: { type: "string", maxLength: 120 },
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
          deal_id: { type: "string", format: "uuid", nullable: true },
          uploaded_by: { type: "string", format: "uuid", nullable: true },
          label: { type: "string" },
          filename: { type: "string", nullable: true },
          duration_seconds: { type: "integer" },
          status: { type: "string", enum: ["queued", "processing", "ready", "failed"] },
          storage_path: { type: "string", nullable: true },
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
        },
      },
      Transcription: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          call_id: { type: "string", format: "uuid" },
          provider: { type: "string", example: "pyai" },
          model: { type: "string", example: "pyai-hear-telephony" },
          status: { type: "string", enum: ["processing", "ready", "failed"] },
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
      AddDealUserRequest: {
        type: "object",
        required: ["userId"],
        properties: {
          userId: { type: "string", format: "uuid" },
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
            description: "Account created",
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
            description: "Authenticated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } },
          },
          "401": { description: "Invalid email or password", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Too many attempts" },
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
    "/api/deals": {
      get: {
        tags: ["Deals"],
        summary: "List deals",
        description:
          "OWNER and ADMIN see all deals. TEAM_MEMBER sees only deals they are mapped to in user_deals.",
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
        summary: "Map a user to a deal",
        description: "OWNER, ADMIN, or the deal creator can add a member. Duplicate mapping returns 409.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AddDealUserRequest" } } },
        },
        responses: {
          "201": {
            description: "User mapped to the deal",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { user: { $ref: "#/components/schemas/User" } },
                },
              },
            },
          },
          "400": { description: "User not found" },
          "401": { description: "Authentication required" },
          "403": { description: "Not allowed to share this deal" },
          "404": { description: "Deal not found" },
          "409": { description: "User is already mapped to this deal" },
        },
      },
    },
    "/api/calls": {
      get: {
        tags: ["Calls"],
        summary: "List calls",
        description:
          "OWNER and ADMIN see all calls. TEAM_MEMBER sees calls on mapped deals plus their own unassigned uploads.",
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
          "Multipart upload. Field name must be `file`. Optional `dealId`. Transcription runs in the background via PyAI Hear. Poll GET /api/calls/{id} until status is ready.",
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
    "/api/calls/{id}": {
      get: {
        tags: ["Calls"],
        summary: "Get call with transcriptions",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description: "Call and its transcription rows (segments are a JSON array of objects)",
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
    "/api/calls/{id}/transcriptions": {
      get: {
        tags: ["Transcriptions"],
        summary: "List transcriptions for a call",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          "200": {
            description: "Transcription rows; each `segments` value is an array of objects",
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
  },
} as const;
