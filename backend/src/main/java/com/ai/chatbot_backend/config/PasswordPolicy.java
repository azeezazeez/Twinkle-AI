package com.ai.chatbot_backend.config;

import java.util.Locale;
import java.util.Set;


public final class PasswordPolicy {

    public static final int MIN_LENGTH = 8;
    public static final int MAX_LENGTH = 100;

    private static final Set<String> COMMON = Set.of(
            "password", "password1", "password12", "password123", "passw0rd",
            "12345678", "123456789", "1234567890", "11111111", "00000000",
            "qwertyui", "qwerty123", "qwertyuiop", "iloveyou", "admin123",
            "welcome1", "welcome123", "letmein1", "abc12345", "abcd1234",
            "twinkle123", "twinkleai"
    );

    private PasswordPolicy() {
    }

    /**
     * @param password the candidate password
     * @param username the account's username, or null if not known
     * @param email    the account's email, or null if not known
     * @return an error message, or null if the password is acceptable
     */
    public static String validate(String password, String username, String email) {

        if (password == null || password.isEmpty()) {
            return "Password is required";
        }

        if (password.length() < MIN_LENGTH) {
            return "Password must be at least " + MIN_LENGTH + " characters";
        }

        if (password.length() > MAX_LENGTH) {
            return "Password cannot exceed " + MAX_LENGTH + " characters";
        }

        if (password.isBlank()) {
            return "Password cannot be only spaces";
        }

        String lower = password.toLowerCase(Locale.ROOT);

        if (COMMON.contains(lower)) {
            return "That password is too common. Please choose a stronger one";
        }

        if (allSameCharacter(password)) {
            return "Password cannot be a single repeated character";
        }

        if (username != null) {
            String u = username.trim().toLowerCase(Locale.ROOT);
            if (u.length() >= 3 && lower.equals(u)) {
                return "Password cannot be the same as your username";
            }
        }

        if (email != null) {
            String e = email.trim().toLowerCase(Locale.ROOT);
            if (!e.isEmpty()) {
                int at = e.indexOf('@');
                String local = at > 0 ? e.substring(0, at) : e;
                if (lower.equals(e) || (local.length() >= 3 && lower.equals(local))) {
                    return "Password cannot be the same as your email";
                }
            }
        }

        return null;
    }

    private static boolean allSameCharacter(String value) {
        char first = value.charAt(0);
        for (int i = 1; i < value.length(); i++) {
            if (value.charAt(i) != first) {
                return false;
            }
        }
        return true;
    }
}
