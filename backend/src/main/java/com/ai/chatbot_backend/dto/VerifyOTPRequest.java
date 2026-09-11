package com.ai.chatbot_backend.dto;

import lombok.Data;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

@Data
public class VerifyOTPRequest {
    @NotBlank
    @Email
    private String email;

    @NotBlank
    private String otpCode;  // ← Make sure this is "otpCode" not "OTPCode"
}