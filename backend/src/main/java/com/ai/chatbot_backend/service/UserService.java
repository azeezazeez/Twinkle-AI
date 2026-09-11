package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.LoginRequest;
import com.ai.chatbot_backend.dto.RegisterRequest;
import com.ai.chatbot_backend.dto.UserResponse;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.exception.AIServiceException;
import com.ai.chatbot_backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {
    private final UserRepository userRepository;

    public void markAsVerified(String email) {
        try {
            User user = userRepository.findByEmail(email)
                    .orElseThrow(() -> new AIServiceException("User not found"));
            user.setVerified(true);
            userRepository.save(user);
            log.info("✅ User marked as verified: {}", email);
        } catch (DataAccessException e) {
            log.error("Database error marking verified: {}", e.getMessage(), e);
            throw new AIServiceException("Server error, please try again later");
        }
    }

    public Optional<User> findByEmail(String email) {
        try {
            log.debug("Finding user by email: {}", email);
            return userRepository.findByEmail(email);
        } catch (DataAccessException e) {
            log.error("Database error finding by email: {}", e.getMessage(), e);
            throw new AIServiceException("Server error, please try again later");
        }
    }

    public Optional<User> findByUsername(String username) {
        try {
            log.debug("Finding user by username: {}", username);
            return userRepository.findByUsername(username);
        } catch (DataAccessException e) {
            log.error("Database error finding by username: {}", e.getMessage(), e);
            throw new AIServiceException("Server error, please try again later");
        }
    }

    public Optional<User> findByEmailOrUsername(String emailOrUsername) {
        try {
            log.debug("Finding user by email or username: {}", emailOrUsername);
            return userRepository.findByEmailOrUsername(emailOrUsername);
        } catch (DataAccessException e) {
            log.error("Database error finding by email/username: {}", e.getMessage(), e);
            throw new AIServiceException("Server error, please try again later");
        }
    }

    public boolean existsByEmail(String email) {
        try {
            return userRepository.existsByEmail(email);
        } catch (DataAccessException e) {
            log.error("Database error checking email existence: {}", e.getMessage(), e);
            throw new AIServiceException("Server error, please try again later");
        }
    }

    public boolean existsByUsername(String username) {
        try {
            return userRepository.existsByUsername(username);
        } catch (DataAccessException e) {
            log.error("Database error checking username existence: {}", e.getMessage(), e);
            throw new AIServiceException("Server error, please try again later");
        }
    }

    public void updatePassword(String email, String newPassword) {
        try {
            User user = userRepository.findByEmail(email)
                    .orElseThrow(() -> new AIServiceException("User not found"));
            user.setPassword(newPassword);
            userRepository.save(user);
            log.info("Password updated for user: {}", email);
        } catch (DataAccessException e) {
            log.error("Database error updating password: {}", e.getMessage(), e);
            throw new AIServiceException("Server error, please try again later");
        }
    }

    public UserResponse register(RegisterRequest request) {
        log.info("=== REGISTER ATTEMPT ===");
        log.info("Username received: '{}'", request.getUsername());
        log.info("Email received: '{}'", request.getEmail());
        log.info("FullName received: '{}'", request.getFullName());

        try {
            if (request.getUsername() == null || request.getUsername().trim().isEmpty()) {
                throw new AIServiceException("Username is required");
            }
            if (request.getUsername().contains("@")) {
                log.warn("Username contains @ symbol - invalid");
                throw new AIServiceException("Username cannot be an email address. Please choose a different username");
            }

            boolean usernameExists = userRepository.existsByUsername(request.getUsername());
            if (usernameExists) {
                throw new AIServiceException("Username already exists");
            }

            boolean emailExists = userRepository.existsByEmail(request.getEmail());
            if (emailExists) {
                throw new AIServiceException("Email already exists");
            }

            User user = User.builder()
                    .username(request.getUsername().trim())
                    .email(request.getEmail().trim().toLowerCase())
                    .password(request.getPassword())
                    .fullName(request.getFullName())
                    .verified(false)
                    .build();

            user = userRepository.save(user);
            log.info("✅ User saved successfully - ID: {}, Username: {}, Email: {}",
                    user.getId(), user.getUsername(), user.getEmail());

            UserResponse response = new UserResponse();
            response.setId(user.getId());
            response.setUsername(user.getUsername());
            response.setEmail(user.getEmail());
            response.setFullName(user.getFullName());
            response.setCreatedAt(user.getCreatedAt());

            return response;
        } catch (DataAccessException e) {
            log.error("❌ Database error during registration: {}", e.getMessage(), e);
            throw new AIServiceException("Server error, please try again later");
        } catch (AIServiceException e) {
            throw e;
        } catch (Exception e) {
            log.error("❌ REGISTER FAILED - Error: {}", e.getMessage(), e);
            throw new AIServiceException("Registration failed: " + e.getMessage());
        }
    }

    public User login(LoginRequest request) {
        log.info("=== LOGIN ATTEMPT ===");
        log.info("Login input: '{}'", request.getUsername());

        try {
            User user = userRepository.findByEmail(request.getUsername()).orElse(null);
            if (user == null) {
                log.info("User not found by email, trying username...");
                user = userRepository.findByUsername(request.getUsername()).orElse(null);
            }
            if (user == null) {
                log.error("❌ User not found with: {}", request.getUsername());
                throw new AIServiceException("Invalid credentials");
            }

            log.info("✅ Found user - Username: {}, Email: {}", user.getUsername(), user.getEmail());
            if (!user.getPassword().equals(request.getPassword())) {
                log.error("❌ Password mismatch for user: {}", user.getUsername());
                throw new AIServiceException("Invalid credentials");
            }

            log.info("✅ LOGIN SUCCESS for user: {}", user.getUsername());
            return user;
        } catch (DataAccessException e) {
            log.error("Database error during login: {}", e.getMessage(), e);
            throw new AIServiceException("Server error, please try again later");
        }
    }

    public User getUserById(Long id) {
        try {
            return userRepository.findById(id)
                    .orElseThrow(() -> new AIServiceException("User not found"));
        } catch (DataAccessException e) {
            log.error("Database error fetching user by id: {}", e.getMessage(), e);
            throw new AIServiceException("Server error, please try again later");
        }
    }
}
