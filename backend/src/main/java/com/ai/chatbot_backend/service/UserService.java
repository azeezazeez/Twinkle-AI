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
    // MARK USER VERIFIED
    // ============================================================

    public void markAsVerified(String email) {

        try {

            String normalizedEmail =
                    normalizeEmail(email);

            User user =
                    userRepository.findByEmail(
                            normalizedEmail
                    ).orElseThrow(() ->
                            new AIServiceException(
                                    "User not found"
                            )
                    );

            user.setVerified(true);

            /*
             * IMPORTANT:
             * OTP is stored in the otps table now.
             * Do NOT use:
             *
             * user.setOtp(...)
             * user.setOtpExpiry(...)
             */

            userRepository.save(user);

            log.info(
                    "User verified successfully: {}",
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

            return userRepository.findByEmail(
                    normalizeEmail(email)
            );

        } catch (DataAccessException e) {

            log.error(
                    "Database error finding email: {}",
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

    public Optional<User> findByUsername(
            String username
    ) {

        try {

            if (username == null ||
                    username.trim().isEmpty()) {

                return Optional.empty();
            }

            return userRepository.findByUsername(
                    username.trim()
            );

        } catch (DataAccessException e) {

            log.error(
                    "Database error finding username: {}",
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

            if (emailOrUsername == null ||
                    emailOrUsername.trim().isEmpty()) {

                return Optional.empty();
            }

            String value =
                    emailOrUsername.trim();

            Optional<User> byEmail =
                    userRepository.findByEmail(
                            value.toLowerCase()
                    );

            if (byEmail.isPresent()) {
                return byEmail;
            }

            return userRepository.findByUsername(
                    value
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
    // EXISTS BY EMAIL
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
    // EXISTS BY USERNAME
    // ============================================================

    public boolean existsByUsername(String username) {

        try {

            if (username == null ||
                    username.trim().isEmpty()) {

                return false;
            }

            return userRepository.existsByUsername(
                    username.trim()
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
    // DELETE USER BY EMAIL
    // ============================================================

    public void deleteByEmail(String email) {

        try {

            userRepository.deleteByEmail(
                    normalizeEmail(email)
            );

        } catch (DataAccessException e) {

            log.error(
                    "Database error deleting user: {}",
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

            if (newPassword == null ||
                    newPassword.isEmpty()) {

                throw new AIServiceException(
                        "New password is required"
                );
            }

            User user =
                    userRepository.findByEmail(
                            normalizedEmail
                    ).orElseThrow(() ->
                            new AIServiceException(
                                    "User not found"
                            )
                    );

            user.setPassword(newPassword);

            /*
             * OTP data is NOT stored on users.
             * OTP verification is handled by OTPService.
             */

            userRepository.save(user);

            log.info(
                    "Password updated successfully for: {}",
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

    public UserResponse register(
            RegisterRequest request
    ) {

        try {

            if (request == null) {

                throw new AIServiceException(
                        "Registration request is required"
                );
            }

            String username =
                    request.getUsername();

            if (username == null ||
                    username.trim().isEmpty()) {

                throw new AIServiceException(
                        "Username is required"
                );
            }

            username =
                    username.trim();

            if (username.contains("@")) {

                throw new AIServiceException(
                        "Username cannot be an email address"
                );
            }

            String email =
                    normalizeEmail(
                            request.getEmail()
                    );

            if (request.getPassword() == null ||
                    request.getPassword().isEmpty()) {

                throw new AIServiceException(
                        "Password is required"
                );
            }


            // ----------------------------------------------------
            // DUPLICATE CHECK
            // ----------------------------------------------------

            if (userRepository.existsByUsername(
                    username
            )) {

                throw new AIServiceException(
                        "Username already exists"
                );
            }


            if (userRepository.existsByEmail(
                    email
            )) {

                throw new AIServiceException(
                        "Email already exists"
                );
            }


            // ----------------------------------------------------
            // CREATE USER
            // ----------------------------------------------------

            User user =
                    User.builder()
                            .username(username)
                            .email(email)
                            .password(request.getPassword())
                            .verified(false)
                            .build();


            user =
                    userRepository.save(user);


            log.info(
                    "User created - ID: {}, username: {}, email: {}, verified: {}",
                    user.getId(),
                    user.getUsername(),
                    user.getEmail(),
                    user.isVerified()
            );


            // ----------------------------------------------------
            // RESPONSE
            // ----------------------------------------------------

            UserResponse response =
                    new UserResponse();

            response.setId(
                    user.getId()
            );

            response.setUsername(
                    user.getUsername()
            );

            response.setEmail(
                    user.getEmail()
            );

            response.setCreatedAt(
                    user.getCreatedAt()
            );

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
                    "Registration failed: {}",
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

    public User login(
            LoginRequest request
    ) {

        try {

            if (request == null ||
                    request.getUsername() == null ||
                    request.getUsername()
                            .trim()
                            .isEmpty()) {

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
                    request.getUsername()
                            .trim();


            // ----------------------------------------------------
            // FIND USER
            // ----------------------------------------------------

            User user =
                    userRepository.findByEmail(
                            login.toLowerCase()
                    ).orElse(null);


            if (user == null) {

                user =
                        userRepository.findByUsername(
                                login
                        ).orElse(null);
            }


            if (user == null) {

                throw new AIServiceException(
                        "Invalid credentials"
                );
            }


            // ----------------------------------------------------
            // PASSWORD CHECK
            // ----------------------------------------------------

            if (user.getPassword() == null ||
                    !user.getPassword().equals(
                            request.getPassword()
                    )) {

                throw new AIServiceException(
                        "Invalid credentials"
                );
            }


            // ----------------------------------------------------
            // EMAIL VERIFICATION
            // ----------------------------------------------------

            if (!user.isVerified()) {

                throw new AIServiceException(
                        "Please verify your email before logging in"
                );
            }


            log.info(
                    "Login successful: {}",
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
                    "Database error fetching user: {}",
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
