# 🤖 TWINKLE AI – Full Stack AI Chatbot Web Application

Nexus AI is a full-stack AI chatbot web application built using **React (Frontend)** and **Spring Boot (Backend)**. It provides a seamless conversational experience with secure authentication, OTP verification, and AI-powered chat functionality.

---

## 🚀 Live Links

🌐 Live Demo: https://twinkleai.vercel.app   

💻 GitHub: https://github.com/azeezazeez/Twinkle-AI

---

## 💡 Key Highlights

- Built **9+ REST APIs** for authentication, OTP verification, and session management
- Implemented **JWT-based authentication** with OTP email verification
- Designed backend using **layered architecture (Controller → Service → Repository)**
- Used **Redis** for session/token management and optimized performance
- Integrated **AI capabilities** for intelligent chatbot responses

---

## 🏗️ Architecture

Frontend (React) → REST API (Spring Boot) → Service Layer → Repository → PostgreSQL
Redis (Session & Token Management)

**Authentication Flow:**
User → Signup → OTP Verification → Login → Secured API Requests

---

## 🚀 Features

### 👤 User Features

- User Registration with OTP Email Verification
- Secure Login & Logout 
- Forgot Password & Reset Password via OTP
- AI-Powered Chat with Nexus
- View & Manage Profile

### 🔐 Security Features

- OTP Verification for Signup & Password Reset
- Session Management with Redis
- Role-Based Access Control

### ⚙️ System Features

- RESTful API Architecture
- Implemented Authentication using OTP
- Redis-Optimized Session Handling
- Scalable Backend Design

---

## 🛠 Tech Stack

### 💻 Frontend

- React.js
- HTML5, CSS3
- JavaScript

### 🔧 Backend

- Java
- Spring Boot

### 🗄 Database

- PostgreSQL
- Redis (Session & Cache Management)

### 🧰 Tools

- Git & GitHub
- Postman
- Docker (Basics)

---

## 📸 Screenshots

| Section | Preview |
|---------|---------|
| **📝 Signup** | ![Signup](https://drive.google.com/uc?export=view&id=1Xg6UeOiDUz2WFDk5rw4PFBLvxzvXXEcj) |
| **🔑 Verify OTP** | ![Verify OTP](https://drive.google.com/uc?export=view&id=1qHA4eIpH83DfoszGXLd4_NhQam1lB6fy) |
| **🔐 Login** | ![Login](https://drive.google.com/uc?export=view&id=1_WlTAW0wtARl1KerSYTgo-oG3ppwui0U) |
| **🏠 Twinkle AI Home** | ![Twinkle AI Home](https://drive.google.com/uc?export=view&id=18Z341Q6-Dq9OZHVhNG7kZZwMHKTLfmJM) |

---

## 🌐 API Endpoints

| Method | Endpoint                     | Description                        |
|--------|-----------------------------|------------------------------------|
| POST   | /api/auth/login             | User login                         |
| POST   | /api/auth/signup            | User registration (sends OTP)      |
| POST   | /api/auth/verify-otp        | Verify OTP for email verification  |
| POST   | /api/auth/resend-otp        | Resend OTP to email                |
| GET    | /api/auth/status            | Check authentication status        |
| POST   | /api/auth/logout            | User logout                        |
| GET    | /api/auth/me                | Get current user profile           |
| POST   | /api/auth/forgot-password   | Request password reset OTP         |
| POST   | /api/auth/reset-password    | Reset password                     |

---

## 👨‍💻 Author

**Azeez**
📌 Open to opportunities in **Java Full Stack Development**

---

## ⭐ Support

If you like this project, give it a ⭐ on GitHub!
