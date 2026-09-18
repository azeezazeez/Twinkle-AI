# ✨ Twinkle AI

> A full-stack, multimodal AI assistant with persistent chat history, authentication, OTP verification, Google OAuth, file/image understanding, multiple AI models, Live Talk, profile analytics, Redis-backed sessions, and a responsive React UI.

---

## 🚀 Overview

**Twinkle AI** is a modern ChatGPT-style AI application built with a React + TypeScript frontend and a Spring Boot backend.

The application is designed around four core capabilities:

* 💬 Normal AI conversations
* 📎 Multimodal conversations with file/image uploads
* 🎙️ Real-time Gemini Live Talk
* 🔐 Persistent authenticated user accounts and chat history

The backend keeps AI provider credentials server-side. Browser clients communicate with the backend API and authenticated HTTP sessions rather than exposing provider API keys.

---

## ✨ Features

### 🔐 Authentication & Account Management

* Username/password login
* New-account signup
* Email OTP verification
* OTP resend
* OTP expiration
* Forgot-password flow
* Password reset using OTP
* Session-based authentication
* Secure HTTP-only session cookie configuration
* 24-hour session timeout
* Logout
* Current-session status
* Current-user profile retrieval
* Username/profile update
* Profile statistics
* Google OAuth sign-in
* OAuth state signing and validation
* OAuth state expiration protection

### 💬 AI Chat

* ChatGPT-style conversational interface
* Persistent conversations
* Create new chat sessions
* Rename conversations
* Delete individual conversations
* Delete all conversations
* Search conversations
* Generate conversation titles
* Retrieve complete session history
* Available-model discovery
* Language-aware responses
* Server-side chat persistence
* AI-generated responses through Groq
* Support for configurable Groq models
* Vision-capable model configuration

### 📎 Multimodal / File Chat

The `/api/chat/send` endpoint supports both JSON and multipart requests.

* Send normal text messages
* Attach files to messages
* Process images/media through Gemini
* Extract text/content from supported files
* Combine user text with uploaded content
* Backend upload/request size limits
* Apache Tika-based file parsing

Default limits:

* Maximum individual file size: **10 MB**
* Maximum multipart request size: **25 MB**

### 🎙️ Live Talk

* Browser microphone capture
* Real-time Gemini Live WebSocket communication
* Ephemeral backend-issued Live token
* Short-lived token lifetime
* Usage-limited Live sessions
* Multiple Gemini voices
* Voice selection
* Voice-specific visual themes
* Audio playback
* Live transcript handling
* Automatic Live conversation persistence
* Save individual Live turns
* Save complete Live conversations
* Configurable application language
* Multilingual Live language instructions

Available voices include:

`Zephyr`, `Puck`, `Charon`, `Kore`, `Fenrir`, `Leda`, `Orus`, `Aoede`, `Callirrhoe`, `Autonoe`, `Enceladus`, `Iapetus`, `Umbriel`, `Algieba`, `Despina`, `Erinome`, `Algenib`, `Rasalgethi`, `Laomedeia`, `Achernar`, `Alnilam`, `Schedar`, `Gacrux`, `Pulcherrima`, `Achird`, `Zubenelgenubi`, `Vindemiatrix`, `Sadachbia`, `Sadaltager`, `Sulafat`.

### 👤 Profile & Usage Analytics

* Editable username
* Account information
* Total chats
* Message counts
* User/assistant message counts
* Lifetime token usage
* Peak token usage
* Current activity streak
* Longest activity streak
* Active-day count
* Daily activity data
* Daily / weekly / cumulative activity views
* Activity heatmap
* Automatic statistics refresh

### ⚙️ Settings

* Light/dark appearance
* Application language
* Live Talk voice
* Voice preference persistence
* Selected AI model preference
* Account-related controls

### 🎨 Frontend UX

* Responsive React interface
* Mobile-friendly layout
* Sidebar navigation
* Motion animations
* Lucide icons
* Markdown rendering
* GitHub-flavored Markdown
* Syntax highlighting
* User avatars
* Confirmation dialogs
* Live Talk modal
* Login/signup/OTP screens
* Profile and settings pages
* Light and dark themes

---

# 🏗️ Architecture

```text
┌───────────────────────────────┐
│        React Frontend         │
│     React + TypeScript        │
│       Vite + Tailwind         │
└───────────────┬───────────────┘
                │ HTTPS / REST
                │ Session Cookie
                ▼
┌───────────────────────────────┐
│       Spring Boot API         │
│       Java 17 / REST          │
├───────────────────────────────┤
│ Auth │ Chat │ OAuth │ Live    │
└──────┬─────────┬─────────┬────┘
       │         │         │
       ▼         ▼         ▼
 PostgreSQL    Redis     AI APIs
  / Neon       Sessions  ├─ Groq
                         └─ Gemini
                              │
                              └─ Live Talk
```

### Backend package

```text
com.ai.chatbot_backend
```

---

# 🧰 Tech Stack

## Frontend

| Technology               | Purpose                   |
| ------------------------ | ------------------------- |
| React 19                 | UI                        |
| TypeScript               | Type safety               |
| Vite                     | Development/build tooling |
| Tailwind CSS 4           | Styling                   |
| Motion                   | Animations                |
| React Router             | Client-side routing       |
| React Markdown           | Markdown rendering        |
| Remark GFM               | GitHub-flavored Markdown  |
| React Syntax Highlighter | Code highlighting         |
| Lucide React             | Icons                     |
| Google GenAI SDK         | Gemini functionality      |
| Express                  | Server utility layer      |
| Cookie Parser            | Cookie handling           |

## Backend

| Technology           | Purpose                      |
| -------------------- | ---------------------------- |
| Java 17              | Runtime/language             |
| Spring Boot 3.2.4    | Backend framework            |
| Spring Web           | REST API                     |
| Spring Validation    | Request validation           |
| Spring Data JPA      | Persistence                  |
| Hibernate            | ORM                          |
| PostgreSQL           | Database                     |
| Spring Session       | Distributed sessions         |
| Redis                | Session/event infrastructure |
| Nimbus JOSE JWT      | JWT/JOSE                     |
| Apache Tika          | File parsing                 |
| OkHttp               | External HTTP requests       |
| Jackson              | JSON processing              |
| Spring Mail          | Email support                |
| Brevo API            | Transactional email          |
| Springdoc OpenAPI    | API documentation            |
| Spring Boot Actuator | Health endpoints             |
| Lombok               | Boilerplate reduction        |
| Maven                | Build system                 |

## AI Providers

### Groq

Used primarily for normal text chat.

```text
GROQ_API_KEY
GROQ_API_URL
GROQ_MODEL
GROQ_MODELS
GROQ_VISION_MODELS
```

### Google Gemini

Used for file/image/media understanding and Live Talk.

```text
GEMINI_API_KEY
GEMINI_API_URL
GEMINI_MODEL
GEMINI_MAX_OUTPUT_TOKENS
GEMINI_THINKING_LEVEL
GEMINI_LIVE_MODEL
```

---

# 🔌 REST API

Default backend:

```text
http://localhost:8080
```

Default API base:

```text
http://localhost:8080/api
```

Authenticated endpoints use the authenticated HTTP session cookie.

---

## ❤️ Health

### GET `/health`

Checks whether the backend is running.

Response:

```text
OK
```

---

# 🔐 Authentication API

Base:

```text
/api/auth
```

## POST `/api/auth/signup`

Creates a new account.

```json
{
  "username": "azeez",
  "email": "azeez@example.com",
  "password": "StrongPassword@123"
}
```

---

## POST `/api/auth/request-otp`

Requests an email OTP.

```json
{
  "email": "azeez@example.com"
}
```

---

## POST `/api/auth/verify-otp`

Verifies the six-digit OTP.

```json
{
  "email": "azeez@example.com",
  "otpCode": "123456"
}
```

---

## POST `/api/auth/resend-otp`

Resends an OTP.

```json
{
  "email": "azeez@example.com"
}
```

---

## POST `/api/auth/login`

Authenticates a user.

```json
{
  "username": "azeez",
  "password": "StrongPassword@123"
}
```

---

## GET `/api/auth/status`

Returns current authentication/session status.

---

## GET `/api/auth/me`

Returns the authenticated user's information.

---

## POST `/api/auth/logout`

Invalidates the current session.

---

## PATCH `/api/auth/profile`

Updates profile information.

```json
{
  "username": "new_username"
}
```

---

## GET `/api/auth/profile/stats`

Returns:

* Token usage
* Chat count
* Message count
* User/assistant messages
* Current streak
* Longest streak
* Active days
* Daily activity

---

## POST `/api/auth/forgot-password`

Starts password recovery.

```json
{
  "email": "azeez@example.com"
}
```

---

## POST `/api/auth/reset-password`

Resets password using OTP.

```json
{
  "email": "azeez@example.com",
  "otpCode": "123456",
  "newPassword": "NewStrongPassword@123"
}
```

---

# 🔑 Google OAuth API

Base:

```text
/api/auth/oauth
```

### GET `/api/auth/oauth/google`

Starts Google OAuth.

### GET `/api/auth/oauth/google/callback`

Handles Google's OAuth callback.

The backend validates the OAuth state, retrieves the Google account, creates an authenticated session, and redirects to the configured frontend.

---

# 💬 Chat API

Base:

```text
/api/chat
```

## GET `/api/chat/status`

Returns chat backend status.

Example:

```json
{
  "status": "connected",
  "message": "Chat backend is running",
  "timestamp": "..."
}
```

---

## POST `/api/chat/send`

Normal text chat.

Content-Type:

```text
application/json
```

Request:

```json
{
  "message": "Explain dependency injection in Spring Boot.",
  "sessionId": 1,
  "model": "openai/gpt-oss-120b",
  "language": "en"
}
```

---

## POST `/api/chat/send`

File/multimodal chat.

Content-Type:

```text
multipart/form-data
```

Fields:

```text
message
model
language
sessionId
files
```

Default limits:

```text
MAX_FILE_SIZE=10MB
MAX_REQUEST_SIZE=25MB
```

---

## GET `/api/chat/models`

Returns available AI models.

---

## GET `/api/chat/sessions`

Returns the authenticated user's chat sessions.

---

## GET `/api/chat/history/{sessionId}`

Returns a session's message history.

Example:

```text
GET /api/chat/history/123
```

---

## POST `/api/chat/new-session`

Creates a new chat session.

---

## PATCH `/api/chat/rename`

Renames a session.

```json
{
  "sessionId": 123,
  "sessionName": "Spring Boot Notes"
}
```

---

## POST `/api/chat/generate-title`

Generates a conversation title.

```json
{
  "firstMessage": "Explain Redis sessions in Spring Boot."
}
```

---

## DELETE `/api/chat/session/{sessionId}`

Deletes one chat session.

---

## DELETE `/api/chat/sessions`

Deletes all sessions belonging to the authenticated user.

---

## GET `/api/chat/search?q={query}`

Searches the user's sessions.

Example:

```text
GET /api/chat/search?q=spring
```

---

# 🎙️ Live Talk API

Base:

```text
/api/live
```

## POST `/api/live/token`

Creates a short-lived Gemini Live token.

Authentication is required.

Current configuration:

```text
uses = 10
token lifetime = 30 minutes
new session lifetime = 1 minute
```

Example:

```json
{
  "token": "...",
  "model": "gemini-3.8-live",
  "expiresAt": "...",
  "newSessionExpiresAt": "...",
  "uses": 10
}
```

The Gemini API key remains server-side.

---

# 💾 Live Conversation Persistence

## POST `/api/chat/live/turn`

Persists an individual Live Talk turn.

```json
{
  "sessionId": 123,
  "userTranscript": "What is dependency injection?",
  "assistantTranscript": "Dependency injection is a design pattern..."
}
```

---

## POST `/api/chat/live-save`

Saves a Live Talk conversation.

```json
{
  "userTranscript": "Hello",
  "assistantTranscript": "Hi! How can I help you?"
}
```

Response:

```json
{
  "success": true,
  "sessionId": 123,
  "sessionName": "..."
}
```

---

# 🗄️ Data Persistence

PostgreSQL stores:

* Users
* OTP records
* Chat sessions
* Chat messages

Repositories:

```text
UserRepository
OTPRepository
ChatSessionRepository
ChatMessageRepository
```

Hibernate:

```properties
spring.jpa.hibernate.ddl-auto=update
```

Database schema:

```text
public
```

---

# ⚡ Redis

Redis provides distributed session storage and event infrastructure.

Default:

```text
redis://localhost:6379
```

Spring Session namespace:

```text
Twinkle:session
```

Components:

```text
RedisConfig
RedisEventService
RedisEventListener
```

---

# 📧 Email & OTP

Brevo configuration:

```text
BREVO_API_KEY
BREVO_API_URL
BREVO_SENDER_EMAIL
BREVO_SENDER_NAME
```

OTP:

```text
OTP_EXPIRATION_MINUTES=10
OTP_LENGTH=6
```

---

# 🔒 Security

The application includes:

* Server-side AI API keys
* Authenticated HTTP sessions
* Redis-backed sessions
* HTTP-only cookies
* Secure cookies
* SameSite cookie configuration
* HMAC-SHA256 OAuth state signatures
* OAuth state expiration
* Constant-time signature comparison
* Request validation
* Email validation
* OTP validation
* Password reset validation
* File/request limits
* Centralized exception handling

---

# 🌐 Frontend Integration

Frontend environment variable:

```env
VITE_API_BASE_URL=http://localhost:8080/api
```

Production:

```env
VITE_API_BASE_URL=https://your-backend-domain.com/api
```

Backend:

```env
FRONTEND_URL=http://localhost:5173
```

Production:

```env
FRONTEND_URL=https://your-frontend-domain.com
```

Do **not** expose Groq, Gemini, Brevo, database, Redis, or OAuth secrets in the frontend.

---

# 🧪 Environment Variables

## Backend

```env
PORT=8080

DB_URL=jdbc:postgresql://localhost:5432/twinkle_ai
DB_USERNAME=postgres
DB_PASSWORD=your_password

REDIS_URL=redis://localhost:6379

GROQ_API_KEY=your_groq_key
GROQ_API_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b
GROQ_MODELS=openai/gpt-oss-120b,openai/gpt-oss-20b
GROQ_VISION_MODELS=qwen/qwen3.8-27b

GEMINI_API_KEY=your_gemini_key
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_MODEL=gemini-3.8-flash
GEMINI_MAX_OUTPUT_TOKENS=16384
GEMINI_THINKING_LEVEL=low
GEMINI_LIVE_MODEL=gemini-3.8-live

BREVO_API_KEY=your_brevo_key
BREVO_API_URL=https://api.brevo.com/v3/smtp/email
BREVO_SENDER_EMAIL=your_sender@example.com
BREVO_SENDER_NAME=Twinkle AI

EMAIL_SENDER=your_sender@example.com
EMAIL_SENDER_NAME=Twinkle AI

OTP_EXPIRATION_MINUTES=10
OTP_LENGTH=6

FRONTEND_URL=http://localhost:5173

OAUTH_GOOGLE_CLIENT_ID=your_google_client_id
OAUTH_GOOGLE_CLIENT_SECRET=your_google_client_secret
OAUTH_GOOGLE_REDIRECT_URI=http://localhost:8080/api/auth/oauth/google/callback
OAUTH_STATE_SECRET=your_long_random_secret
```

## Frontend

Create:

```text
frontend/.env.local
```

```env
VITE_API_BASE_URL=http://localhost:8080/api
```

---

# 🛠️ Local Development

## Prerequisites

* Java 17+
* Maven/Maven Wrapper
* Node.js
* npm
* PostgreSQL
* Redis
* Groq API key
* Gemini API key

Optional:

* Brevo API key
* Google OAuth credentials

---

## Start Backend

### Windows

```bash
cd backend
mvnw.cmd spring-boot:run
```

### Linux/macOS

```bash
cd backend
./mvnw spring-boot:run
```

Backend:

```text
http://localhost:8080
```

Health:

```text
http://localhost:8080/health
```

---

## Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

# 🏭 Production Build

## Backend

```bash
cd backend
mvnw.cmd clean package
```

Run:

```bash
java -jar target/chatbot-backend-1.0.0.jar
```

## Frontend

```bash
cd frontend
npm install
npm run build
```

---

# 🐳 Docker

The backend includes a Dockerfile.

```bash
cd backend
docker build -t twinkle-ai-backend .
```

Run:

```bash
docker run -p 8080:8080 \
  -e DB_URL="your_database_url" \
  -e DB_USERNAME="your_database_user" \
  -e DB_PASSWORD="your_database_password" \
  -e REDIS_URL="your_redis_url" \
  -e GROQ_API_KEY="your_groq_key" \
  -e GEMINI_API_KEY="your_gemini_key" \
  -e FRONTEND_URL="https://your-frontend-domain.com" \
  twinkle-ai-backend
```

---

# 📁 Project Structure

```text
Twinkle AI/
│
├── backend/
│   ├── pom.xml
│   ├── Dockerfile
│   ├── mvnw
│   ├── mvnw.cmd
│   └── src/
│       ├── main/
│       │   ├── java/com/ai/chatbot_backend/
│       │   │   ├── config/
│       │   │   ├── controller/
│       │   │   ├── dto/
│       │   │   ├── exception/
│       │   │   ├── model/
│       │   │   ├── redis/
│       │   │   ├── repository/
│       │   │   └── service/
│       │   └── resources/
│       │       └── application.properties
│       └── test/
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── server.ts
│   └── src/
│       ├── components/
│       ├── lib/
│       ├── pages/
│       ├── App.tsx
│       ├── index.css
│       ├── main.tsx
│       └── types.ts
│
└── README.md
```

---

# 🧩 Backend Components

## Controllers

```text
AuthController
OAuthController
ChatController
LiveTokenController
HealthController
```

## Services

```text
AuthService
UserService
OTPService
EmailService
ChatService
ChatHistoryService
GroqService
GeminiService
OAuthService
RedisEventService
```

## Repositories

```text
UserRepository
OTPRepository
ChatSessionRepository
ChatMessageRepository
```

---

# 🧭 Frontend Routes

| Route              | Purpose               |
| ------------------ | --------------------- |
| `/`                | Main AI chat          |
| `/login`           | Login                 |
| `/verify-otp`      | OTP verification      |
| `/forgot-password` | Password recovery     |
| `/profile`         | Profile and analytics |
| `/settings`        | Settings              |

Unknown routes redirect to `/`.

---

# 📊 Complete API Summary

| Method | Endpoint                          |    Auth | Purpose                |
| ------ | --------------------------------- | ------: | ---------------------- |
| GET    | `/health`                         |      No | Backend health         |
| POST   | `/api/auth/signup`                |      No | Register               |
| POST   | `/api/auth/request-otp`           |      No | Request OTP            |
| POST   | `/api/auth/verify-otp`            |      No | Verify OTP             |
| POST   | `/api/auth/resend-otp`            |      No | Resend OTP             |
| POST   | `/api/auth/login`                 |      No | Login                  |
| GET    | `/api/auth/status`                | Session | Auth status            |
| POST   | `/api/auth/logout`                | Session | Logout                 |
| GET    | `/api/auth/me`                    |     Yes | Current user           |
| PATCH  | `/api/auth/profile`               |     Yes | Update profile         |
| GET    | `/api/auth/profile/stats`         |     Yes | Usage statistics       |
| POST   | `/api/auth/forgot-password`       |      No | Password recovery      |
| POST   | `/api/auth/reset-password`        |      No | Reset password         |
| GET    | `/api/auth/oauth/google`          |      No | Start Google OAuth     |
| GET    | `/api/auth/oauth/google/callback` |   OAuth | OAuth callback         |
| GET    | `/api/chat/status`                |      No | Chat status            |
| POST   | `/api/chat/send`                  |     Yes | Text chat              |
| POST   | `/api/chat/send`                  |     Yes | File/multimodal chat   |
| GET    | `/api/chat/models`                |     Yes | Available models       |
| GET    | `/api/chat/sessions`              |     Yes | List sessions          |
| GET    | `/api/chat/history/{sessionId}`   |     Yes | Session history        |
| POST   | `/api/chat/new-session`           |     Yes | Create session         |
| PATCH  | `/api/chat/rename`                |     Yes | Rename session         |
| POST   | `/api/chat/generate-title`        |     Yes | Generate title         |
| DELETE | `/api/chat/session/{sessionId}`   |     Yes | Delete session         |
| DELETE | `/api/chat/sessions`              |     Yes | Delete all sessions    |
| GET    | `/api/chat/search?q={query}`      |     Yes | Search sessions        |
| POST   | `/api/chat/live/turn`             |     Yes | Save Live turn         |
| POST   | `/api/chat/live-save`             |     Yes | Save Live conversation |
| POST   | `/api/live/token`                 |     Yes | Create Live token      |

---

# ⚠️ Frontend/Backend Endpoint Note

The current frontend API client contains:

```text
POST /api/chat/session/{sessionId}/share
```

However, the current backend `ChatController` does **not** expose a matching `/share` endpoint.

Therefore, the share-session functionality is currently referenced by the frontend but is **not implemented by the backend** in the uploaded project.

---

# 🧪 Error Handling

The frontend handles common backend responses:

| Status | Meaning                         |
| -----: | ------------------------------- |
|    400 | Invalid request                 |
|    401 | Unauthenticated/session expired |
|    403 | Forbidden                       |
|    404 | Resource not found              |
|    408 | Timeout                         |
|    409 | Conflict/duplicate username     |
|    413 | Request/file too large          |
|    415 | Unsupported media type          |
|    422 | Validation/processing failure   |
|    429 | AI service busy/rate limited    |
|    500 | Internal server error           |
|    502 | Upstream AI/service failure     |
|    503 | Service unavailable             |
|    504 | Gateway timeout                 |

---

# 📖 API Documentation

Springdoc OpenAPI is included.

When running locally:

```text
http://localhost:8080/swagger-ui/index.html
```

OpenAPI JSON:

```text
http://localhost:8080/v3/api-docs
```

---

# 🔄 Typical User Flow

```text
Open Twinkle AI
       │
       ▼
   Login / Signup
       │
       ├── Signup ──► Email OTP ──► Verify ──► Session
       │
       └── Google ──► OAuth ──► Session
                         │
                         ▼
                    Chat Interface
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          Text Chat   File Chat   Live Talk
             │           │           │
             ▼           ▼           ▼
           Groq       Gemini      Gemini Live
             │           │           │
             └───────────┼───────────┘
                         ▼
                 PostgreSQL History
                         │
                         ▼
                Profile / Analytics
```

---

# 🔑 Production Checklist

* [ ] Configure PostgreSQL/Neon
* [ ] Configure Redis
* [ ] Configure Groq
* [ ] Configure Gemini
* [ ] Configure Brevo
* [ ] Configure Google OAuth
* [ ] Set a strong `OAUTH_STATE_SECRET`
* [ ] Configure `FRONTEND_URL`
* [ ] Configure `VITE_API_BASE_URL`
* [ ] Enable HTTPS
* [ ] Keep secure HTTP-only cookies
* [ ] Configure production CORS
* [ ] Never commit `.env` files
* [ ] Verify `/health`
* [ ] Verify authentication/session persistence
* [ ] Verify OTP delivery
* [ ] Verify normal chat
* [ ] Verify file uploads
* [ ] Verify Live Talk
* [ ] Verify chat persistence
* [ ] Verify profile statistics

---

# 🧪 Useful Commands

### Frontend

```bash
npm install
npm run dev
npm run build
npm run preview
npm run lint
```

### Backend — Windows

```bash
mvnw.cmd spring-boot:run
mvnw.cmd clean package
```

### Backend — Linux/macOS

```bash
./mvnw spring-boot:run
./mvnw clean package
```

---

# 📌 Default Configuration

| Setting              | Default                  |
| -------------------- | ------------------------ |
| Backend port         | `8080`                   |
| Frontend dev port    | `5173`                   |
| Session timeout      | `24h`                    |
| Redis                | `redis://localhost:6379` |
| Max file size        | `10MB`                   |
| Max request size     | `25MB`                   |
| OTP expiration       | `10 minutes`             |
| OTP length           | `6 digits`               |
| Groq primary model   | `openai/gpt-oss-120b`    |
| Groq secondary model | `openai/gpt-oss-20b`     |
| Gemini model         | `gemini-3.8-flash`       |
| Gemini Live model    | `gemini-3.8-live`        |
| Live token lifetime  | `30 minutes`             |
| Live token uses      | `10`                     |

---

# 🤝 Development Notes

When extending the project:

1. Keep provider API keys on the backend.
2. Keep authenticated data scoped to the current user/session.
3. Add REST endpoints to the appropriate controller.
4. Put persistence logic in services/repositories.
5. Add validation to new DTO fields.
6. Update the frontend API client when endpoints change.
7. Keep CORS and credential handling synchronized.
8. Update this README whenever a major feature, endpoint, or environment variable changes.

---

# 📄 License

This project includes Apache-2.0 licensed source headers where applicable.

Add the final repository-level license terms if the complete application is intended to be distributed under a specific license.

---

# 🌟 Twinkle AI

```text
React + TypeScript
        +
Spring Boot + Java 17
        +
PostgreSQL + Redis
        +
Groq + Gemini
        =
✨ Twinkle AI
```
