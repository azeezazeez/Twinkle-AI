<div align="center">

# ✧ Twinkle AI

### Your conversations. Your knowledge. One intelligent workspace.

**A full-stack AI chat application with document-grounded RAG, persistent conversations, and real-time voice.**

<br />

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Frontend-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.2.4-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-AI-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev/)

<br />

<a href="https://twinkleai.vercel.app"><strong>🚀 Open Live Demo</strong></a>

<br /><br />

*Built to bring chat, files, knowledge retrieval, and voice together in one responsive experience.*

</div>

---

## 🧭 Table of Contents
| Getting started | Product and engineering |
|---|---|
| [Overview](#overview) | [Features](#features) |
| [Technology Stack](#technology-stack) | [Architecture](#architecture) |
| [Prerequisites](#prerequisites) | [RAG Knowledge Base](#rag-knowledge-base) |
| [Configuration](#configuration) | [Project Structure](#project-structure) |
| [Run Locally](#run-locally) | [API Overview](#api-overview) |
| [Database Setup](#database-setup) | [Deployment](#deployment) |
| [Testing](#testing) | [Security and Production Notes](#security-and-production-notes) |
| [Current Limitations and Roadmap](#current-limitations-and-roadmap) | [Author](#author) |

## 🌌 Overview
Twinkle AI is designed as a multi-user AI chat application rather than a single-page chatbot demo. The React frontend communicates with a Spring Boot REST API. PostgreSQL stores persistent application data, Redis stores HTTP sessions, and external AI/email providers power conversation, document retrieval, voice, and account workflows.

### Highlights
- Multiple configurable Groq chat models

- Gemini-powered file/image understanding and Live Talk

- Email OTP registration and password recovery

- Google OAuth 2.0 sign-in

- Persistent chat sessions, search, rename, delete, and sharing

- Document uploads, embeddings, semantic retrieval, and cited source excerpts

- User profile and usage statistics

- PostgreSQL persistence and Redis-backed sessions

- Docker support for the backend

- OpenAPI/Swagger documentation and health endpoints

> [!NOTE]
> **Status note:** The repository contains the implementations described below. Feature availability in a deployed environment still depends on valid provider credentials, database/session configuration, provider quotas, and end-to-end testing. The project has a basic Spring Boot context-load test; it does not currently contain a comprehensive automated test suite.

## ⚡ Features

| Capability | What it offers | Key technologies |
|---|---|---|
| 💬 AI Chat | Model selection, streaming responses, persistent history, chat search and sharing | Groq, Spring Boot |
| 📎 File & Image Understanding | Attach files and images for supported AI-powered analysis | Gemini |
| 🧠 Knowledge Base (RAG) | Upload documents, create embeddings, retrieve relevant chunks, and return source excerpts | Apache Tika, Gemini, PostgreSQL |
| 🔐 Authentication | Email/password, OTP verification, password recovery, and Google sign-in | Spring Security support, Google OAuth |
| 🎙️ Live Talk | Real-time voice interaction and transcript persistence | Gemini Live |
| 👤 Profiles | Profile updates and activity/usage statistics | React, Spring Boot |
| 🗂️ Conversation Management | Create, search, rename, delete, and share conversations | React, PostgreSQL |
| 🛠️ Operations | Health endpoints, API documentation, and containerized backend support | Actuator, Springdoc, Docker |

### AI Chat
- Send messages to configurable Groq models.

- Retrieve the available model list from the backend.

- Stream chat responses through the streaming endpoint.

- Send file attachments through the multipart chat endpoint.

- Use Gemini-backed handling for supported file and image inputs.

- Generate conversation titles.

- View, search, rename, and delete chat sessions.

- Create public share links and view shared conversations.

- Keep conversation history in persistent storage.

- Render formatted assistant output in the frontend, including Markdown and code-oriented content.

### Authentication and Accounts
- Email/password registration and login

- Email OTP verification and OTP resend

- OTP expiration configuration

- Forgot-password and password-reset flow

- Google OAuth 2.0 integration

- Authenticated profile retrieval and profile updates

- Profile statistics for activity and usage

- HTTP session authentication with HTTP-only cookies

- Redis-backed Spring Session storage

### Knowledge Base and RAG
The Knowledge Base provides a separate document-grounded question-answering workflow.

1. Upload a supported text-readable document.

2. Extract text with Apache Tika.

3. Split the extracted text into overlapping chunks.

4. Generate Gemini embeddings in batches.

5. Store document metadata in `rag_documents`.

6. Store chunk text and embedding vectors in `rag_chunks`.

7. Embed a user's question and rank the user's eligible chunks by cosine similarity.

8. Send the most relevant chunks to Gemini for an answer grounded in the supplied context.

9. Return source metadata and excerpts alongside the answer.

RAG controls include listing uploaded documents, deleting a document, and asking questions against all ready documents or a selected document set.

#### 📌 Current RAG implementation details

| Setting | Current default |
|---|---|
| Embedding model | `gemini-embedding-001` |
| Answer model | Configured Gemini chat model |
| Chunk size | Approximately 1,000 characters |
| Chunk overlap | Approximately 150 characters |
| Embedding batch size | 32 chunks |
| Retrieval | Top 5 chunks ranked by cosine similarity |
| Similarity threshold | `0.18` |
| Upload limit | 15 MB per RAG document |
| Extracted-text cap | 2,000,000 characters |

These are implementation defaults, not guarantees of answer quality. Retrieval relevance, citation accuracy, large-document performance, and tenant isolation should be tested with representative documents and adversarial cases.

### Live Talk
- Gemini Live token endpoint

- Real-time voice interaction through the frontend

- Configurable voice/theme presentation

- Language-oriented voice interaction

- Endpoints to save individual Live Talk turns and complete conversations

Live Talk requires compatible Gemini access and valid provider configuration.

### User Experience
- Responsive React interface

- Sidebar-based conversation navigation

- Model selection

- Chat history and conversation sharing

- File/image attachment workflow

- Light/dark appearance support

- Animated interface elements

- Profile and settings pages

- Live Talk interface and voice options

## 🧰 Technology Stack
| Area | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Navigation and UI | React Router, Tailwind CSS, Motion, Lucide React |
| Assistant rendering | React Markdown, remark-gfm, syntax highlighting, KaTeX |
| Backend | Java 17, Spring Boot 3.2.4, Spring MVC |
| Persistence | Spring Data JPA, Hibernate, PostgreSQL |
| RAG storage | PostgreSQL tables, JSONB embeddings, JDBC |
| Sessions | Spring Session, Redis |
| AI providers | Groq, Google Gemini |
| Document parsing | Apache Tika |
| Authentication support | Password hashing, Google OAuth, Nimbus JOSE JWT |
| Email | Brevo API, Spring Mail dependencies |
| API documentation | Springdoc OpenAPI / Swagger UI |
| Operations | Spring Boot Actuator, Docker |
| Testing | JUnit 5, Spring Boot Test |

## 🏗️ Architecture
```text
Browser
|
  v
React + TypeScript + Vite
|
  | HTTPS / REST / streaming
  v
Spring Boot API
|
  +-- Authentication, OTP, OAuth, profiles
  +-- Chat, models, history, sharing
  +-- File and image processing
  +-- RAG ingestion and retrieval
  +-- Live Talk token and transcript endpoints
|
  +------------------+------------------+
|                  |                  |
  v                  v                  v
PostgreSQL          Redis          External providers
accounts, chats,    HTTP sessions  Groq / Gemini / Brevo
RAG documents,
chunks and vectors
```

The backend uses controller, service, and repository layers. RAG operations use JDBC for the `rag_documents` and `rag_chunks` tables. The deployed frontend and backend must be configured with the correct public URLs, CORS policy, cookies, and secrets.

## 🧠 RAG Knowledge Base
### Database tables

| Table | Purpose | Important data |
|---|---|---|
| `public.rag_documents` | Stores uploaded-document metadata and processing state | Owner ID, status, chunk count |
| `public.rag_chunks` | Stores the indexed content used for retrieval | Owner ID, document link, chunk index, text, JSONB embedding |

A foreign key associates each chunk with its document.

### Supported workflow
- `POST /api/rag/documents` — upload and process a document

- `GET /api/rag/documents` — list the signed-in user's documents

- `DELETE /api/rag/documents/{id}` — delete a document and its chunks

- `POST /api/rag/ask` — retrieve relevant content and generate an answer

### Database setup
The schema file is located at:

`backend/src/main/resources/schema.sql`

The application configuration deliberately sets `spring.sql.init.mode=never`; therefore, do not assume Spring Boot executes this schema automatically. Ensure the schema exists in the target PostgreSQL database before using RAG. The current configuration also uses `spring.jpa.hibernate.ddl-auto=update` for JPA-managed tables.

Run the SQL in `schema.sql` against the correct Neon database if the two RAG tables do not already exist. Verify that uploaded files reach `READY`, `chunk_count` is nonzero for a text-bearing document, and corresponding rows exist in both tables. Then test questions whose answers are known from the uploaded content.

## 📁 Project Structure
```text
Twinkle-AI-Main/
├── backend/
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
│       ├── main/
│       │   ├── java/com/ai/chatbot_backend/
│       │   │   ├── config/
│       │   │   ├── controller/
│       │   │   ├── dto/
│       │   │   ├── exception/
│       │   │   ├── model/
│       │   │   ├── redis/
│       │   │   ├── repository/
│       │   │   └── service/
│       │   └── resources/
│       │       ├── application.properties
│       │       └── schema.sql
│       └── test/
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── vercel.json
    └── src/
        ├── components/
        ├── lib/
        ├── pages/
        ├── audio/
        ├── App.tsx
        └── index.css
```

## ✅ Prerequisites

| Area | Requirement | Notes |
|---|---|---|
| Backend | Java 17 | Required for the Spring Boot application |
| Build tools | Maven or included Maven Wrapper | Used to run and test the backend |
| Frontend | Node.js and npm | Must be compatible with the Vite toolchain |
| Database | PostgreSQL | Neon is used in the current deployment |
| Sessions | Redis | Must be reachable by the backend |
| AI providers | Groq API key and Google Gemini API key | Keys must have access to the configured models |
| Sign-in | Google OAuth credentials | Required if Google sign-in is enabled |
| Email | Brevo credentials and verified sender | Required when email delivery uses Brevo |
| Production | Deployed frontend and backend URLs | Configure origins and callbacks consistently |

## ⚙️ Configuration
Set secrets in your local environment or hosting provider's secret manager. **Do not commit `.env` files, API keys, OAuth secrets, database passwords, or Redis credentials.**

### Backend environment variables
| Variable | Purpose |
|---|---|
| `PORT` | Backend port; defaults to `8080` |
| `DB_URL` | JDBC PostgreSQL connection URL |
| `DB_USERNAME` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `REDIS_URL` | Redis connection URL |
| `SESSION_COOKIE_MAX_AGE` | Session cookie max age expected by configuration |
| `SESSION_TIMEOUT` | Server HTTP session timeout |
| `SESSION_COOKIE_HTTP_ONLY` | HTTP-only cookie flag; defaults to `true` |
| `SESSION_COOKIE_SECURE` | Secure cookie flag; defaults to `true` |
| `SESSION_COOKIE_SAME_SITE` | SameSite cookie setting; defaults to `None` |
| `FRONTEND_URL` | Frontend origin; defaults to `https://twinkleai.vercel.app` |
| `OAUTH_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OAUTH_GOOGLE_REDIRECT_URI` | Registered Google OAuth callback URL |
| `OAUTH_STATE_SECRET` | Secret used to sign/validate OAuth state |
| `GROQ_API_KEY` | Groq API key |
| `GROQ_API_URL` | Optional Groq-compatible API base URL |
| `GROQ_MODEL` | Default Groq model |
| `GROQ_MODELS` | Comma-separated available chat models |
| `GROQ_VISION_MODELS` | Configured models for vision requests |
| `GEMINI_API_KEY` | Gemini API key |
| `GEMINI_API_URL` | Optional Gemini API base URL |
| `GEMINI_MODEL` | Gemini chat model |
| `GEMINI_LIVE_MODEL` | Gemini Live model |
| `GEMINI_MAX_OUTPUT_TOKENS` | Gemini output-token setting |
| `GEMINI_THINKING_LEVEL` | Gemini thinking-level setting |
| `TWINKLE_RAG_API_KEY` | Optional dedicated RAG key; falls back to `GEMINI_API_KEY` |
| `TWINKLE_RAG_BASE_URL` | Optional RAG API base URL |
| `TWINKLE_RAG_EMBEDDING_MODEL` | RAG embedding model; defaults to `gemini-embedding-001` |
| `TWINKLE_RAG_CHAT_MODEL` | RAG answer model; falls back to `GEMINI_MODEL` |
| `BREVO_API_KEY` | Brevo API key |
| `BREVO_SENDER_EMAIL` | Verified Brevo sender address |
| `BREVO_SENDER_NAME` | Sender display name; defaults to `Twinkle AI` |
| `EMAIL_SENDER` | Email sender configuration |
| `EMAIL_SENDER_NAME` | Sender display name |
| `OTP_EXPIRATION_MINUTES` | OTP lifetime in minutes; defaults to `10` |
| `OTP_LENGTH` | OTP length; defaults to `6` |
| `MAX_FILE_SIZE` | Spring multipart per-file limit; defaults to `10MB` |
| `MAX_REQUEST_SIZE` | Spring multipart request limit; defaults to `25MB` |
| `HTTP_CONNECT_TIMEOUT` | Outbound HTTP connection timeout |
| `HTTP_READ_TIMEOUT` | Outbound HTTP read timeout |

Some variables are required by the current configuration even when a feature is not being used. Configure them deliberately rather than assuming all values have safe defaults. The application also defines defaults for some AI models and provider URLs; confirm those model identifiers are available to your provider account.

### Frontend configuration
Inspect `frontend/src/lib/api.ts`, `frontend/vite.config.ts`, and `frontend/vercel.json` for the current API URL and development proxy behavior. Configure the frontend to point to the deployed backend in production. Do not put secret provider keys in frontend environment variables: browser-delivered values are public.

## 💻 Run Locally
### 1. Start the backend
From the repository root:

```bash
cd backend
```

Configure the backend environment variables listed above, then run:

```bash
./mvnw spring-boot:run
```

On Windows Command Prompt:

```bat
mvnw.cmd spring-boot:run
```

The default backend port is `8080`, unless `PORT` is set.

### 2. Start the frontend
Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Use the local URL printed by Vite.

### 3. Build and type-check the frontend
```bash
cd frontend
npm run lint
npm run build
```

### 4. Run backend tests
```bash
cd backend
./mvnw test
```

The repository currently includes a Spring Boot context-load test. A passing context test does not prove external authentication, email, AI providers, file uploads, RAG retrieval, or production deployment work correctly.

## 🗄️ Database Setup
1. Create or select the PostgreSQL database.

2. Set `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`.

3. Apply `backend/src/main/resources/schema.sql` to create the RAG tables if needed.

4. Start the backend and verify database connectivity.

5. Upload a document in the Knowledge Base.

6. Check `rag_documents.status` and `rag_documents.chunk_count`.

7. Check that `rag_chunks` contains the expected rows and non-empty embeddings.

8. Ask a question with an answer present in the document and verify the returned sources.

Use the database URL for the intended environment. Avoid sharing database credentials or logging sensitive connection details.

## 🔌 API Overview
The backend exposes the following main API groups. The endpoint list below is a high-level guide; check controller code or Swagger/OpenAPI for exact request schemas and response formats.

### Authentication — `/api/auth`
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/login` | Sign in |
| POST | `/signup` | Begin registration |
| POST | `/request-otp` | Request OTP |
| POST | `/verify-otp` | Verify registration OTP |
| POST | `/resend-otp` | Resend OTP |
| GET | `/status` | Check authentication status |
| POST | `/logout` | Sign out |
| GET | `/me` | Get current user |
| PATCH | `/profile` | Update profile |
| GET | `/profile/stats` | Get usage/activity statistics |
| POST | `/forgot-password` | Start password recovery |
| POST | `/reset-password` | Reset password |

Google OAuth endpoints are under `/api/auth/oauth/google` and `/api/auth/oauth/google/callback`.

### Chat — `/api/chat`
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/models` | List configured models |
| POST | `/send` | Send JSON or multipart chat message |
| POST | `/send/stream` | Stream a response |
| GET | `/sessions` | List sessions |
| GET | `/history/{sessionId}` | Read chat history |
| POST | `/new-session` | Create session |
| PATCH | `/rename` | Rename session |
| POST | `/generate-title` | Generate a title |
| DELETE | `/session/{sessionId}` | Delete session |
| DELETE | `/sessions` | Delete all sessions |
| GET | `/search?q={query}` | Search sessions |
| POST | `/session/{sessionId}/share` | Create a share link |
| GET | `/shared/{shareToken}` | Read shared chat |
| GET | `/by-public-id/{publicId}` | Resolve a public chat identifier |
| POST | `/live/turn` | Save a Live Talk turn |
| POST | `/live-save` | Save a Live Talk conversation |

### RAG — `/api/rag`
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/documents` | Upload and index a document |
| GET | `/documents` | List documents |
| DELETE | `/documents/{id}` | Delete a document |
| POST | `/ask` | Ask a question over indexed documents |

### Live Talk and health
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/live/token` | Create a Live Talk token |
| GET | `/health` | Health check |
| GET | `/api/health` | API health check |

Swagger/OpenAPI is included through Springdoc. Its exact public path depends on the active configuration and deployment routing.

## 🚀 Deployment
### Frontend
The repository includes Vercel configuration in `frontend/vercel.json`. Import the frontend directory into Vercel, configure its build settings as needed, and set the correct backend API URL. Confirm that SPA routes refresh correctly and that the frontend origin matches backend CORS settings.

### Backend
The backend includes a `Dockerfile` and is suitable for deployment to a Java/Docker host such as Render.

1. Deploy the backend using the `backend` directory and its Dockerfile/build configuration.

2. Set all required environment variables in the host dashboard.

3. Attach a reachable PostgreSQL database and Redis instance.

4. Ensure the public frontend URL and Google OAuth redirect URI are correct.

5. Apply the RAG schema before using the Knowledge Base.

6. Check startup logs and the health endpoint.

7. Test signup, login, chat, file upload, RAG ingestion/retrieval, sharing, and Live Talk against the deployed services.

A successful startup or health response alone does not validate every feature.

## 🛡️ Security and Production Notes
- Keep all provider and database secrets on the backend.

- Verify that every chat, document, chunk, and profile query is scoped to the authenticated user.

- Keep session cookies, CORS origins, HTTPS, and OAuth redirect URLs consistent with the production deployment.

- Test CSRF protections appropriate to cookie-based session authentication.

- Add rate limits and abuse protection for login, OTP, uploads, chat, and AI-provider calls.

- Validate file types and upload sizes; consider malware scanning and safer processing for untrusted files.

- Add automated tests for authorization boundaries, OAuth state validation, OTP expiry/replay, and shared-chat access.

- Avoid logging tokens, passwords, API keys, private prompts, or full document content.

- Monitor provider errors, quotas, latency, database connection pools, and Redis availability.

- Review dependency versions and security advisories before public production use.

- Treat retrieved document text as untrusted input; RAG grounding and prompt instructions reduce risk but do not eliminate prompt-injection or hallucination risk.

## 🧪 Testing
### Current repository evidence
- One basic Spring Boot context-load test is present.

- Frontend scripts include TypeScript checking (`npm run lint`) and production bundling (`npm run build`).

- The project structure includes dedicated controllers and services for its main workflows.

### Recommended end-to-end test matrix
- Registration, OTP expiry/resend, login, logout, and password reset

- Google OAuth callback, invalid state, and account/session behavior

- User isolation for chat history, profile stats, RAG documents, and chunks

- Chat streaming, model switching, attachment persistence, and error handling

- RAG ingestion success/failure, deletion cleanup, semantic retrieval, source attribution, and unsupported questions

- Live Talk token expiry, provider failure, transcript persistence, and browser microphone permissions

- Public share-link access and unauthorized/private-session handling

- Frontend production build, backend startup, database reconnects, and Redis outage behavior

## 🗺️ Current Limitations and Roadmap
Priority improvements to strengthen the project:

1. **Automated tests:** Add unit, integration, and end-to-end tests instead of relying primarily on a context-load test.

2. **RAG evaluation:** Create a repeatable question/expected-source dataset and measure retrieval quality, answer grounding, and citation correctness.

3. **RAG scale:** Evaluate pgvector or another vector index if the chunk corpus grows; current cosine ranking loads eligible embeddings into application memory.

4. **Security hardening:** Test authorization boundaries, CSRF posture, rate limiting, upload validation, and shared-link controls.

5. **Observability:** Add structured metrics, provider latency/error tracking, and alerts without exposing secrets or user content.

6. **Reliability:** Add retry/backoff policies where safe, timeouts, and explicit handling for provider quota/rate-limit responses.

7. **Documentation:** Keep environment variables, endpoint schemas, deployment settings, and screenshots aligned with the deployed release.

## 👋 Author
**Azeez**

Interested in Java full-stack engineering and AI application development.

---

<div align="center">

### ✧ Twinkle AI
Built with React · TypeScript · Vite · Spring Boot · PostgreSQL · Redis · Groq · Google Gemini

If you find the project useful, consider giving the repository a star.

</div>
