package com.ai.chatbot_backend.controller;

import com.ai.chatbot_backend.config.ClientIpResolver;
import com.ai.chatbot_backend.config.PasswordPolicy;
import com.ai.chatbot_backend.config.SessionSupport;
import com.ai.chatbot_backend.dto.LoginRequest;
import com.ai.chatbot_backend.dto.RegisterRequest;
import com.ai.chatbot_backend.dto.VerifyOtpRequest;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.dto.UserResponse;
import com.ai.chatbot_backend.service.AccountService;
import com.ai.chatbot_backend.service.OTPService;
import com.ai.chatbot_backend.service.UserService;
import com.ai.chatbot_backend.service.ChatHistoryService;
import com.ai.chatbot_backend.service.RateLimitService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
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

    // Signup data held in the session until the OTP is verified.
    // Nothing is written to the users table before that.
    private static final String PENDING_REGISTRATION_USERNAME =
            "pending_registration_username";

    private static final String PENDING_REGISTRATION_PASSWORD_HASH =
            "pending_registration_password_hash";

    private final UserService userService;
    private final OTPService otpService;
    private final ChatHistoryService chatHistoryService;
    private final RateLimitService rateLimitService;
    private final AccountService accountService;
    private final ClientIpResolver clientIpResolver;

    // Emails we are willing to send per address, no matter which IP asks (stops mail-bombing
    // a victim from many IPs).
    private static final int MAX_MAILS_PER_ADDRESS = 3;
    private static final Duration MAIL_WINDOW = Duration.ofMinutes(10);

    private static final String GENERIC_FORGOT_MESSAGE =
            "If an account exists for that email, a password reset code has been sent.";

    private String clientIp(HttpServletRequest request) {
        return clientIpResolver.resolve(request);
    }

    /** True when too many emails were already sent to this address recently. */
    private boolean mailBudgetExceeded(String email) {
        return !rateLimitService.allow("mail-email:" + email, MAX_MAILS_PER_ADDRESS, MAIL_WINDOW);
    }

    // Failed-attempt lockouts (per account, in addition to the per-IP limits).
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int MAX_FAILED_ATTEMPTS_PER_IP = 30;
    private static final Duration LOCKOUT = Duration.ofMinutes(15);

    private ResponseEntity<Map<String, Object>> tooManyMails() {
        return ResponseEntity
                .status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(MAIL_WINDOW.toSeconds()))
                .body(errorResponse(
                        "Too many emails were sent to this address. Please try again in a few minutes."));
    }

    private ResponseEntity<Map<String, Object>> tooManyAttempts(String key) {
        long minutes = Math.max(1, (rateLimitService.retryAfterSeconds(key) + 59) / 60);
        return ResponseEntity
                .status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(rateLimitService.retryAfterSeconds(key)))
                .body(errorResponse(
                        "Too many failed attempts. Please try again in "
                                + minutes + (minutes == 1 ? " minute." : " minutes.")
                ));
    }


    // ============================================================
    // LOGIN
    // ============================================================

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(
            @RequestBody LoginRequest request,
            HttpServletRequest httpRequest
    ) {

        String loginKey = null;

        try {

            // ----------------------------------------------------
            // VALIDATION
            // ----------------------------------------------------

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


            // ----------------------------------------------------
            // LOGIN
            // ----------------------------------------------------

            // Lockout is per (account + client IP) so a stranger cannot lock the real owner
            // out, plus a per-IP failure budget against password spraying.
            String loginIp = clientIp(httpRequest);
            loginKey = "login-fail:" +
                    request.getUsername().trim().toLowerCase() + "|" + loginIp;
            String loginIpKey = "login-fail-ip:" + loginIp;

            if (rateLimitService.isBlocked(loginKey, MAX_FAILED_ATTEMPTS)) {
                return tooManyAttempts(loginKey);
            }
            if (rateLimitService.isBlocked(loginIpKey, MAX_FAILED_ATTEMPTS_PER_IP)) {
                return tooManyAttempts(loginIpKey);
            }

            User user =
                    userService.login(request);


            if (user == null) {

                rateLimitService.recordFailure(loginKey, LOCKOUT);
                rateLimitService.recordFailure(loginIpKey, LOCKOUT);

                return unauthorized(
                        "Invalid credentials"
                );
            }

            rateLimitService.reset(loginKey);


            // ----------------------------------------------------
            // CREATE SESSION
            // ----------------------------------------------------

            // Rotates the session ID (anti session-fixation) and keeps the password hash
            // out of the stored session.
            SessionSupport.establishAuthenticatedSession(httpRequest, user);


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
                    "Login successful"
            );


            response.put(
                    "user",
                    buildUserData(user)
            );


            log.info(
                    "Login successful for userId: {}",
                    user.getId()
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


            /*
             * IMPORTANT:
             *
             * Do NOT convert every exception into 401.
             *
             * 401 should represent authentication failure.
             * Database/server errors should be 500.
             */

            String message =
                    e.getMessage();


            if (message != null &&
                    (
                            message.equalsIgnoreCase(
                                    "Invalid credentials"
                            )
                                    ||
                                    message.equalsIgnoreCase(
                                            "Please verify your email before logging in"
                                    )
                    )) {

                if (loginKey != null &&
                        message.equalsIgnoreCase("Invalid credentials")) {
                    rateLimitService.recordFailure(loginKey, LOCKOUT);
                    rateLimitService.recordFailure(
                            "login-fail-ip:" + clientIp(httpRequest), LOCKOUT);
                }

                return unauthorized(
                        message
                );
            }


            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(
                            errorResponse(
                                    "Unable to login. Please try again."
                            )
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

        String email = null;

        try {

            // ----------------------------------------------------
            // VALIDATION
            // ----------------------------------------------------

            if (request == null) {

                return badRequest(
                        "Registration request is required"
                );
            }


            email =
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


            if (username.length() > 50) {
                return badRequest("Username cannot exceed 50 characters");
            }

            String passwordProblem =
                    PasswordPolicy.validate(request.getPassword(), username, email);
            if (passwordProblem != null) {
                return badRequest(passwordProblem);
            }

            if (username.contains("@")) {

                return badRequest(
                        "Username cannot be an email address"
                );
            }


            // ----------------------------------------------------
            // DUPLICATE EMAIL
            // ----------------------------------------------------

            if (userService.existsByEmail(email)) {

                return badRequest(
                        "Email already registered"
                );
            }


            // ----------------------------------------------------
            // DUPLICATE USERNAME
            // ----------------------------------------------------

            if (userService.existsByUsername(username)) {

                return badRequest(
                        "Username already taken"
                );
            }


            request.setEmail(email);
            request.setUsername(username);

            if (mailBudgetExceeded(email)) {
                return tooManyMails();
            }


            // ----------------------------------------------------
            // HOLD SIGNUP IN SESSION (user row is created only after OTP)
            // ----------------------------------------------------

            HttpSession session =
                    httpRequest.getSession(true);

            session.setAttribute(
                    PENDING_REGISTRATION_EMAIL,
                    email
            );

            session.setAttribute(
                    PENDING_REGISTRATION_USERNAME,
                    username
            );

            session.setAttribute(
                    PENDING_REGISTRATION_PASSWORD_HASH,
                    userService.encodePassword(request.getPassword())
            );


            // ----------------------------------------------------
            // GENERATE + SAVE + SEND OTP
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


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Signup failed for {}: {}",
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
                                    "Unable to complete signup. Please try again."
                            )
                    );
        }
    }


    // ============================================================
    // REQUEST OTP — UNIFIED EMAIL LOGIN / SIGNUP
    // ============================================================

    @PostMapping("/request-otp")
    public ResponseEntity<Map<String, Object>> requestOtp(
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest
    ) {

        String email = null;
        boolean createdNewUser = false;

        try {
            if (request == null) {
                return badRequest("OTP request is required");
            }

            email = normalizeEmail(request.get("email"));

            if (email.isEmpty()) {
                return badRequest("Email is required");
            }

            if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
                return badRequest("Please enter a valid email address");
            }

            // Do NOT create the user here. A new email only becomes a row in
            // the users table after its OTP has been verified.
            if (mailBudgetExceeded(email)) {
                return tooManyMails();
            }

            Optional<User> existingUser = userService.findByEmail(email);
            createdNewUser = existingUser.isEmpty();

            HttpSession session = httpRequest.getSession(true);
            session.setAttribute(PENDING_REGISTRATION_EMAIL, email);
            session.removeAttribute(PENDING_REGISTRATION_USERNAME);
            session.removeAttribute(PENDING_REGISTRATION_PASSWORD_HASH);

            try {
                otpService.generateAndSendOtp(email);
            } catch (OTPService.OTPDeliveryException e) {
                log.error(
                        "OTP delivery failed for {}: {}",
                        email,
                        e.getMessage(),
                        e
                );

                clearPendingRegistration(session);

                return ResponseEntity
                        .status(HttpStatus.BAD_GATEWAY)
                        .body(errorResponse(
                                "Unable to send verification email. Please try again."
                        ));
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Verification code sent successfully.");
            response.put("email", email);
            // isNewUser / verified are intentionally NOT returned: they would tell anyone
            // whether an email address has an account.

            log.info("OTP requested (newUser={})", createdNewUser);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error(
                    "OTP request failed for {}: {}",
                    email,
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResponse(
                            "Unable to send verification code. Please try again."
                    ));
        }
    }


    // ============================================================
    // VERIFY OTP — UNIFIED EMAIL LOGIN / SIGNUP
    // ============================================================

    @PostMapping("/verify-otp")
    public ResponseEntity<Map<String, Object>> verifyOtp(
            @Valid @RequestBody VerifyOtpRequest request,
            HttpServletRequest httpRequest
    ) {

        String email = null;

        try {
            if (request == null) {
                return badRequest("OTP verification request is required");
            }

            email = normalizeEmail(request.getEmail());
            String otpCode = request.getOtpCode();

            if (email.isEmpty()) {
                return badRequest("Email is required");
            }

            if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
                return badRequest("Please enter a valid email address");
            }

            if (otpCode == null || otpCode.trim().isEmpty()) {
                return badRequest("OTP is required");
            }

            otpCode = otpCode.trim();

            if (!otpCode.matches("^\\d{6}$")) {
                return badRequest("OTP must be a 6-digit code");
            }

            HttpSession session = httpRequest.getSession(false);

            if (session == null) {
                return badRequest(
                        "Verification session expired. Please request a new OTP."
                );
            }

            String pendingEmail = (String) session.getAttribute(
                    PENDING_REGISTRATION_EMAIL
            );

            if (pendingEmail == null || pendingEmail.trim().isEmpty()) {
                return badRequest(
                        "Verification session expired. Please request a new OTP."
                );
            }

            if (!email.equals(normalizeEmail(pendingEmail))) {
                return badRequest(
                        "Email verification mismatch. Please request a new OTP."
                );
            }

            Optional<User> userOptional = userService.findByEmail(email);

            String otpKey = "otp-fail:" + email + "|" + clientIp(httpRequest);

            if (rateLimitService.isBlocked(otpKey, MAX_FAILED_ATTEMPTS)) {
                return tooManyAttempts(otpKey);
            }

            boolean valid = otpService.validateOtp(email, otpCode);

            if (!valid) {
                rateLimitService.recordFailure(otpKey, LOCKOUT);
                return badRequest("Invalid or expired OTP");
            }

            rateLimitService.reset(otpKey);

            if (userOptional.isPresent()) {
                if (!userOptional.get().isVerified()) {
                    userService.markAsVerified(email);
                }
            } else {
                // OTP is valid and no user exists yet: create the verified user now.
                String pendingUsername =
                        (String) session.getAttribute(PENDING_REGISTRATION_USERNAME);
                String pendingPasswordHash =
                        (String) session.getAttribute(PENDING_REGISTRATION_PASSWORD_HASH);

                if (pendingUsername != null && pendingPasswordHash != null) {
                    userService.createVerifiedUser(
                            pendingUsername,
                            email,
                            pendingPasswordHash
                    );
                } else {
                    userService.createVerifiedOtpUser(email);
                }
            }

            User authenticatedUser = userService.findByEmail(email)
                    .orElseThrow(() -> new IllegalStateException(
                            "Verified user could not be loaded"
                    ));

            clearPendingRegistration(session);
            SessionSupport.establishAuthenticatedSession(httpRequest, authenticatedUser);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Email verified successfully");
            response.put("user", buildUserData(authenticatedUser));

            log.info("Email OTP authentication successful for userId {}", authenticatedUser.getId());

            return ResponseEntity.ok(response);

        } catch (com.ai.chatbot_backend.exception.AIServiceException e) {
            return badRequest(e.getMessage());

        } catch (Exception e) {
            log.error(
                    "OTP verification failed for {}: {}",
                    email,
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResponse(
                            "Unable to verify OTP. Please try again."
                    ));
        }
    }


    // ============================================================
    // RESEND OTP
    // ============================================================

    @PostMapping("/resend-otp")
    public ResponseEntity<Map<String, Object>> resendOtp(
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest
    ) {

        String email = null;

        try {
            if (request == null) {
                return badRequest("Request is required");
            }

            email = normalizeEmail(request.get("email"));

            if (email.isEmpty()) {
                return badRequest("Email is required");
            }

            if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
                return badRequest("Please enter a valid email address");
            }

            Optional<User> userOptional = userService.findByEmail(email);

            if (userOptional.isEmpty()) {
                HttpSession existingSession = httpRequest.getSession(false);
                String pending = existingSession == null
                        ? null
                        : (String) existingSession.getAttribute(PENDING_REGISTRATION_EMAIL);

                if (pending == null || !email.equals(normalizeEmail(pending))) {
                    // Same answer as a real resend so this endpoint cannot be used to
                    // discover which emails have accounts. Nothing is sent.
                    Map<String, Object> quiet = new HashMap<>();
                    quiet.put("success", true);
                    quiet.put("message", "Verification code resent successfully.");
                    quiet.put("email", email);
                    return ResponseEntity.ok(quiet);
                }
            }

            if (mailBudgetExceeded(email)) {
                return tooManyMails();
            }

            otpService.resendOtp(email);

            HttpSession session = httpRequest.getSession(true);
            session.setAttribute(PENDING_REGISTRATION_EMAIL, email);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Verification code resent successfully.");
            response.put("email", email);

            return ResponseEntity.ok(response);

        } catch (OTPService.OTPDeliveryException e) {
            log.error(
                    "Resend OTP delivery failed for {}: {}",
                    email,
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(HttpStatus.BAD_GATEWAY)
                    .body(errorResponse(
                            "Unable to send verification code. Please try again."
                    ));

        } catch (Exception e) {
            log.error(
                    "Resend OTP failed for {}: {}",
                    email,
                    e.getMessage(),
                    e
            );

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResponse(
                            "Unable to resend verification code. Please try again."
                    ));
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
    // LOG OUT OF ALL DEVICES
    // ============================================================

    @PostMapping("/logout-all")
    public ResponseEntity<Map<String, Object>> logoutAll(
            HttpServletRequest request
    ) {

        try {

            HttpSession session = request.getSession(false);
            Object userId = session == null ? null : session.getAttribute("userId");

            if (!(userId instanceof Number)) {
                return unauthorized("Not authenticated");
            }

            accountService.revokeAllSessions(((Number) userId).longValue());

            try {
                session.invalidate();
            } catch (IllegalStateException ignored) {
                // already invalidated
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Logged out of all devices");

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error("Logout all failed: {}", e.getMessage(), e);

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResponse("Unable to log out of all devices"));
        }
    }


    // ============================================================
    // DELETE ACCOUNT
    // ============================================================

    @DeleteMapping("/account")
    public ResponseEntity<Map<String, Object>> deleteAccount(
            HttpServletRequest request
    ) {

        try {

            HttpSession session = request.getSession(false);
            Object userId = session == null ? null : session.getAttribute("userId");

            if (!(userId instanceof Number)) {
                return unauthorized("Not authenticated");
            }

            User user = userService.getUserById(((Number) userId).longValue());

            accountService.deleteAccount(user);

            try {
                session.invalidate();
            } catch (IllegalStateException ignored) {
                // already invalidated
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Account deleted");

            return ResponseEntity.ok(response);

        } catch (Exception e) {

            log.error("Delete account failed: {}", e.getMessage(), e);

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResponse("Unable to delete account"));
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
    // PROFILE UPDATE
    // ============================================================

    @PatchMapping("/profile")
    public ResponseEntity<Map<String, Object>> updateProfile(
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest
    ) {
        try {
            // ----------------------------------------------------
            // VALIDATE REQUEST
            // ----------------------------------------------------
            if (request == null) {
                return badRequest("Profile update request is required");
            }

            // Full name update (independent of the username).
            if (request.containsKey("name") && !request.containsKey("username")) {
                String fullName = request.get("name") == null ? "" : request.get("name").trim();

                if (fullName.length() < 2) {
                    return badRequest("Full name must be at least 2 characters");
                }
                if (fullName.length() > 100) {
                    return badRequest("Full name cannot exceed 100 characters");
                }

                HttpSession nameSession = httpRequest.getSession(false);
                Object nameSessionUser = nameSession == null ? null : nameSession.getAttribute("user");

                if (!(nameSessionUser instanceof User) || ((User) nameSessionUser).getId() == null) {
                    return unauthorized("Not authenticated");
                }

                User renamed = userService.updateFullName(((User) nameSessionUser).getId(), fullName);
                nameSession.setAttribute("user", SessionSupport.sanitize(renamed));

                Map<String, Object> nameResponse = new HashMap<>();
                nameResponse.put("success", true);
                nameResponse.put("message", "Name updated successfully");
                nameResponse.put("user", buildUserData(renamed));
                return ResponseEntity.ok(nameResponse);
            }

            String username = request.get("username");

            if (username == null || username.trim().isEmpty()) {
                return badRequest("Username is required");
            }

            username = username.trim();

            if (username.length() < 3) {
                return badRequest("Username must be at least 3 characters");
            }

            if (username.length() > 50) {
                return badRequest("Username cannot exceed 50 characters");
            }

            if (username.contains("@")) {
                return badRequest("Username cannot be an email address");
            }

            // ----------------------------------------------------
            // GET AUTHENTICATED SESSION
            // ----------------------------------------------------
            HttpSession session = httpRequest.getSession(false);

            if (session == null) {
                return unauthorized("Not authenticated");
            }

            Object sessionUser = session.getAttribute("user");

            if (!(sessionUser instanceof User)) {
                return unauthorized("Not authenticated");
            }

            User currentUser = (User) sessionUser;

            Long userId = currentUser.getId();

            if (userId == null) {
                log.error("Authenticated user has no ID");
                return ResponseEntity
                        .status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(errorResponse(
                                "Authenticated user ID is missing"
                        ));
            }

            // ----------------------------------------------------
            // NO CHANGE
            // ----------------------------------------------------
            if (username.equals(currentUser.getUsername())) {
                Map<String, Object> response = new HashMap<>();

                response.put("success", true);
                response.put("message", "Profile is already up to date");
                response.put("user", buildUserData(currentUser));

                return ResponseEntity.ok(response);
            }

            // ----------------------------------------------------
            // CHECK USERNAME AVAILABILITY
            // ----------------------------------------------------
            Optional<User> existingUser =
                    userService.findByUsername(username);

            if (existingUser.isPresent()
                    && existingUser.get().getId() != null
                    && !existingUser.get().getId().equals(userId)) {

                return ResponseEntity
                        .status(HttpStatus.CONFLICT)
                        .body(errorResponse(
                                "Username already exists"
                        ));
            }

            // ----------------------------------------------------
            // UPDATE DATABASE
            // ----------------------------------------------------
            String oldUsername = currentUser.getUsername();

            User updatedUser =
                    userService.updateUsername(
                            userId,
                            username
                    );

            if (updatedUser == null) {
                log.error(
                        "UserService returned null after username update. userId={}",
                        userId
                );

                return ResponseEntity
                        .status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(errorResponse(
                                "Unable to update profile"
                        ));
            }

            // ----------------------------------------------------
            // UPDATE SESSION
            // ----------------------------------------------------
            session.setAttribute("user", SessionSupport.sanitize(updatedUser));

            session.setAttribute(
                    "userId",
                    updatedUser.getId()
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
                    "Username updated successfully"
            );

            response.put(
                    "user",
                    buildUserData(updatedUser)
            );

            log.info(
                    "Username updated successfully: userId={}, oldUsername={}, newUsername={}",
                    userId,
                    oldUsername,
                    updatedUser.getUsername()
            );

            return ResponseEntity.ok(response);

        } catch (DataIntegrityViolationException e) {

            log.warn(
                    "Username update violated database constraint: {}",
                    e.getMessage()
            );

            return ResponseEntity
                    .status(HttpStatus.CONFLICT)
                    .body(errorResponse(
                            "Username already exists"
                    ));

        } catch (Exception e) {

            log.error(
                    "Profile update failed: {}",
                    e.getMessage(),
                    e
            );

            String message =
                    e.getMessage() == null ||
                            e.getMessage().trim().isEmpty()
                            ? "Unable to update profile. Please try again."
                            : e.getMessage();

            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body(errorResponse(message));
        }
    }

    @GetMapping("/profile/stats")
    public ResponseEntity<?> getProfileStats(HttpServletRequest httpRequest) {
        try {
            HttpSession session = httpRequest.getSession(false);
            if (session == null || session.getAttribute("userId") == null) {
                return unauthorized("Not authenticated");
            }
            User user = userService.getUserById((Long) session.getAttribute("userId"));
            return ResponseEntity.ok(chatHistoryService.getProfileStats(user));
        } catch (Exception e) {
            log.error("Profile stats failed", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResponse("Unable to load profile statistics"));
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
                return badRequest("Request is required");
            }

            String email = normalizeEmail(request.get("email"));

            if (email.isEmpty()) {
                return badRequest("Email is required");
            }

            if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
                return badRequest("Please enter a valid email address");
            }

            // The answer is identical whether or not the account exists, and the e-mail is
            // sent in the background, so neither the body nor the response time reveals
            // which addresses are registered.
            Optional<User> user = userService.findByEmail(email);

            if (user.isPresent() && !mailBudgetExceeded(email)) {
                final String target = email;
                java.util.concurrent.CompletableFuture.runAsync(() -> {
                    try {
                        otpService.generateAndSendPasswordResetOtp(target);
                    } catch (Exception e) {
                        log.error("Password reset OTP could not be sent: {}", e.getMessage());
                    }
                });
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", GENERIC_FORGOT_MESSAGE);
            response.put("email", email);
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Forgot password failed: {}", e.getMessage());
            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResponse("Unable to process request. Please try again."));
        }
    }

    // ============================================================

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, Object>> resetPassword(
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest
    ) {
        try {
            if (request == null) {
                return badRequest("Request is required");
            }

            String email = normalizeEmail(request.get("email"));
            String otpCode = request.get("otpCode");
            String newPassword = request.get("newPassword");

            if (email.isEmpty()) {
                return badRequest("Email is required");
            }

            if (otpCode == null || otpCode.trim().isEmpty()) {
                return badRequest("OTP is required");
            }

            // Check the password BEFORE the OTP: the code is single use and must not be
            // burned by a password that is rejected afterwards.
            String passwordProblem = PasswordPolicy.validate(newPassword, null, email);
            if (passwordProblem != null) {
                return badRequest(passwordProblem);
            }

            otpCode = otpCode.trim();

            String resetKey = "reset-fail:" + email + "|" + clientIp(httpRequest);

            if (rateLimitService.isBlocked(resetKey, MAX_FAILED_ATTEMPTS)) {
                return tooManyAttempts(resetKey);
            }

            boolean isValid = otpService.validatePasswordResetOtp(email, otpCode);

            if (!isValid) {
                rateLimitService.recordFailure(resetKey, LOCKOUT);
                return badRequest("Invalid or expired OTP");
            }

            rateLimitService.reset(resetKey);

            userService.updatePassword(email, newPassword);

            // A password reset must kick out whoever may already be signed in
            // (for example an attacker who had the old password).
            userService.findByEmail(email).ifPresent(u -> accountService.revokeAllSessions(u.getId()));

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Password reset successfully");
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Reset password failed: {}", e.getMessage());
            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResponse("Unable to reset password. Please try again."));
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

        userData.put("avatarUrl", safeString(user.getAvatarUrl()));
        userData.put("name", safeString(user.getFullName()));
        userData.put("authProvider", safeString(user.getAuthProvider()));
        userData.put("createdAt", user.getCreatedAt());


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

        session.removeAttribute(
                PENDING_REGISTRATION_USERNAME
        );

        session.removeAttribute(
                PENDING_REGISTRATION_PASSWORD_HASH
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
