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

    @Transactional
    public ResponseEntity<ApiResponse> verifyOTP(VerifyOTPRequest request) {
        try {
            log.info("Verifying OTP for email: {}", request.getEmail());

            boolean isValid = otpService.validateOtp(request.getEmail(), request.getOtpCode());

            if (!isValid) {
                log.warn("Invalid or expired OTP for email: {}", request.getEmail());
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "Invalid or expired OTP", null));
            }


            Optional<User> userOptional = userRepository.findByEmail(request.getEmail());
            userOptional.ifPresent(user -> {
                user.setVerified(true);
                userRepository.save(user);
                log.info("✅ User verified and saved: {}", request.getEmail());
            });

            redisEventService.sendUserEvent("USER_VERIFIED", request.getEmail());

            return ResponseEntity.ok(new ApiResponse(true, "Email verified successfully", null));

        } catch (Exception e) {
            log.error("OTP verification error: {}", e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(new ApiResponse(false, "Verification failed: " + e.getMessage(), null));
        }
    }

    public ResponseEntity<ApiResponse> resendOTP(ResendOTPRequest request) {
        try {
            log.info("Resending OTP for email: {}", request.getEmail());

            Optional<User> userOptional = userRepository.findByEmail(request.getEmail());
            if (userOptional.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "Email not found", null));
            }


            otpService.resendOtp(request.getEmail());

            redisEventService.sendUserEvent("OTP_RESENT", request.getEmail());

            return ResponseEntity.ok(new ApiResponse(true, "New OTP sent to your email", null));

        } catch (Exception e) {
            log.error("Resend OTP error: {}", e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(new ApiResponse(false, "Failed to resend OTP: " + e.getMessage(), null));
        }
    }

    public ResponseEntity<ApiResponse> forgotPassword(ForgotPasswordRequest request) {
        try {
            log.info("Processing forgot password for email: {}", request.getEmail());

            Optional<User> userOptional = userRepository.findByEmail(request.getEmail());
            if (userOptional.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "Email not found", null));
            }


            otpService.generateAndSendPasswordResetOtp(request.getEmail());

            redisEventService.sendUserEvent("PASSWORD_RESET_REQUESTED", request.getEmail());

            return ResponseEntity.ok(new ApiResponse(true, "Password reset OTP sent to your email", null));

        } catch (Exception e) {
            log.error("Forgot password error: {}", e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(new ApiResponse(false, "Failed to process request: " + e.getMessage(), null));
        }
    }

    @Transactional
    public ResponseEntity<ApiResponse> resetPassword(ResetPasswordRequest request) {
        try {
            log.info("Resetting password for email: {}", request.getEmail());


            boolean isValid = otpService.validatePasswordResetOtp(
                    request.getEmail(), request.getOtpCode());

            if (!isValid) {
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "Invalid or expired OTP", null));
            }

            Optional<User> userOptional = userRepository.findByEmail(request.getEmail());
            if (userOptional.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(new ApiResponse(false, "User not found", null));
            }

            User user = userOptional.get();
            user.setPassword(request.getNewPassword());
            userRepository.save(user);

            log.info("✅ Password reset successful for: {}", request.getEmail());

            redisEventService.sendUserEvent("PASSWORD_RESET_SUCCESS", request.getEmail());

            return ResponseEntity.ok(new ApiResponse(true, "Password reset successfully", null));

        } catch (Exception e) {
            log.error("Reset password error: {}", e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(new ApiResponse(false, "Failed to reset password: " + e.getMessage(), null));
        }
    }
}