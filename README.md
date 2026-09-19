<div align="center">

# ✧ TWINKLE AI – Full Stack AI Chatbot Application

### 🤖 Intelligent Conversations • 🔐 Secure Authentication • 🎙️ Real-Time Live Talk

**Twinkle AI** is a full-stack AI chatbot application built using **React + TypeScript (Frontend)** and **Spring Boot + Java (Backend)**. It provides a modern conversational AI experience with persistent chat history, email OTP authentication, Google OAuth, multimodal file and image understanding, multiple AI models, Gemini Live Talk, user profiles, activity analytics, Redis-backed sessions, and a responsive animated interface.

<br>

🌐 **Live Demo:** https://twinkleai.vercel.app

</div>

---

# 💡 Key Highlights

| 🚀 | Highlight |
| --- | --- |
| 🔌 | Built **29 REST API endpoints** covering authentication, OAuth, AI chat, chat history, profile statistics, Live Talk, and system health |
| 🔐 | Implemented **secure HTTP session-based authentication** with Redis-backed Spring Session and HTTP-only cookies |
| 📧 | Implemented **email OTP verification** for user registration with configurable OTP length and expiration |
| 🔑 | Added **forgot-password and password reset flow** with secure OTP validation |
| 🌐 | Added **Google OAuth 2.0 login** with signed state validation and Google ID token verification |
| 🏗️ | Designed backend using **layered architecture (Controller → Service → Repository)** |
| 💬 | Implemented persistent **AI conversations, chat sessions, message history, title generation, renaming, deletion, and search** |
| 📎 | Added **multimodal file/image processing** using Apache Tika and Gemini |
| 🧠 | Integrated **Groq** for normal AI conversations and configurable AI model selection |
| 🎙️ | Implemented **Gemini Live Talk** with short-lived tokens, real-time voice interaction, transcript persistence, and multiple voices |
| 👤 | Added user **profile management and usage analytics** including chat count, message count, token usage, activity streaks, and active days |
| 🗄️ | Integrated **PostgreSQL with Spring Data JPA / Hibernate** for persistent application data |
| ⚡ | Integrated **Redis** for distributed HTTP session storage and application event handling |
| 📩 | Integrated **Brevo Email API** for transactional OTP and email communication |
| 🛡️ | Added request validation, centralized exception handling, CORS configuration, secure session cookies, and OAuth state protection |
| 🐳 | Added **Docker support** for backend containerization and deployment |
| 📚 | Added **Springdoc OpenAPI / Swagger UI** for API documentation |

---

# 🏗️ Architecture

```text
                          ┌──────────────────┐
                          │      USER        │
                          └────────┬─────────┘
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │ React + TypeScript     │
                       │ Vite Frontend          │
                       └───────────┬────────────┘
                                   │
                              REST API
                                   │
                                   ▼
                       ┌──────────────────────────┐
                       │      Spring Boot         │
                       │       Controller         │
                       └────────────┬─────────────┘
                                    │
                                    ▼
                       ┌──────────────────────────┐
                       │       Service Layer      │
                       │ AI / Auth / OTP / OAuth  │
                       │ Chat / Email / Live Talk │
                       └────────────┬─────────────┘
                                    │
                                    ▼
                       ┌──────────────────────────┐
                       │      Repository Layer    │
                       │      Spring Data JPA     │
                       └────────────┬─────────────┘
                                    │
                                    ▼
                           ┌────────────────┐
                           │   PostgreSQL   │
                           └────────────────┘

                    Redis HTTP Session Storage
                              │
                              ▼
                       ┌───────────────┐
                       │     Redis     │
                       │    Sessions   │
                       └───────────────┘

                    External AI Communication
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
       ┌─────────────────┐        ┌──────────────────┐
       │      Groq       │        │      Gemini      │
       │   Normal Chat   │        │ Files / Images / │
       │                 │        │    Live Talk     │
       └─────────────────┘        └──────────────────┘

                    External Email Communication
                              │
                              ▼
                       ┌───────────────┐
                       │  Brevo Email  │
                       │      API      │
                       └───────────────┘
```

### 🔐 Authentication Flow

```text
┌────────┐
│  User  │
└───┬────┘
    │
    ▼
┌─────────────────────┐
│ Register with Email │
│ Username + Password │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 6-Digit Email OTP   │
│      Verification   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   User Account      │
│      Created        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ HTTP Session Created│
│   Redis-Backed      │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────┐
│ Secured API Requests │
│ HTTP-Only Session    │
└──────────────────────┘
```

### 📧 Password Recovery Flow

```text
┌────────┐
│  User  │
└───┬────┘
    │
    ▼
┌───────────────────┐
│ Forgot Password   │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ Generate 6-Digit  │
│       OTP         │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ Send OTP via      │
│   Brevo Email API │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ Verify OTP        │
│ 10 Min Expiry     │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ Reset Password    │
│ Secure Validation │
└───────────────────┘
```

---

# 🚀 Features

## 👤 User Features

* 📝 User Registration & Login
* 📧 Email OTP verification during registration
* ⏱️ OTP expiration handling
* 🔄 OTP resend functionality
* 🔑 Forgot Password functionality
* 📧 Password reset through Brevo Email API
* 🔐 Secure HTTP session authentication
* 🍪 HTTP-only and secure session cookies
* 🔑 Google OAuth login
* 👤 View authenticated user profile
* ✏️ Update user profile
* 📊 View profile usage statistics
* 💬 Start new AI conversations
* 💬 Continue persistent conversations
* 🧠 Select available AI models
* 📎 Upload files and images
* 🤖 Multimodal AI understanding
* 📝 Generate conversation titles
* ✏️ Rename conversations
* 🔍 Search conversations
* 🗑️ Delete individual conversations
* 🧹 Delete all conversations
* 📜 View complete chat history
* 🎙️ Start Gemini Live Talk
* 🎧 Select Live Talk voices
* 🗣️ Real-time voice conversation
* 🌍 Multilingual Live Talk support
* 💾 Save Live Talk turns
* 💾 Save complete Live Talk conversations
* 📈 View token usage
* 🔥 View activity streaks
* 📅 View active-day statistics
* 🌙 Light and dark interface support

---

## 🔐 Admin Features

* 🔐 Authenticated user/session management
* 🛡️ Server-side protection of authenticated APIs
* 🔑 Google OAuth authentication
* 🔒 OAuth state signing and validation
* 👤 Authenticated profile management
* 📊 User activity and usage statistics
* 🗄️ Persistent chat and account data management
* ⚡ Redis-backed session infrastructure

---

## ⚙️ System Features

* 🔌 RESTful API Architecture
* 🔐 HTTP Session-Based Authentication
* 🍪 HTTP-Only Secure Session Cookies
* ⚡ Redis-Backed Spring Session
* 📧 Brevo Email API Integration
* 📩 Transactional Email Support
* 🔢 Secure 6-Digit OTP Generation
* ⏱️ OTP Expiration Handling
* 🔄 OTP Resend Support
* 🔑 Secure Password Reset Flow
* 🌐 Google OAuth Integration
* 🛡️ Signed OAuth State Validation
* 🔐 Google ID Token Signature Verification
* 🧹 Input Validation and Request Validation
* 🚨 Structured API Error Responses
* ⚠️ Centralized Exception Handling
* 🌐 Configured CORS for Production and Local Development
* 🗄️ Spring Data JPA / Hibernate
* 🐘 PostgreSQL Database
* ⚡ Redis Session Storage
* 📡 Redis Event Handling
* 🤖 Groq AI Integration
* 🧠 Gemini AI Integration
* 🎙️ Gemini Live Talk Integration
* 📎 Multipart File Upload Support
* 🗂️ Apache Tika File Parsing
* 🖼️ Image / Media Understanding
* 📊 Chat and Token Usage Statistics
* 📈 Activity Streak Analytics
* 🔍 Chat Session Search
* 📝 AI Conversation Title Generation
* 📚 Swagger / OpenAPI Documentation
* 🩺 Spring Boot Actuator Support
* 🐳 Dockerized Backend
* ⚡ Vite-based Frontend Build
* 🎨 Tailwind CSS Integration
* ✨ Motion-based UI Animations
* 🧩 React Context-based Application State Management
* 📱 Responsive React Frontend
* 🌍 Multilingual Application / Live Talk Language Support

---

# 🛠 Tech Stack

### 💻 Frontend

![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.1-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![React Router](https://img.shields.io/badge/React%20Router-7-CA4245?style=for-the-badge&logo=reactrouter&logoColor=white)
![Motion](https://img.shields.io/badge/Motion-12-000000?style=for-the-badge&logo=framer&logoColor=white)

### 🔧 Backend

![Java](https://img.shields.io/badge/Java%2017-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2.4-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)
![Spring Data JPA](https://img.shields.io/badge/Spring%20Data%20JPA-6DB33F?style=for-the-badge&logo=spring&logoColor=white)
![Spring Session](https://img.shields.io/badge/Spring%20Session-Redis-6DB33F?style=for-the-badge&logo=spring&logoColor=white)
![JWT/JOSE](https://img.shields.io/badge/Nimbus%20JOSE%20JWT-10.4-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Maven](https://img.shields.io/badge/Maven-C71A36?style=for-the-badge&logo=apachemaven&logoColor=white)

### 🗄 Database

![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Hibernate](https://img.shields.io/badge/Hibernate-59666C?style=for-the-badge&logo=hibernate&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)

### 🤖 AI & Communication

![Groq](https://img.shields.io/badge/Groq-000000?style=for-the-badge)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Brevo](https://img.shields.io/badge/Brevo-0B996E?style=for-the-badge&logo=brevo&logoColor=white)
![Spring Mail](https://img.shields.io/badge/Spring%20Mail-6DB33F?style=for-the-badge&logo=spring&logoColor=white)

### 🧰 Tools

![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)
![Postman](https://img.shields.io/badge/Postman-FF6C37?style=for-the-badge&logo=postman&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Lombok](https://img.shields.io/badge/Lombok-BD2C00?style=for-the-badge&logo=java&logoColor=white)
![Apache Tika](https://img.shields.io/badge/Apache%20Tika-D22128?style=for-the-badge&logo=apache&logoColor=white)

---

# 🌐 API Endpoints

| Method | Endpoint | Description |
| :---: | ------------------------------------------- | ------------------------------------------ |
| `POST` | `/api/auth/login` | Authenticate user and create session |
| `POST` | `/api/auth/signup` | Register user and start OTP verification |
| `POST` | `/api/auth/request-otp` | Request registration OTP |
| `POST` | `/api/auth/verify-otp` | Verify registration OTP |
| `POST` | `/api/auth/resend-otp` | Resend registration OTP |
| `GET` | `/api/auth/status` | Check authentication/session status |
| `POST` | `/api/auth/logout` | Logout and invalidate current session |
| `GET` | `/api/auth/me` | Get authenticated user |
| `PATCH` | `/api/auth/profile` | Update authenticated user profile |
| `GET` | `/api/auth/profile/stats` | Get user usage and activity statistics |
| `POST` | `/api/auth/forgot-password` | Generate password-reset OTP |
| `POST` | `/api/auth/reset-password` | Verify OTP and reset password |
| `GET` | `/api/auth/oauth/google` | Start Google OAuth authentication |
| `GET` | `/api/auth/oauth/google/callback` | Handle Google OAuth callback |
| `GET` | `/api/chat/status` | Get chat service status |
| `POST` | `/api/chat/send` | Send a normal JSON AI chat message |
| `POST` | `/api/chat/send` | Send an AI message with multipart files |
| `GET` | `/api/chat/models` | Get available AI models |
| `GET` | `/api/chat/sessions` | Get authenticated user's chat sessions |
| `GET` | `/api/chat/history/{sessionId}` | Get chat history for a session |
| `POST` | `/api/chat/new-session` | Create a new chat session |
| `PATCH` | `/api/chat/rename` | Rename an existing chat session |
| `POST` | `/api/chat/generate-title` | Generate a title for a conversation |
| `DELETE` | `/api/chat/session/{sessionId}` | Delete a chat session |
| `DELETE` | `/api/chat/sessions` | Delete all authenticated user's sessions |
| `GET` | `/api/chat/search?q={query}` | Search authenticated user's chat sessions |
| `POST` | `/api/chat/live/turn` | Save a Live Talk turn |
| `POST` | `/api/chat/live-save` | Save a complete Live Talk conversation |
| `POST` | `/api/live/token` | Create a short-lived Gemini Live token |
| `GET` | `/health` | Backend health check |

---

# 👨‍💻 Author

<div align="center">

### **Azeez**

📌 Open to opportunities in **Java Full Stack Development & AI Application Development**

</div>

---

# ⭐ Support

<div align="center">

If you like this project, give it a ⭐ on GitHub!

### ✧ TWINKLE AI

**Built with React • TypeScript • Vite • Tailwind CSS • Spring Boot • Spring Data JPA • PostgreSQL • Redis • Groq • Google Gemini • Brevo • Docker**

</div>
