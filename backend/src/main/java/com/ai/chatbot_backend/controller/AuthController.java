/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

package com.ai.chatbot_backend.controller;

import com.ai.chatbot_backend.dto.LoginRequest;
import com.ai.chatbot_backend.dto.RegisterRequest;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.dto.UserResponse;
import com.ai.chatbot_backend.service.OTPService;
import com.ai.chatbot_backend.service.UserService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private static final String PENDING_REGISTRATION =
            "pending_registration";

    private static final String PENDING_REGISTRATION_EMAIL =
            "pending_registration_email";

    private final UserService userService;
    private final OTPService otpService;

    // ============================================================
    // LOGIN
    // ============================================================

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(
            @RequestBody LoginRequest request,
            HttpServletRequest httpRequest
    ) {

        try {

            if (request == null) {
                return badRequest(
                        "Login request is required"
                );
            }

            if (request.getUsername() == null ||
                    request.getUsername().trim().isEmpty()) {

                return badRequest(
                        "Email or username is required"
                );
            }

            if (request.getPassword() == null ||
                    request.getPassword().isEmpty()) {

                return badRequest(
                        "Password is required"
                );
            }

            log.info(
                    "Login request received for: {}",
                    request.getUsername()
            );

            User user = userService.login(request);

            if (user == null) {
                return unauthorized(
                        "Invalid credentials"
                );
            }

            HttpSession session =
                    httpRequest.getSession(true);

            session.setAttribute(
                    "user",
                    user
            );

            session.setAttribute(
                    "userId",
                    user.getId()
            );

            Map<String, Object> response =
                    new HashMap<>();

            response.put(
                    "success",
                    true
            );

            response.put(
                    "message",
                    "Login successful"
            );

            response.put(
                    "user",
                    buildUserData(user)
            );

            log.info(
                    "Login successful for user: {}",
                    user.getUsername()
            );

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error(
                    "Login failed: {}",
                    e.getMessage(),
                    e
            );

            return unauthorized(
                    "Invalid credentials"
            );
        }
    }

    // ============================================================
    // SIGNUP
    // ============================================================

    @PostMapping("/signup")
    public ResponseEntity<Map<String, Object>> signup(
            @Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest
    ) {

        try {

            // ----------------------------------------------------
            // Basic request validation
            // ----------------------------------------------------

            if (request == null) {
                return badRequest(
                        "Registration request is required"
                );
            }

            // ----------------------------------------------------
            // EMAIL
            // ----------------------------------------------------

            String email =
                    normalizeEmail(
                            request.getEmail()
                    );

            if (email.isEmpty()) {

                return badRequest(
                        "Email is required"
                );
            }

            // ----------------------------------------------------
            // USERNAME
            // ----------------------------------------------------

            String username =
                    request.getUsername();

            if (username == null ||
                    username.trim().isEmpty()) {

                return badRequest(
                        "Username is required"
                );
            }

            username = username.trim();

            // ----------------------------------------------------
            // PASSWORD
            // ----------------------------------------------------

            if (request.getPassword() == null ||
                    request.getPassword().isEmpty()) {

                return badRequest(
                        "Password is required"
                );
            }

            // ----------------------------------------------------
            // USERNAME CANNOT BE EMAIL
            // ----------------------------------------------------

            if (username.contains("@")) {

                return badRequest(
                        "Username cannot be an email address"
                );
            }

            log.info(
                    "Signup request received - email: {}, username: {}",
                    email,
                    username
            );

            // ----------------------------------------------------
            // CHECK IF EMAIL ALREADY EXISTS
            // ----------------------------------------------------

            if (userService.existsByEmail(email)) {

                log.info(
                        "Signup rejected - email already registered: {}",
                        email
                );

                return badRequest(
                        "Email already registered"
                );
            }

            // ----------------------------------------------------
            // CHECK IF USERNAME ALREADY EXISTS
            // ----------------------------------------------------

            if (userService.existsByUsername(username)) {

                log.info(
                        "Signup rejected - username already exists: {}",
                        username
                );

                return badRequest(
                        "Username already taken"
                );
            }

            // ----------------------------------------------------
            // NORMALIZE REQUEST
            // ----------------------------------------------------

            request.setEmail(email);
            request.setUsername(username);

            // ----------------------------------------------------
            // CREATE / UPDATE PENDING REGISTRATION
            //
            // IMPORTANT:
            // We intentionally DO NOT reject a session simply
            // because it already contains a pending registration.
            //
            // This allows:
            //
            // User A -> signup -> leaves page
            // User A -> enters another email -> signup
            //
            // The latest pending registration replaces the old one.
            // ----------------------------------------------------

            HttpSession session =
                    httpRequest.getSession(true);

            session.setAttribute(
                    PENDING_REGISTRATION,
                    request
            );

            session.setAttribute(
                    PENDING_REGISTRATION_EMAIL,
                    email
            );

            // ----------------------------------------------------
            // SEND OTP
            // ----------------------------------------------------

            try {

                otpService.generateAndSendOtp(email);

            } catch (
                    OTPService.OTPDeliveryException e
            ) {

                log.error(
                        "OTP delivery failed for {}: {}",
                        email,
                        e.getMessage(),
                        e
                );

                // Remove pending registration if OTP failed
                clearPendingRegistration(session);

                return ResponseEntity
                        .status(HttpStatus.BAD_GATEWAY)
                        .body(
                                errorResponse(
                                        "Unable to send verification email. Please try again."
                                )
                        );
            }

            // ----------------------------------------------------
            // SUCCESS
            // ----------------------------------------------------

            Map<String, Object> response =
                    new HashMap<>();

            response.put(
                    "success",
                    true
            );

            response.put(
                    "message",
                    "OTP sent successfully. Please verify your email."
            );

            response.put(
                    "email",
                    email
            );

            log.info(
                    "Signup OTP successfully sent to: {}",
                    email
            );

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error(
                    "Signup failed: {}",
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            errorResponse(
                                    "Unable to complete signup. Please try again."
                            )
                    );
        }
    }

    // ============================================================
    // VERIFY OTP
    // ============================================================

    @PostMapping("/verify-otp")
    public ResponseEntity<Map<String, Object>> verifyOtp(
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest
    ) {

        String email = null;

        try {

            if (request == null) {

                return badRequest(
                        "OTP verification request is required"
                );
            }

            email =
                    normalizeEmail(
                            request.get("email")
                    );

            String otpCode =
                    request.get("otpCode");

            // ----------------------------------------------------
            // VALIDATE EMAIL
            // ----------------------------------------------------

            if (email.isEmpty()) {

                return badRequest(
                        "Email is required"
                );
            }

            // ----------------------------------------------------
            // VALIDATE OTP
            // ----------------------------------------------------

            if (otpCode == null ||
                    otpCode.trim().isEmpty()) {

                return badRequest(
                        "OTP is required"
                );
            }

            otpCode = otpCode.trim();

            log.info(
                    "OTP verification request for: {}",
                    email
            );

            // ----------------------------------------------------
            // GET EXISTING SESSION
            // ----------------------------------------------------

            HttpSession session =
                    httpRequest.getSession(false);

            if (session == null) {

                return badRequest(
                        "Registration session expired. Please sign up again."
                );
            }

            // ----------------------------------------------------
            // GET PENDING REGISTRATION
            // ----------------------------------------------------

            Object pendingObject =
                    session.getAttribute(
                            PENDING_REGISTRATION
                    );

            if (!(pendingObject
                    instanceof RegisterRequest)) {

                return badRequest(
                        "Registration session expired. Please sign up again."
                );
            }

            RegisterRequest registerRequest =
                    (RegisterRequest) pendingObject;

            // ----------------------------------------------------
            // CHECK SESSION EMAIL
            // ----------------------------------------------------

            String pendingEmail =
                    normalizeEmail(
                            registerRequest.getEmail()
                    );

            if (!email.equals(pendingEmail)) {

                log.warn(
                        "OTP email mismatch. Session: {}, Request: {}",
                        pendingEmail,
                        email
                );

                return badRequest(
                        "Email verification mismatch. Please sign up again."
                );
            }

            // ----------------------------------------------------
            // VALIDATE OTP
            // ----------------------------------------------------

            boolean isValid =
                    otpService.validateOtp(
                            email,
                            otpCode
                    );

            if (!isValid) {

                log.warn(
                        "Invalid or expired OTP for: {}",
                        email
                );

                return badRequest(
                        "Invalid or expired OTP"
                );
            }

            // ----------------------------------------------------
            // CRITICAL DUPLICATE CHECK
            //
            // We check again immediately before inserting.
            // ----------------------------------------------------

            if (userService.existsByEmail(email)) {

                log.warn(
                        "OTP verification rejected - email already registered: {}",
                        email
                );

                clearPendingRegistration(session);

                return badRequest(
                        "Email already registered"
                );
            }

            // ----------------------------------------------------
            // CHECK USERNAME AGAIN
            // ----------------------------------------------------

            String username =
                    registerRequest.getUsername();

            if (username != null) {

                username =
                        username.trim();

                if (userService.existsByUsername(
                        username
                )) {

                    log.warn(
                            "OTP verification rejected - username already taken: {}",
                            username
                    );

                    return badRequest(
                            "Username already taken"
                    );
                }
            }

            // ----------------------------------------------------
            // CREATE USER
            // ----------------------------------------------------

            UserResponse userResponse;

            try {

                userResponse =
                        userService.register(
                                registerRequest
                        );

            } catch (
                    DataIntegrityViolationException e
            ) {

                /*
                 * This protects against a race condition:
                 *
                 * Request A checks email -> available
                 * Request B checks email -> available
                 * Request A inserts
                 * Request B tries to insert
                 *
                 * Database unique constraint rejects B.
                 */

                log.warn(
                        "Duplicate registration blocked by database for: {}",
                        email
                );

                clearPendingRegistration(session);

                return badRequest(
                        "Email already registered"
                );

            } catch (IllegalArgumentException e) {

                log.warn(
                        "Registration rejected for {}: {}",
                        email,
                        e.getMessage()
                );

                return badRequest(
                        e.getMessage()
                );
            }

            if (userResponse == null) {

                log.error(
                        "User registration returned null for: {}",
                        email
                );

                return ResponseEntity
                        .status(
                                HttpStatus.INTERNAL_SERVER_ERROR
                        )
                        .body(
                                errorResponse(
                                        "Registration failed. Please try again."
                                )
                        );
            }

            // ----------------------------------------------------
            // MARK EMAIL AS VERIFIED
            // ----------------------------------------------------

            userService.markAsVerified(email);

            // ----------------------------------------------------
            // CLEAR PENDING REGISTRATION
            // ----------------------------------------------------

            clearPendingRegistration(session);

            // ----------------------------------------------------
            // LOAD USER
            // ----------------------------------------------------

            User authenticatedUser =
                    userService.getUserById(
                            userResponse.getId()
                    );

            if (authenticatedUser == null) {

                log.error(
                        "Registered user could not be loaded: {}",
                        email
                );

                return ResponseEntity
                        .status(
                                HttpStatus.INTERNAL_SERVER_ERROR
                        )
                        .body(
                                errorResponse(
                                        "Registration completed, but login session could not be created."
                                )
                        );
            }

            // ----------------------------------------------------
            // AUTHENTICATE
            // ----------------------------------------------------

            session.setAttribute(
                    "user",
                    authenticatedUser
            );

            session.setAttribute(
                    "userId",
                    authenticatedUser.getId()
            );

            // ----------------------------------------------------
            // RESPONSE USER DATA
            // ----------------------------------------------------

            Map<String, Object> userData =
                    buildUserData(
                            authenticatedUser
                    );

            Map<String, Object> response =
                    new HashMap<>();

            response.put(
                    "success",
                    true
            );

            response.put(
                    "message",
                    "Email verified and registration complete!"
            );

            response.put(
                    "user",
                    userData
            );

            log.info(
                    "Registration and verification successful for: {}",
                    email
            );

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error(
                    "OTP verification failed for {}: {}",
                    email,
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(
                            errorResponse(
                                    "Unable to verify OTP. Please try again."
                            )
                    );
        }
    }

    // ============================================================
    // RESEND OTP
    // ============================================================

    @PostMapping("/resend-otp")
    public ResponseEntity<Map<String, Object>> resendOtp(
            @RequestBody Map<String, String> request
    ) {

        try {

            if (request == null) {
                return badRequest(
                        "Request is required"
                );
            }

            String email =
                    normalizeEmail(
                            request.get("email")
                    );

            if (email.isEmpty()) {

                return badRequest(
                        "Email is required"
                );
            }

            log.info(
                    "Resend OTP request for: {}",
                    email
            );

            // ----------------------------------------------------
            // ALREADY REGISTERED
            // ----------------------------------------------------

            if (userService.existsByEmail(email)) {

                return badRequest(
                        "Email is already registered"
                );
            }

            // ----------------------------------------------------
            // RESEND
            // ----------------------------------------------------

            try {

                otpService.resendOtp(email);

            } catch (
                    OTPService.OTPDeliveryException e
            ) {

                log.error(
                        "Failed to resend OTP to {}: {}",
                        email,
                        e.getMessage(),
                        e
                );

                return ResponseEntity
                        .status(
                                HttpStatus.BAD_GATEWAY
                        )
                        .body(
                                errorResponse(
                                        "Unable to send OTP. Please try again."
                                )
                        );
            }

            Map<String, Object> response =
                    new HashMap<>();

            response.put(
                    "success",
                    true
            );

            response.put(
                    "message",
                    "OTP resent successfully"
            );

            response.put(
                    "email",
                    email
            );

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error(
                    "Resend OTP failed: {}",
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(
                            errorResponse(
                                    "Unable to resend OTP. Please try again."
                            )
                    );
        }
    }

    // ============================================================
    // AUTH STATUS
    // ============================================================

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getAuthStatus(
            HttpServletRequest request
    ) {

        try {

            HttpSession session =
                    request.getSession(false);

            boolean authenticated =
                    session != null &&
                            session.getAttribute("user") != null;

            Map<String, Object> response =
                    new HashMap<>();

            response.put(
                    "authenticated",
                    authenticated
            );

            if (authenticated) {

                Object sessionUser =
                        session.getAttribute("user");

                if (sessionUser instanceof User) {

                    response.put(
                            "user",
                            buildUserData(
                                    (User) sessionUser
                            )
                    );
                }
            }

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error(
                    "Failed to retrieve authentication status: {}",
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(
                            errorResponse(
                                    "Unable to retrieve authentication status"
                            )
                    );
        }
    }

    // ============================================================
    // LOGOUT
    // ============================================================

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(
            HttpServletRequest request
    ) {

        try {

            HttpSession session =
                    request.getSession(false);

            if (session != null) {
                session.invalidate();
            }

            Map<String, Object> response =
                    new HashMap<>();

            response.put(
                    "success",
                    true
            );

            response.put(
                    "message",
                    "Logged out successfully"
            );

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error(
                    "Logout failed: {}",
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(
                            errorResponse(
                                    "Unable to logout"
                            )
                    );
        }
    }

    // ============================================================
    // CURRENT USER
    // ============================================================

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getProfile(
            HttpServletRequest request
    ) {

        try {

            HttpSession session =
                    request.getSession(false);

            if (session == null) {

                return unauthorized(
                        "Not authenticated"
                );
            }

            Object sessionUser =
                    session.getAttribute("user");

            if (!(sessionUser instanceof User)) {

                return unauthorized(
                        "Not authenticated"
                );
            }

            User user =
                    (User) sessionUser;

            Map<String, Object> response =
                    new HashMap<>();

            response.put(
                    "authenticated",
                    true
            );

            response.put(
                    "user",
                    buildUserData(user)
            );

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error(
                    "Failed to retrieve profile: {}",
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(
                            errorResponse(
                                    "Unable to retrieve profile"
                            )
                    );
        }
    }

    // ============================================================
    // FORGOT PASSWORD
    // ============================================================

    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, Object>> forgotPassword(
            @RequestBody Map<String, String> request
    ) {

        try {

            if (request == null) {
                return badRequest(
                        "Request is required"
                );
            }

            String email =
                    normalizeEmail(
                            request.get("email")
                    );

            if (email.isEmpty()) {

                return badRequest(
                        "Email is required"
                );
            }

            log.info(
                    "Forgot password request for: {}",
                    email
            );

            Optional<User> user =
                    userService.findByEmail(email);

            if (user.isEmpty()) {

                return ResponseEntity
                        .status(HttpStatus.NOT_FOUND)
                        .body(
                                errorResponse(
                                        "Email not found"
                                )
                        );
            }

            try {

                otpService
                        .generateAndSendPasswordResetOtp(
                                email
                        );

            } catch (
                    OTPService.OTPDeliveryException e
            ) {

                log.error(
                        "Password reset OTP delivery failed for {}: {}",
                        email,
                        e.getMessage(),
                        e
                );

                return ResponseEntity
                        .status(HttpStatus.BAD_GATEWAY)
                        .body(
                                errorResponse(
                                        "Unable to send password reset email. Please try again."
                                )
                        );
            }

            Map<String, Object> response =
                    new HashMap<>();

            response.put(
                    "success",
                    true
            );

            response.put(
                    "message",
                    "Password reset OTP sent to your email"
            );

            response.put(
                    "email",
                    email
            );

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error(
                    "Forgot password failed: {}",
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(
                            errorResponse(
                                    "Unable to process password reset. Please try again."
                            )
                    );
        }
    }

    // ============================================================
    // RESET PASSWORD
    // ============================================================

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, Object>> resetPassword(
            @RequestBody Map<String, String> request
    ) {

        try {

            if (request == null) {
                return badRequest(
                        "Request is required"
                );
            }

            String email =
                    normalizeEmail(
                            request.get("email")
                    );

            String otpCode =
                    request.get("otpCode");

            String newPassword =
                    request.get("newPassword");

            if (email.isEmpty()) {

                return badRequest(
                        "Email is required"
                );
            }

            if (otpCode == null ||
                    otpCode.trim().isEmpty()) {

                return badRequest(
                        "OTP is required"
                );
            }

            otpCode = otpCode.trim();

            if (newPassword == null ||
                    newPassword.isEmpty()) {

                return badRequest(
                        "New password is required"
                );
            }

            log.info(
                    "Password reset request for: {}",
                    email
            );

            boolean isValid =
                    otpService.validatePasswordResetOtp(
                            email,
                            otpCode
                    );

            if (!isValid) {

                return badRequest(
                        "Invalid or expired OTP"
                );
            }

            userService.updatePassword(
                    email,
                    newPassword
            );

            Map<String, Object> response =
                    new HashMap<>();

            response.put(
                    "success",
                    true
            );

            response.put(
                    "message",
                    "Password reset successfully"
            );

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error(
                    "Reset password failed: {}",
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(
                            errorResponse(
                                    "Unable to reset password. Please try again."
                            )
                    );
        }
    }

    // ============================================================
    // HELPERS
    // ============================================================

    private String normalizeEmail(String email) {

        if (email == null) {
            return "";
        }

        return email
                .trim()
                .toLowerCase();
    }

    private void clearPendingRegistration(
            HttpSession session
    ) {

        if (session == null) {
            return;
        }

        session.removeAttribute(
                PENDING_REGISTRATION
        );

        session.removeAttribute(
                PENDING_REGISTRATION_EMAIL
        );
    }

    private Map<String, Object> buildUserData(
            User user
    ) {

        Map<String, Object> userData =
                new HashMap<>();

        if (user == null) {
            return userData;
        }

        userData.put(
                "id",
                user.getId()
        );

        userData.put(
                "username",
                safeString(
                        user.getUsername()
                )
        );

        userData.put(
                "email",
                safeString(
                        user.getEmail()
                )
        );

        userData.put(
                "fullName",
                safeString(
                        user.getFullName()
                )
        );

        return userData;
    }

    private Map<String, Object> errorResponse(
            String message
    ) {

        Map<String, Object> response =
                new HashMap<>();

        response.put(
                "success",
                false
        );

        response.put(
                "message",
                message
        );

        return response;
    }

    private ResponseEntity<Map<String, Object>> badRequest(
            String message
    ) {

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(
                        errorResponse(message)
                );
    }

    private ResponseEntity<Map<String, Object>> unauthorized(
            String message
    ) {

        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(
                        errorResponse(message)
                );
    }

    private String safeString(String value) {

        return value != null
                ? value
                : "";
    }
}
