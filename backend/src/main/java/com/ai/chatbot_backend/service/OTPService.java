package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.OTP;
import com.ai.chatbot_backend.repository.OTPRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class OTPService {

    private final OTPRepository otpRepository;
    private final EmailService emailService;


    @Value("${otp.length:6}")
    private int otpLength;


    @Value("${otp.expiration.minutes:10}")
    private int expirationMinutes;


    private static final SecureRandom RANDOM =
            new SecureRandom();


    // ============================================================
    // GENERATE AND SEND REGISTRATION OTP
    // ============================================================

    public String generateAndSendOtp(
            String email
    ) {

        return generateAndSendOtpInternal(
                email,
                false
        );
    }


    // ============================================================
    // GENERATE AND SEND PASSWORD RESET OTP
    // ============================================================

    public String generateAndSendPasswordResetOtp(
            String email
    ) {

        return generateAndSendOtpInternal(
                email,
                true
        );
    }


    // ============================================================
    // GENERATE OTP
    // ============================================================

    private String generateAndSendOtpInternal(
            String email,
            boolean passwordReset
    ) {

        try {

            String normalizedEmail =
                    normalizeEmail(email);


            // ----------------------------------------------------
            // DELETE OLD OTP
            // ----------------------------------------------------

            otpRepository.deleteByEmail(
                    normalizedEmail
            );


            // ----------------------------------------------------
            // GENERATE OTP
            // ----------------------------------------------------

            String otpCode =
                    generateOtpCode();


            LocalDateTime expiryTime =
                    LocalDateTime.now()
                            .plusMinutes(
                                    expirationMinutes
                            );


            // ----------------------------------------------------
            // SAVE OTP
            // ----------------------------------------------------

            OTP otp =
                    OTP.builder()
                            .email(normalizedEmail)
                            .otpCode(otpCode)
                            .expiryTime(expiryTime)
                            .verified(false)
                            .createdAt(LocalDateTime.now())
                            .build();


            otpRepository.save(otp);


            // ----------------------------------------------------
            // SEND EMAIL
            // ----------------------------------------------------

            emailService.sendOtp(
                    normalizedEmail,
                    otp
            );


            log.info(
                    "{} OTP generated and sent to {}",
                    passwordReset
                            ? "Password reset"
                            : "Registration",
                    normalizedEmail
            );


            return otpCode;


        } catch (Exception e) {

            log.error(
                    "OTP generation/delivery failed for {}: {}",
                    email,
                    e.getMessage(),
                    e
            );

            throw new OTPDeliveryException(
                    "Unable to send OTP",
                    e
            );
        }
    }


    // ============================================================
    // VALIDATE REGISTRATION OTP
    // ============================================================

    public boolean validateOtp(
            String email,
            String otpCode
    ) {

        return validateOtpInternal(
                email,
                otpCode,
                false
        );
    }


    // ============================================================
    // VALIDATE PASSWORD RESET OTP
    // ============================================================

    public boolean validatePasswordResetOtp(
            String email,
            String otpCode
    ) {

        return validateOtpInternal(
                email,
                otpCode,
                true
        );
    }


    // ============================================================
    // VALIDATE OTP INTERNAL
    // ============================================================

    private boolean validateOtpInternal(
            String email,
            String otpCode,
            boolean passwordReset
    ) {

        try {

            String normalizedEmail =
                    normalizeEmail(email);


            if (otpCode == null ||
                    otpCode.trim().isEmpty()) {

                return false;
            }


            String normalizedOtp =
                    otpCode.trim();


            // ----------------------------------------------------
            // FIND OTP
            // ----------------------------------------------------

            Optional<OTP> optionalOtp =
                    otpRepository
                            .findByEmailAndOtpCodeAndVerifiedFalse(
                                    normalizedEmail,
                                    normalizedOtp
                            );


            if (optionalOtp.isEmpty()) {

                log.warn(
                        "No matching OTP found for {}",
                        normalizedEmail
                );

                return false;
            }


            OTP otp =
                    optionalOtp.get();


            // ----------------------------------------------------
            // EXPIRATION CHECK
            // ----------------------------------------------------

            if (otp.getExpiryTime()
                    .isBefore(
                            LocalDateTime.now()
                    )) {

                log.warn(
                        "Expired OTP for {}",
                        normalizedEmail
                );

                return false;
            }


            // ----------------------------------------------------
            // MARK OTP VERIFIED
            // ----------------------------------------------------

            otp.setVerified(true);

            otpRepository.save(otp);


            log.info(
                    "{} OTP verified for {}",
                    passwordReset
                            ? "Password reset"
                            : "Registration",
                    normalizedEmail
            );


            return true;


        } catch (Exception e) {

            log.error(
                    "OTP validation failed for {}: {}",
                    email,
                    e.getMessage(),
                    e
            );

            return false;
        }
    }


    // ============================================================
    // RESEND OTP
    // ============================================================

    public void resendOtp(
            String email
    ) {

        generateAndSendOtp(email);
    }


    // ============================================================
    // GENERATE OTP CODE
    // ============================================================

    private String generateOtpCode() {

        int minimum =
                (int) Math.pow(
                        10,
                        otpLength - 1
                );

        int maximum =
                (int) Math.pow(
                        10,
                        otpLength
                ) - 1;


        int value =
                minimum +
                        RANDOM.nextInt(
                                maximum - minimum + 1
                        );


        return String.valueOf(value);
    }


    // ============================================================
    // NORMALIZE EMAIL
    // ============================================================

    private String normalizeEmail(
            String email
    ) {

        if (email == null ||
                email.trim().isEmpty()) {

            throw new IllegalArgumentException(
                    "Email is required"
            );
        }

        return email
                .trim()
                .toLowerCase();
    }


    // ============================================================
    // OTP DELIVERY EXCEPTION
    // ============================================================

    public static class OTPDeliveryException
            extends RuntimeException {

        public OTPDeliveryException(
                String message,
                Throwable cause
        ) {

            super(
                    message,
                    cause
            );
        }
    }
}
