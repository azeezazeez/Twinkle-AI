package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.*;
import com.ai.chatbot_backend.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepository;
    private final OTPService otpService;
    private final EmailService emailService;
    private final RedisEventService redisEventService;


    // ============================================================
    // VERIFY OTP
    // ============================================================

    @Transactional
    public ResponseEntity<ApiResponse> verifyOTP(VerifyOtpRequest request) {

        try {

            if (request == null) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Verification request is required",
                                        null
                                )
                        );
            }


            String email = normalizeEmail(request.getEmail());

            String otpCode = request.getOtpCode();


            // ----------------------------------------------------
            // VALIDATE EMAIL
            // ----------------------------------------------------

            if (email.isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Email is required",
                                        null
                                )
                        );
            }


            if (!email.matches(
                    "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
            )) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Please enter a valid email address",
                                        null
                                )
                        );
            }


            // ----------------------------------------------------
            // VALIDATE OTP
            // ----------------------------------------------------

            if (otpCode == null || otpCode.trim().isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "OTP is required",
                                        null
                                )
                        );
            }


            otpCode = otpCode.trim();


            if (!otpCode.matches("^\\d{6}$")) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "OTP must be a 6-digit code",
                                        null
                                )
                        );
            }


            log.info(
                    "Verifying OTP for email: {}",
                    email
            );


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
                        "Invalid or expired OTP for email: {}",
                        email
                );

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Invalid or expired OTP",
                                        null
                                )
                        );
            }


            // ----------------------------------------------------
            // FIND USER
            // ----------------------------------------------------

            Optional<User> userOptional =
                    userRepository.findByEmail(email);


            if (userOptional.isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "User account not found",
                                        null
                                )
                        );
            }


            // ----------------------------------------------------
            // VERIFY USER
            // ----------------------------------------------------

            User user = userOptional.get();

            user.setVerified(true);

            User savedUser =
                    userRepository.save(user);


            log.info(
                    "User verified successfully: {}",
                    email
            );


            // ----------------------------------------------------
            // REDIS EVENT
            // ----------------------------------------------------

            try {

                redisEventService.sendUserEvent(
                        "USER_VERIFIED",
                        email
                );

            } catch (Exception redisException) {

                /*
                 * Redis failure should not invalidate a
                 * successfully verified user.
                 */

                log.warn(
                        "Failed to send USER_VERIFIED Redis event for {}: {}",
                        email,
                        redisException.getMessage()
                );
            }


            // ----------------------------------------------------
            // RESPONSE
            // ----------------------------------------------------

            return ResponseEntity.ok(
                    new ApiResponse(
                            true,
                            "Email verified successfully",
                            savedUser
                    )
            );


        } catch (Exception e) {

            log.error(
                    "OTP verification error: {}",
                    e.getMessage(),
                    e
            );


            return ResponseEntity
                    .internalServerError()
                    .body(
                            new ApiResponse(
                                    false,
                                    "Verification failed. Please try again.",
                                    null
                            )
                    );
        }
    }


    // ============================================================
    // RESEND OTP
    // ============================================================

    public ResponseEntity<ApiResponse> resendOTP(
            ResendOTPRequest request
    ) {

        try {

            if (request == null) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Request is required",
                                        null
                                )
                        );
            }


            String email =
                    normalizeEmail(
                            request.getEmail()
                    );


            if (email.isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Email is required",
                                        null
                                )
                        );
            }


            if (!email.matches(
                    "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
            )) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Please enter a valid email address",
                                        null
                                )
                        );
            }


            log.info(
                    "Resending OTP for email: {}",
                    email
            );


            // ----------------------------------------------------
            // CHECK USER
            // ----------------------------------------------------

            Optional<User> userOptional =
                    userRepository.findByEmail(email);


            if (userOptional.isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Email not found",
                                        null
                                )
                        );
            }


            // ----------------------------------------------------
            // SEND OTP
            // ----------------------------------------------------

            otpService.resendOtp(email);


            // ----------------------------------------------------
            // REDIS EVENT
            // ----------------------------------------------------

            try {

                redisEventService.sendUserEvent(
                        "OTP_RESENT",
                        email
                );

            } catch (Exception redisException) {

                log.warn(
                        "Failed to send OTP_RESENT Redis event for {}: {}",
                        email,
                        redisException.getMessage()
                );
            }


            return ResponseEntity.ok(
                    new ApiResponse(
                            true,
                            "New OTP sent to your email",
                            null
                    )
            );


        } catch (OTPService.OTPDeliveryException e) {

            log.error(
                    "OTP delivery failed: {}",
                    e.getMessage(),
                    e
            );


            return ResponseEntity
                    .status(502)
                    .body(
                            new ApiResponse(
                                    false,
                                    "Unable to send OTP email. Please try again.",
                                    null
                            )
                    );


        } catch (Exception e) {

            log.error(
                    "Resend OTP error: {}",
                    e.getMessage(),
                    e
            );


            return ResponseEntity.badRequest()
                    .body(
                            new ApiResponse(
                                    false,
                                    "Failed to resend OTP",
                                    null
                            )
                    );
        }
    }


    // ============================================================
    // FORGOT PASSWORD
    // ============================================================

    public ResponseEntity<ApiResponse> forgotPassword(
            ForgotPasswordRequest request
    ) {

        try {

            if (request == null) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Request is required",
                                        null
                                )
                        );
            }


            String email =
                    normalizeEmail(
                            request.getEmail()
                    );


            if (email.isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Email is required",
                                        null
                                )
                        );
            }


            log.info(
                    "Processing forgot password for email: {}",
                    email
            );


            // ----------------------------------------------------
            // CHECK USER
            // ----------------------------------------------------

            Optional<User> userOptional =
                    userRepository.findByEmail(email);


            if (userOptional.isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Email not found",
                                        null
                                )
                        );
            }


            // ----------------------------------------------------
            // SEND RESET OTP
            // ----------------------------------------------------

            otpService.generateAndSendPasswordResetOtp(
                    email
            );


            // ----------------------------------------------------
            // REDIS EVENT
            // ----------------------------------------------------

            try {

                redisEventService.sendUserEvent(
                        "PASSWORD_RESET_REQUESTED",
                        email
                );

            } catch (Exception redisException) {

                log.warn(
                        "Failed to send PASSWORD_RESET_REQUESTED Redis event: {}",
                        redisException.getMessage()
                );
            }


            return ResponseEntity.ok(
                    new ApiResponse(
                            true,
                            "Password reset OTP sent to your email",
                            null
                    )
            );


        } catch (OTPService.OTPDeliveryException e) {

            log.error(
                    "Password reset OTP delivery failed: {}",
                    e.getMessage(),
                    e
            );


            return ResponseEntity
                    .status(502)
                    .body(
                            new ApiResponse(
                                    false,
                                    "Unable to send password reset email. Please try again.",
                                    null
                            )
                    );


        } catch (Exception e) {

            log.error(
                    "Forgot password error: {}",
                    e.getMessage(),
                    e
            );


            return ResponseEntity.badRequest()
                    .body(
                            new ApiResponse(
                                    false,
                                    "Failed to process password reset",
                                    null
                            )
                    );
        }
    }


    // ============================================================
    // RESET PASSWORD
    // ============================================================

    @Transactional
    public ResponseEntity<ApiResponse> resetPassword(
            ResetPasswordRequest request
    ) {

        try {

            if (request == null) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Request is required",
                                        null
                                )
                        );
            }


            String email =
                    normalizeEmail(
                            request.getEmail()
                    );

            String otpCode =
                    request.getOtpCode();

            String newPassword =
                    request.getNewPassword();


            // ----------------------------------------------------
            // VALIDATION
            // ----------------------------------------------------

            if (email.isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Email is required",
                                        null
                                )
                        );
            }


            if (otpCode == null ||
                    otpCode.trim().isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "OTP is required",
                                        null
                                )
                        );
            }


            if (newPassword == null ||
                    newPassword.isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "New password is required",
                                        null
                                )
                        );
            }


            otpCode = otpCode.trim();


            if (!otpCode.matches("^\\d{6}$")) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "OTP must be a 6-digit code",
                                        null
                                )
                        );
            }


            // ----------------------------------------------------
            // VALIDATE RESET OTP
            // ----------------------------------------------------

            boolean isValid =
                    otpService.validatePasswordResetOtp(
                            email,
                            otpCode
                    );


            if (!isValid) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "Invalid or expired OTP",
                                        null
                                )
                        );
            }


            // ----------------------------------------------------
            // FIND USER
            // ----------------------------------------------------

            Optional<User> userOptional =
                    userRepository.findByEmail(email);


            if (userOptional.isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                new ApiResponse(
                                        false,
                                        "User not found",
                                        null
                                )
                        );
            }


            // ----------------------------------------------------
            // UPDATE PASSWORD
            // ----------------------------------------------------

            User user =
                    userOptional.get();

            user.setPassword(newPassword);

            userRepository.save(user);


            log.info(
                    "Password reset successful for: {}",
                    email
            );


            // ----------------------------------------------------
            // REDIS EVENT
            // ----------------------------------------------------

            try {

                redisEventService.sendUserEvent(
                        "PASSWORD_RESET_SUCCESS",
                        email
                );

            } catch (Exception redisException) {

                log.warn(
                        "Failed to send PASSWORD_RESET_SUCCESS Redis event: {}",
                        redisException.getMessage()
                );
            }


            return ResponseEntity.ok(
                    new ApiResponse(
                            true,
                            "Password reset successfully",
                            null
                    )
            );


        } catch (Exception e) {

            log.error(
                    "Reset password error: {}",
                    e.getMessage(),
                    e
            );


            return ResponseEntity.badRequest()
                    .body(
                            new ApiResponse(
                                    false,
                                    "Failed to reset password",
                                    null
                            )
                    );
        }
    }


    // ============================================================
    // NORMALIZE EMAIL
    // ============================================================

    private String normalizeEmail(String email) {

        if (email == null) {
            return "";
        }

        return email
                .trim()
                .toLowerCase();
    }
}