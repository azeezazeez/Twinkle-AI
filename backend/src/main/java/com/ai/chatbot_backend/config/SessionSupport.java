package com.ai.chatbot_backend.config;

import com.ai.chatbot_backend.dto.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;


public final class SessionSupport {

    private SessionSupport() {
    }

   
    public static HttpSession establishAuthenticatedSession(HttpServletRequest request, User user) {

        if (user == null || user.getId() == null) {
            throw new IllegalArgumentException("Cannot create a session for a user without an ID");
        }

        HttpSession old = request.getSession(false);
        if (old != null) {
            try {
                old.invalidate();
            } catch (IllegalStateException ignored) {
                // already invalidated
            }
        }

        HttpSession session = request.getSession(true);
        session.setAttribute("userId", user.getId());
        session.setAttribute("user", sanitize(user));
        return session;
    }

   
    public static User sanitize(User user) {

        if (user == null) {
            return null;
        }

        User copy = new User();
        copy.setId(user.getId());
        copy.setUsername(user.getUsername());
        copy.setEmail(user.getEmail());
        copy.setPassword(null);
        copy.setCreatedAt(user.getCreatedAt());
        copy.setVerified(user.isVerified());
        copy.setAvatarUrl(user.getAvatarUrl());
        copy.setFullName(user.getFullName());
        copy.setAuthProvider(user.getAuthProvider());
        return copy;
    }
}
