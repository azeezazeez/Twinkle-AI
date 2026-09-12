# ✧ TWINKLE AI – Full Stack AI Chatbot Web Application

<div align="center">

### 🤖 Intelligent Conversations • 🔐 Secure Authentication • ⚡ Full-Stack Architecture

**Twinkle AI** is a full-stack AI chatbot web application built using **React (Frontend)** and **Spring Boot (Backend)**. It provides a seamless conversational experience with secure authentication, OTP verification, and AI-powered chat functionality.

<br>

🌐 **Live Demo:** https://twinkleai.vercel.app
💻 **GitHub:** https://github.com/azeezazeez/Twinkle-AI

</div>

---

## ✨ Key Highlights

| 🚀  | Feature                                                                             |
| --- | ----------------------------------------------------------------------------------- |
| 🔌  | Built **9+ REST APIs** for authentication, OTP verification, and session management |
| 🔐  | Implemented **JWT-based authentication** with OTP email verification                |
| 🏗️ | Designed backend using **layered architecture (Controller → Service → Repository)** |
| ⚡   | Used **Redis** for session/token management and optimized performance               |
| 🤖  | Integrated **AI capabilities** for intelligent chatbot responses                    |

---

## 🏗️ Architecture

```text
                         ┌──────────────────┐
                         │      USER        │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │  React Frontend  │
                         └────────┬─────────┘
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
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │      Repository Layer    │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                         ┌────────────────┐
                         │   PostgreSQL   │
                         └────────────────┘

                  ┌───────────────────────────┐
                  │ Redis – Session & Token   │
                  │       Management          │
                  └───────────────────────────┘
```

### 🔐 Authentication Flow

```text
┌────────┐
│  User  │
└───┬────┘
    │
    ▼
┌──────────┐
│  Signup  │
└────┬─────┘
     │
     ▼
┌──────────────┐
│ OTP Verify   │
└──────┬───────┘
       │
       ▼
┌──────────┐
│  Login   │
└────┬─────┘
     │
     ▼
┌──────────────────────┐
│ Secured API Requests │
└──────────────────────┘
```

---

# 🚀 Features

## 👤 User Features

* 📝 User Registration with OTP Email Verification
* 🔑 Secure Login & Logout
* 🔄 Forgot Password & Reset Password via OTP
* 🤖 AI-Powered Chat with Twinkle

---

## 🔐 Security Features

* ✉️ OTP Verification for Signup & Password Reset
* ⚡ Session Management with Redis

---

## ⚙️ System Features

* 🔌 RESTful API Architecture
* 🔐 Implemented Authentication using OTP
* ⚡ Redis-Optimized Session Handling
* 📈 Scalable Backend Design

---

# 🛠 Tech Stack

### 💻 Frontend

![React](https://img.shields.io/badge/React.js-20232A?style=for-the-badge\&logo=react\&logoColor=61DAFB)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge\&logo=html5\&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge\&logo=css3\&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge\&logo=javascript\&logoColor=black)

### 🔧 Backend

![Java](https://img.shields.io/badge/Java-ED8B00?style=for-the-badge\&logo=openjdk\&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-6DB33F?style=for-the-badge\&logo=springboot\&logoColor=white)

### 🗄 Database

![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge\&logo=postgresql\&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge\&logo=redis\&logoColor=white)

### 🧰 Tools

![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge\&logo=git\&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge\&logo=github\&logoColor=white)
![Postman](https://img.shields.io/badge/Postman-FF6C37?style=for-the-badge\&logo=postman\&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge\&logo=docker\&logoColor=white)

---

# 📸 Screenshots

### 📝 Signup

![Signup](https://drive.google.com/uc?export=view\&id=16w_B8SQ_vEwVBqQgSYURjq0Btkj4ihVV)

---

### 🔑 Verify OTP

![Verify OTP](https://drive.google.com/uc?export=view\&id=1RCV77gOv5ujlwcbdRn0Z7H8aoKiBqTF-)

---

### 🔐 Login

![Login](https://drive.google.com/uc?export=view\&id=105Vvdfyipm63fcDwnE6m-R102F3Z6xhL)

---

### 🏠 Twinkle AI Home

![Twinkle AI Home](https://drive.google.com/uc?export=view\&id=1w5Uw5rhDo3yxVDrIUDZgA9yNgLb3INsR)

---

### ☰ Sidebar

![Sidebar](https://drive.google.com/uc?export=view\&id=1sfO5M-ZiBuYEErvZDQhp_8-FQltgk9Pa)

---

# 🌐 API Endpoints

| Method | Endpoint                    | Description                       |
| :----: | --------------------------- | --------------------------------- |
| `POST` | `/api/auth/login`           | User login                        |
| `POST` | `/api/auth/signup`          | User registration (sends OTP)     |
| `POST` | `/api/auth/verify-otp`      | Verify OTP for email verification |
| `POST` | `/api/auth/resend-otp`      | Resend OTP to email               |
|  `GET` | `/api/auth/status`          | Check authentication status       |
| `POST` | `/api/auth/logout`          | User logout                       |
|  `GET` | `/api/auth/me`              | Get current user profile          |
| `POST` | `/api/auth/forgot-password` | Request password reset OTP        |
| `POST` | `/api/auth/reset-password`  | Reset password                    |

---

# 👨‍💻 Author

<div align="center">

### **Azeez**

📌 Open to opportunities in **Java Full Stack Development**

</div>

---

# ⭐ Support

<div align="center">

If you like this project, give it a ⭐ on GitHub!

### ✧ TWINKLE AI ✧

**Built with React • Spring Boot • PostgreSQL • Redis • AI**

</div>
