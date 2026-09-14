package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.LoginRequest;
import com.ai.chatbot_backend.dto.RegisterRequest;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.dto.UserResponse;
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


    // ============================================================
    // MARK USER AS VERIFIED
    // ============================================================

    public void markAsVerified(String email) {

        try {

            String normalizedEmail =
                    normalizeEmail(email);

            User user = userRepository.findByEmail(normalizedEmail)
                    .orElseThrow(() ->
                            new AIServiceException("User not found")
                    );

            user.setVerified(true);

            // Clear OTP data after successful verification
            user.setOtp(null);
            user.setOtpExpiry(null);

            userRepository.save(user);

            log.info(
                    "User marked as verified: {}",
                    normalizedEmail
            );

        } catch (DataAccessException e) {

            log.error(
                    "Database error marking user verified: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Server error, please try again later"
            );
        }
    }


    // ============================================================
    // FIND BY EMAIL
    // ============================================================

    public Optional<User> findByEmail(String email) {

        try {

            String normalizedEmail =
                    normalizeEmail(email);

            return userRepository.findByEmail(
                    normalizedEmail
            );

        } catch (DataAccessException e) {

            log.error(
                    "Database error finding user by email: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Server error, please try again later"
            );
        }
    }


    // ============================================================
    // FIND BY USERNAME
    // ============================================================

    public Optional<User> findByUsername(String username) {

        try {

            return userRepository.findByUsername(
                    username
            );

        } catch (DataAccessException e) {

            log.error(
                    "Database error finding user by username: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Server error, please try again later"
            );
        }
    }


    // ============================================================
    // FIND BY EMAIL OR USERNAME
    // ============================================================

    public Optional<User> findByEmailOrUsername(
            String emailOrUsername
    ) {

        try {

            return userRepository.findByEmailOrUsername(
                    emailOrUsername
            );

        } catch (DataAccessException e) {

            log.error(
                    "Database error finding user: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Server error, please try again later"
            );
        }
    }


    // ============================================================
    // CHECK EMAIL
    // ============================================================

    public boolean existsByEmail(String email) {

        try {

            return userRepository.existsByEmail(
                    normalizeEmail(email)
            );

        } catch (DataAccessException e) {

            log.error(
                    "Database error checking email: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Server error, please try again later"
            );
        }
    }


    // ============================================================
    // CHECK USERNAME
    // ============================================================

    public boolean existsByUsername(String username) {

        try {

            return userRepository.existsByUsername(
                    username
            );

        } catch (DataAccessException e) {

            log.error(
                    "Database error checking username: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Server error, please try again later"
            );
        }
    }


    // ============================================================
    // UPDATE PASSWORD
    // ============================================================

    public void updatePassword(
            String email,
            String newPassword
    ) {

        try {

            String normalizedEmail =
                    normalizeEmail(email);

            User user = userRepository.findByEmail(
                    normalizedEmail
            ).orElseThrow(() ->
                    new AIServiceException("User not found")
            );

            user.setPassword(newPassword);

            // Password reset is successful, so OTP is no longer needed
            user.setOtp(null);
            user.setOtpExpiry(null);

            userRepository.save(user);

            log.info(
                    "Password updated for user: {}",
                    normalizedEmail
            );

        } catch (DataAccessException e) {

            log.error(
                    "Database error updating password: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Server error, please try again later"
            );
        }
    }


    // ============================================================
    // REGISTER USER
    // ============================================================
    //
    // IMPORTANT:
    // User is created BEFORE OTP verification.
    //
    // verified = false
    //
    // OTPService will later put:
    //
    // users.otp
    // users.otp_expiry
    //
    // ============================================================

    public UserResponse register(
            RegisterRequest request
    ) {

        log.info("=== REGISTER ATTEMPT ===");

        try {

            // ----------------------------------------------------
            // Validate username
            // ----------------------------------------------------

            if (request == null) {
                throw new AIServiceException(
                        "Registration request is required"
                );
            }

            if (request.getUsername() == null ||
                    request.getUsername().trim().isEmpty()) {

                throw new AIServiceException(
                        "Username is required"
                );
            }

            String username =
                    request.getUsername().trim();

            if (username.contains("@")) {

                throw new AIServiceException(
                        "Username cannot be an email address. Please choose a different username"
                );
            }


            // ----------------------------------------------------
            // Validate email
            // ----------------------------------------------------

            String email =
                    normalizeEmail(request.getEmail());


            // ----------------------------------------------------
            // Validate password
            // ----------------------------------------------------

            if (request.getPassword() == null ||
                    request.getPassword().isEmpty()) {

                throw new AIServiceException(
                        "Password is required"
                );
            }


            // ----------------------------------------------------
            // Check duplicate username
            // ----------------------------------------------------

            if (userRepository.existsByUsername(username)) {

                throw new AIServiceException(
                        "Username already exists"
                );
            }


            // ----------------------------------------------------
            // Check duplicate email
            // ----------------------------------------------------

            if (userRepository.existsByEmail(email)) {

                throw new AIServiceException(
                        "Email already exists"
                );
            }


            // ----------------------------------------------------
            // CREATE USER
            // ----------------------------------------------------

            User user = User.builder()
                    .username(username)
                    .email(email)
                    .password(request.getPassword())
                    .verified(false)
                    .otp(null)
                    .otpExpiry(null)
                    .build();


            user = userRepository.save(user);


            log.info(
                    "User created successfully - ID: {}, Username: {}, Email: {}",
                    user.getId(),
                    user.getUsername(),
                    user.getEmail()
            );


            // ----------------------------------------------------
            // BUILD RESPONSE
            // ----------------------------------------------------

            UserResponse response =
                    new UserResponse();

            response.setId(user.getId());
            response.setUsername(user.getUsername());
            response.setEmail(user.getEmail());
            response.setCreatedAt(user.getCreatedAt());

            return response;


        } catch (DataAccessException e) {

            log.error(
                    "Database error during registration: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Server error, please try again later"
            );

        } catch (AIServiceException e) {

            throw e;

        } catch (Exception e) {

            log.error(
                    "REGISTER FAILED: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Registration failed: " +
                            e.getMessage()
            );
        }
    }


    // ============================================================
    // LOGIN
    // ============================================================

    public User login(LoginRequest request) {

        log.info("=== LOGIN ATTEMPT ===");

        try {

            if (request == null ||
                    request.getUsername() == null ||
                    request.getUsername().trim().isEmpty()) {

                throw new AIServiceException(
                        "Email or username is required"
                );
            }

            if (request.getPassword() == null ||
                    request.getPassword().isEmpty()) {

                throw new AIServiceException(
                        "Password is required"
                );
            }


            String login =
                    request.getUsername().trim();


            // ----------------------------------------------------
            // Try email first
            // ----------------------------------------------------

            User user =
                    userRepository.findByEmail(
                            login.toLowerCase()
                    ).orElse(null);


            // ----------------------------------------------------
            // Try username
            // ----------------------------------------------------

            if (user == null) {

                user =
                        userRepository.findByUsername(
                                login
                        ).orElse(null);
            }


            if (user == null) {

                log.warn(
                        "User not found with: {}",
                        login
                );

                throw new AIServiceException(
                        "Invalid credentials"
                );
            }


            // ----------------------------------------------------
            // Password check
            // ----------------------------------------------------

            if (!user.getPassword().equals(
                    request.getPassword()
            )) {

                log.warn(
                        "Password mismatch for user: {}",
                        user.getUsername()
                );

                throw new AIServiceException(
                        "Invalid credentials"
                );
            }


            // ----------------------------------------------------
            // EMAIL VERIFICATION CHECK
            // ----------------------------------------------------

            if (!user.isVerified()) {

                log.warn(
                        "Login rejected - email not verified: {}",
                        user.getEmail()
                );

                throw new AIServiceException(
                        "Please verify your email before logging in"
                );
            }


            log.info(
                    "LOGIN SUCCESS for user: {}",
                    user.getUsername()
            );

            return user;


        } catch (DataAccessException e) {

            log.error(
                    "Database error during login: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Server error, please try again later"
            );
        }
    }


    // ============================================================
    // GET USER BY ID
    // ============================================================

    public User getUserById(Long id) {

        try {

            return userRepository.findById(id)
                    .orElseThrow(() ->
                            new AIServiceException(
                                    "User not found"
                            )
                    );

        } catch (DataAccessException e) {

            log.error(
                    "Database error fetching user by id: {}",
                    e.getMessage(),
                    e
            );

            throw new AIServiceException(
                    "Server error, please try again later"
            );
        }
    }


    // ============================================================
    // NORMALIZE EMAIL
    // ============================================================

    private String normalizeEmail(String email) {

        if (email == null ||
                email.trim().isEmpty()) {

            throw new AIServiceException(
                    "Email is required"
            );
        }

        return email
                .trim()
                .toLowerCase();
    }
}
