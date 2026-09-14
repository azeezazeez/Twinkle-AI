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
                    request.getUsername()
                            .trim()
                            .isEmpty()) {

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


            User user =
                    userService.login(request);


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


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Login failed: {}",
                    e.getMessage(),
                    e
            );

            return unauthorized(
                    e.getMessage() != null
                            ? e.getMessage()
                            : "Invalid credentials"
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

            if (request == null) {

                return badRequest(
                        "Registration request is required"
                );
            }


            String email =
                    normalizeEmail(
                            request.getEmail()
                    );


            String username =
                    request.getUsername();


            if (username == null ||
                    username.trim().isEmpty()) {

                return badRequest(
                        "Username is required"
                );
            }


            username =
                    username.trim();


            if (request.getPassword() == null ||
                    request.getPassword().isEmpty()) {

                return badRequest(
                        "Password is required"
                );
            }


            if (username.contains("@")) {

                return badRequest(
                        "Username cannot be an email address"
                );
            }


            // ----------------------------------------------------
            // DUPLICATE CHECK
            // ----------------------------------------------------

            if (userService.existsByEmail(email)) {

                return badRequest(
                        "Email already registered"
                );
            }


            if (userService.existsByUsername(username)) {

                return badRequest(
                        "Username already taken"
                );
            }


            request.setEmail(email);
            request.setUsername(username);


            // ----------------------------------------------------
            // CREATE USER FIRST
            // ----------------------------------------------------

            UserResponse userResponse;

            try {

                userResponse =
                        userService.register(
                                request
                        );

            } catch (
                    DataIntegrityViolationException e
            ) {

                log.warn(
                        "Duplicate registration blocked: {}",
                        email
                );

                return badRequest(
                        "Email or username already registered"
                );
            }


            // ----------------------------------------------------
            // CREATE SESSION
            // ----------------------------------------------------

            HttpSession session =
                    httpRequest.getSession(true);


            session.setAttribute(
                    PENDING_REGISTRATION_EMAIL,
                    email
            );


            // ----------------------------------------------------
            // GENERATE / SAVE / SEND OTP
            // ----------------------------------------------------

            try {

                otpService.generateAndSendOtp(
                        email
                );

            } catch (
                    OTPService.OTPDeliveryException e
            ) {

                log.error(
                        "OTP delivery failed for {}: {}",
                        email,
                        e.getMessage(),
                        e
                );


                // Delete incomplete user
                userService.deleteByEmail(
                        email
                );


                clearPendingRegistration(
                        session
                );


                return ResponseEntity
                        .status(
                                HttpStatus.BAD_GATEWAY
                        )
                        .body(
                                errorResponse(
                                        "Unable to send verification email. Please try again."
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
                    "OTP sent successfully. Please verify your email."
            );

            response.put(
                    "email",
                    email
            );


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Signup failed: {}",
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
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


            otpCode =
                    otpCode.trim();


            // ----------------------------------------------------
            // SESSION CHECK
            // ----------------------------------------------------

            HttpSession session =
                    httpRequest.getSession(false);


            if (session == null) {

                return badRequest(
                        "Registration session expired. Please sign up again."
                );
            }


            String pendingEmail =
                    (String) session.getAttribute(
                            PENDING_REGISTRATION_EMAIL
                    );


            if (pendingEmail == null ||
                    !email.equals(
                            normalizeEmail(pendingEmail)
                    )) {

                return badRequest(
                        "Email verification mismatch. Please sign up again."
                );
            }


            // ----------------------------------------------------
            // FIND USER
            // ----------------------------------------------------

            Optional<User> userOptional =
                    userService.findByEmail(
                            email
                    );


            if (userOptional.isEmpty()) {

                return badRequest(
                        "Registration not found. Please sign up again."
                );
            }


            User user =
                    userOptional.get();


            if (user.isVerified()) {

                return badRequest(
                        "Email is already verified"
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

                return badRequest(
                        "Invalid or expired OTP"
                );
            }


            // ----------------------------------------------------
            // RELOAD VERIFIED USER
            // ----------------------------------------------------

            User authenticatedUser =
                    userService.findByEmail(
                            email
                    ).orElseThrow(() ->
                            new IllegalStateException(
                                    "Verified user could not be loaded"
                            )
                    );


            // ----------------------------------------------------
            // CLEAR PENDING SESSION DATA
            // ----------------------------------------------------

            clearPendingRegistration(
                    session
            );


            // ----------------------------------------------------
            // CREATE AUTHENTICATED SESSION
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
            // RESPONSE
            // ----------------------------------------------------

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
                    buildUserData(
                            authenticatedUser
                    )
            );


            log.info(
                    "Registration and verification successful: {}",
                    email
            );


            return ResponseEntity.ok(
                    response
            );


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


            Optional<User> userOptional =
                    userService.findByEmail(
                            email
                    );


            if (userOptional.isEmpty()) {

                return badRequest(
                        "Registration not found. Please sign up first."
                );
            }


            User user =
                    userOptional.get();


            if (user.isVerified()) {

                return badRequest(
                        "Email is already verified"
                );
            }


            otpService.resendOtp(
                    email
            );


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


            return ResponseEntity.ok(
                    response
            );


        } catch (
                OTPService.OTPDeliveryException e
        ) {

            log.error(
                    "Resend OTP failed: {}",
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


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Failed to retrieve auth status: {}",
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


            return ResponseEntity.ok(
                    response
            );


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


            return ResponseEntity.ok(
                    response
            );


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


            Optional<User> user =
                    userService.findByEmail(
                            email
                    );


            if (user.isEmpty()) {

                return ResponseEntity
                        .status(
                                HttpStatus.NOT_FOUND
                        )
                        .body(
                                errorResponse(
                                        "Email not found"
                                )
                        );
            }


            otpService
                    .generateAndSendPasswordResetOtp(
                            email
                    );


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


            return ResponseEntity.ok(
                    response
            );


        } catch (
                OTPService.OTPDeliveryException e
        ) {

            log.error(
                    "Password reset OTP delivery failed: {}",
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(
                            HttpStatus.BAD_GATEWAY
                    )
                    .body(
                            errorResponse(
                                    "Unable to send password reset email. Please try again."
                            )
                    );

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


            if (newPassword == null ||
                    newPassword.isEmpty()) {

                return badRequest(
                        "New password is required"
                );
            }


            otpCode =
                    otpCode.trim();


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


            return ResponseEntity.ok(
                    response
            );


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
    // BUILD USER DATA
    // ============================================================

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
                "verified",
                user.isVerified()
        );


        return userData;
    }


    // ============================================================
    // NORMALIZE EMAIL
    // ============================================================

    private String normalizeEmail(
            String email
    ) {

        if (email == null) {
            return "";
        }

        return email
                .trim()
                .toLowerCase();
    }


    // ============================================================
    // CLEAR PENDING REGISTRATION
    // ============================================================

    private void clearPendingRegistration(
            HttpSession session
    ) {

        if (session == null) {
            return;
        }

        session.removeAttribute(
                PENDING_REGISTRATION_EMAIL
        );
    }


    // ============================================================
    // ERROR RESPONSE
    // ============================================================

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


    // ============================================================
    // BAD REQUEST
    // ============================================================

    private ResponseEntity<Map<String, Object>> badRequest(
            String message
    ) {

        return ResponseEntity
                .status(
                        HttpStatus.BAD_REQUEST
                )
                .body(
                        errorResponse(message)
                );
    }


    // ============================================================
    // UNAUTHORIZED
    // ============================================================

    private ResponseEntity<Map<String, Object>> unauthorized(
            String message
    ) {

        return ResponseEntity
                .status(
                        HttpStatus.UNAUTHORIZED
                )
                .body(
                        errorResponse(message)
                );
    }


    // ============================================================
    // SAFE STRING
    // ============================================================

    private String safeString(
            String value
    ) {

        return value != null
                ? value
                : "";
    }
}
