package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.dto.OTP;
import com.ai.chatbot_backend.repository.OTPRepository;
import com.ai.chatbot_backend.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Slf4j
public class OTPService {

    private static final SecureRandom random = new SecureRandom();

    private final OTPRepository otpRepository;
    private final UserRepository userRepository;
    private final EmailService emailService;

    @Value("${otp.length:6}")
    private int otpLength;

    @Value("${otp.expiration.minutes:10}")
    private int expirationMinutes;


    // ============================================================
    // REGISTRATION OTP
    // ============================================================

    @Transactional
    public String generateAndSendOtp(String email) {

        String normalizedEmail = normalizeEmail(email);

        User user = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() ->
                        new IllegalArgumentException("User not found")
                );

        String otp = generateOtp();

        LocalDateTime expiry =
                LocalDateTime.now()
                        .plusMinutes(expirationMinutes);


        // Remove previous OTP records
        otpRepository.deleteByEmail(normalizedEmail);


        // --------------------------------------------------------
        // SAVE OTP TO USERS TABLE
        // --------------------------------------------------------

        user.setOtp(otp);
        user.setOtpExpiry(expiry);

        userRepository.save(user);


        // --------------------------------------------------------
        // SAVE OTP TO OTPS TABLE
        // --------------------------------------------------------

        OTP otpEntity = OTP.builder()
                .email(normalizedEmail)
                .otpCode(otp)
                .expiryTime(expiry)
                .verified(false)
                .build();

        otpRepository.save(otpEntity);


        // --------------------------------------------------------
        // SEND EMAIL
        // --------------------------------------------------------

        try {

            emailService.sendOTPEmail(
                    normalizedEmail,
                    otp
            );

            log.info(
                    "Registration OTP saved and sent to {}",
                    normalizedEmail
            );

            return otp;

        } catch (Exception e) {

            log.error(
                    "Failed to send registration OTP to {}",
                    normalizedEmail,
                    e
            );

            throw new OTPDeliveryException(
                    "Unable to send verification email. Please try again.",
                    e
            );
        }
    }


    // ============================================================
    // PASSWORD RESET OTP
    // ============================================================

    @Transactional
    public String generateAndSendPasswordResetOtp(String email) {

        String normalizedEmail = normalizeEmail(email);

        User user = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() ->
                        new IllegalArgumentException("User not found")
                );

        String otp = generateOtp();

        LocalDateTime expiry =
                LocalDateTime.now()
                        .plusMinutes(expirationMinutes);


        otpRepository.deleteByEmail(normalizedEmail);


        // Save in users
        user.setOtp(otp);
        user.setOtpExpiry(expiry);

        userRepository.save(user);


        // Save in otps
        OTP otpEntity = OTP.builder()
                .email(normalizedEmail)
                .otpCode(otp)
                .expiryTime(expiry)
                .verified(false)
                .build();

        otpRepository.save(otpEntity);


        try {

            emailService.sendPasswordResetOTP(
                    normalizedEmail,
                    otp
            );

            log.info(
                    "Password reset OTP saved and sent to {}",
                    normalizedEmail
            );

            return otp;

        } catch (Exception e) {

            log.error(
                    "Failed to send password reset OTP to {}",
                    normalizedEmail,
                    e
            );

            throw new OTPDeliveryException(
                    "Unable to send password reset email. Please try again.",
                    e
            );
        }
    }


    // ============================================================
    // VALIDATE REGISTRATION OTP
    // ============================================================

    @Transactional
    public boolean validateOtp(
            String email,
            String otpCode
    ) {

        return validateOtpInternal(email, otpCode);
    }


    // ============================================================
    // VALIDATE PASSWORD RESET OTP
    // ============================================================

    @Transactional
    public boolean validatePasswordResetOtp(
            String email,
            String otpCode
    ) {

        return validateOtpInternal(email, otpCode);
    }


    // ============================================================
    // COMMON OTP VALIDATION
    // ============================================================

    private boolean validateOtpInternal(
            String email,
            String otpCode
    ) {

        if (email == null || otpCode == null) {
            return false;
        }

        String normalizedEmail =
                normalizeEmail(email);

        String normalizedOtp =
                otpCode.trim();


        OTP otp = otpRepository
                .findByEmailAndOtpCodeAndVerifiedFalse(
                        normalizedEmail,
                        normalizedOtp
                )
                .orElse(null);


        if (otp == null) {

            log.warn(
                    "Invalid OTP for {}",
                    normalizedEmail
            );

            return false;
        }


        // Check expiry
        if (otp.getExpiryTime()
                .isBefore(LocalDateTime.now())) {

            log.warn(
                    "OTP expired for {}",
                    normalizedEmail
            );

            otpRepository.delete(otp);

            return false;
        }


        // --------------------------------------------------------
        // MARK OTPS RECORD VERIFIED
        // --------------------------------------------------------

        otp.setVerified(true);
        otpRepository.save(otp);


        // --------------------------------------------------------
        // UPDATE USERS RECORD
        // --------------------------------------------------------

        userRepository.findByEmail(normalizedEmail)
                .ifPresent(user -> {

                    user.setVerified(true);

                    user.setOtp(null);
                    user.setOtpExpiry(null);

                    userRepository.save(user);
                });


        log.info(
                "OTP verified successfully for {}",
                normalizedEmail
        );

        return true;
    }


    // ============================================================
    // RESEND
    // ============================================================

    public void resendOtp(String email) {
        generateAndSendOtp(email);
    }

    public void resendPasswordResetOtp(String email) {
        generateAndSendPasswordResetOtp(email);
    }


    // ============================================================
    // GENERATE OTP
    // ============================================================

    private String generateOtp() {

        StringBuilder otp =
                new StringBuilder(otpLength);

        for (int i = 0; i < otpLength; i++) {
            otp.append(random.nextInt(10));
        }

        return otp.toString();
    }


    // ============================================================
    // NORMALIZE EMAIL
    // ============================================================

    private String normalizeEmail(String email) {

        if (email == null ||
                email.trim().isEmpty()) {

            throw new IllegalArgumentException(
                    "Email is required"
            );
        }

        return email.trim().toLowerCase();
    }


    // ============================================================
    // EXCEPTION
    // ============================================================

    public static class OTPDeliveryException
            extends RuntimeException {

        public OTPDeliveryException(
                String message,
                Throwable cause
        ) {
            super(message, cause);
        }
    }
}
