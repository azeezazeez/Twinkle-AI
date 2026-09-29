package com.ai.chatbot_backend.dto;

import lombok.Data;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Data
public class ResetPasswordRequest {
    @NotBlank
    @Email
    private String email;

    @NotBlank
    private String otpCode;  // ← Make sure this is "otpCode"

    @NotBlank
    @Size(min = 5, max = 100)
    private String newPassword;
}