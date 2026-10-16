package com.ai.chatbot_backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

@Service
public class EmailService {

    private static final Logger logger =
            LoggerFactory.getLogger(EmailService.class);

    @Value("${brevo.api.key:}")
    private String apiKey;

    @Value("${brevo.api.url:https://api.brevo.com/v3/smtp/email}")
    private String apiUrl;

    @Value("${brevo.sender.email:}")
    private String senderEmail;

    @Value("${brevo.sender.name:Twinkle AI}")
    private String senderName;

    @Value("${otp.expiration.minutes:10}")
    private int otpExpirationMinutes;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Send registration OTP.
     */
    public void sendOTPEmail(String toEmail, String otp) {
        sendEmail(
                toEmail,
                "Your OTP Verification Code",
                buildOtpHtmlContent(otp)
        );
    }

    /**
     * Send password reset OTP.
     */
    public void sendPasswordResetOTP(String toEmail, String otp) {
        sendEmail(
                toEmail,
                "Password Reset OTP",
                buildPasswordResetHtmlContent(otp)
        );
    }

    /**
     * Alias.
     */
    public void sendOtpEmail(String toEmail, String otp) {
        sendOTPEmail(toEmail, otp);
    }

    /**
     * Send welcome email.
     */
    public void sendWelcomeEmail(
            String toEmail,
            String userName
    ) {
        sendEmail(
                toEmail,
                "Welcome to ChatBot!",
                buildWelcomeHtmlContent(userName)
        );
    }

    /**
     * Send email using Brevo REST API.
     */
    private void sendEmail(
            String toEmail,
            String subject,
            String htmlContent
    ) {

        validateConfiguration();

        if (toEmail == null || toEmail.trim().isEmpty()) {
            throw new IllegalArgumentException("Recipient email is required");
        }

        try {

            String normalizedEmail =
                    toEmail.trim().toLowerCase();

            logger.info(
                    "Sending email to {} with subject '{}'",
                    normalizedEmail,
                    subject
            );

            Map<String, Object> body = Map.of(
                    "sender",
                    Map.of(
                            "name",
                            senderName,
                            "email",
                            senderEmail
                    ),
                    "to",
                    List.of(
                            Map.of(
                                    "email",
                                    normalizedEmail
                            )
                    ),
                    "subject",
                    subject,
                    "htmlContent",
                    htmlContent
            );

            String requestBody =
                    objectMapper.writeValueAsString(body);

            HttpRequest request =
                    HttpRequest.newBuilder()
                            .uri(URI.create(apiUrl))
                            .timeout(Duration.ofSeconds(60))
                            .header(
                                    "Content-Type",
                                    "application/json"
                            )
                            .header(
                                    "Accept",
                                    "application/json"
                            )
                            .header(
                                    "api-key",
                                    apiKey
                            )
                            .POST(
                                    HttpRequest.BodyPublishers
                                            .ofString(requestBody)
                            )
                            .build();

            HttpResponse<String> response =
                    httpClient.send(
                            request,
                            HttpResponse.BodyHandlers.ofString()
                    );

            int statusCode = response.statusCode();
            String responseBody = response.body();

            if (statusCode >= 200 && statusCode < 300) {

                logger.info(
                        "Email sent successfully to {}. Brevo status: {}",
                        normalizedEmail,
                        statusCode
                );

                return;
            }

            /*
             * IMPORTANT:
             * Never log the Brevo API key.
             * The response body is useful for diagnosing
             * authentication, sender, quota and validation errors.
             */
            logger.error(
                    "Brevo email request failed. Recipient: {}, Status: {}, Response: {}",
                    normalizedEmail,
                    statusCode,
                    responseBody
            );

            throw new EmailDeliveryException(
                    buildBrevoErrorMessage(
                            statusCode,
                            responseBody
                    )
            );

        } catch (EmailDeliveryException e) {
            throw e;

        } catch (InterruptedException e) {

            Thread.currentThread().interrupt();

            logger.error(
                    "Email request interrupted for {}",
                    toEmail,
                    e
            );

            throw new EmailDeliveryException(
                    "Email service request was interrupted",
                    e
            );

        } catch (Exception e) {

            logger.error(
                    "Unexpected error sending email to {}: {}",
                    toEmail,
                    e.getMessage(),
                    e
            );

            throw new EmailDeliveryException(
                    "Unable to connect to email service",
                    e
            );
        }
    }

    /**
     * Validate required Brevo configuration.
     */
    private void validateConfiguration() {

        if (apiKey == null || apiKey.trim().isEmpty()) {
            logger.error("BREVO_API_KEY is missing");
            throw new EmailDeliveryException(
                    "Email service is not configured"
            );
        }

        if (apiUrl == null || apiUrl.trim().isEmpty()) {
            logger.error("BREVO_API_URL is missing");
            throw new EmailDeliveryException(
                    "Email service URL is not configured"
            );
        }

        if (senderEmail == null || senderEmail.trim().isEmpty()) {
            logger.error("BREVO_SENDER_EMAIL is missing");
            throw new EmailDeliveryException(
                    "Email sender is not configured"
            );
        }

        if (senderName == null || senderName.trim().isEmpty()) {
            senderName = "Twinkle AI";
        }
    }

    /**
     * Build useful but safe Brevo error message.
     */
    private String buildBrevoErrorMessage(
            int statusCode,
            String responseBody
    ) {

        if (statusCode == 401 || statusCode == 403) {
            return "Email service authentication failed. Check BREVO_API_KEY.";
        }

        if (statusCode == 400) {
            return "Brevo rejected the email request. Check BREVO_SENDER_EMAIL and recipient email.";
        }

        if (statusCode == 402) {
            return "Brevo account does not have permission or credits to send this email.";
        }

        if (statusCode == 429) {
            return "Brevo email rate limit exceeded. Please try again later.";
        }

        if (statusCode >= 500) {
            return "Brevo email service is temporarily unavailable.";
        }

        return "Brevo email request failed with status " + statusCode;
    }

    /**
     * Registration OTP HTML.
     */
    private String buildOtpHtmlContent(String otp) {
        return String.format("""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                    }

                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }

                    .header {
                        background-color: #4CAF50;
                        color: white;
                        padding: 20px;
                        text-align: center;
                        border-radius: 5px;
                    }

                    .otp-code {
                        font-size: 36px;
                        font-weight: bold;
                        color: #4CAF50;
                        text-align: center;
                        padding: 20px;
                        letter-spacing: 5px;
                        background-color: #f4f4f4;
                        border-radius: 5px;
                        margin: 20px 0;
                        font-family: monospace;
                    }

                    .footer {
                        text-align: center;
                        margin-top: 20px;
                        font-size: 12px;
                        color: #666;
                    }
                </style>
            </head>

            <body>
                <div class="container">

                    <div class="header">
                        <h2>Twinkle AI Verification</h2>
                    </div>

                    <p>Hello,</p>

                    <p>Your OTP verification code is:</p>

                    <div class="otp-code">%s</div>

                    <p>
                        This code will expire in
                        <strong>%d minutes</strong>.
                    </p>

                    <p>
                        If you didn't request this code,
                        please ignore this email.
                    </p>

                    <div class="footer">
                        <p>
                            This is an automated message,
                            please do not reply.
                        </p>

                        <p>
                            &copy; 2026 Twinkle AI.
                            All rights reserved.
                        </p>
                    </div>

                </div>
            </body>
            </html>
            """, otp, otpExpirationMinutes);
    }

    /**
     * Password reset HTML.
     */
    private String buildPasswordResetHtmlContent(String otp) {
        return String.format("""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                    }

                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }

                    .header {
                        background-color: #ff6b6b;
                        color: white;
                        padding: 20px;
                        text-align: center;
                        border-radius: 5px;
                    }

                    .otp-code {
                        font-size: 36px;
                        font-weight: bold;
                        color: #ff6b6b;
                        text-align: center;
                        padding: 20px;
                        letter-spacing: 5px;
                        background-color: #f4f4f4;
                        border-radius: 5px;
                        margin: 20px 0;
                        font-family: monospace;
                    }

                    .warning {
                        color: #ff6b6b;
                        font-size: 12px;
                    }

                    .footer {
                        text-align: center;
                        margin-top: 20px;
                        font-size: 12px;
                        color: #666;
                    }
                </style>
            </head>

            <body>
                <div class="container">

                    <div class="header">
                        <h2>Password Reset Request</h2>
                    </div>

                    <p>Hello,</p>

                    <p>
                        We received a request to reset your password.
                        Your OTP verification code is:
                    </p>

                    <div class="otp-code">%s</div>

                    <p>
                        This code will expire in
                        <strong>%d minutes</strong>.
                    </p>

                    <p class="warning">
                        If you didn't request this password reset,
                        please ignore this email.
                    </p>

                    <div class="footer">
                        <p>
                            This is an automated message,
                            please do not reply.
                        </p>

                        <p>
                            &copy; 2026 Twinkle AI.
                            All rights reserved.
                        </p>
                    </div>

                </div>
            </body>
            </html>
            """, otp, otpExpirationMinutes);
    }

    /**
     * Welcome email HTML.
     */
    private String buildWelcomeHtmlContent(String userName) {
        return String.format("""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                    }

                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }

                    .header {
                        background-color: #4CAF50;
                        color: white;
                        padding: 20px;
                        text-align: center;
                        border-radius: 5px;
                    }

                    .content {
                        padding: 20px;
                    }

                    .footer {
                        text-align: center;
                        margin-top: 20px;
                        font-size: 12px;
                        color: #666;
                    }
                </style>
            </head>

            <body>
                <div class="container">

                    <div class="header">
                        <h2>Welcome to Twinkle AI!</h2>
                    </div>

                    <div class="content">
                        <p>Dear %s,</p>

                        <p>
                            Thank you for registering with Twinkle AI!
                            We're excited to have you on board.
                        </p>

                        <p>
                            You can now start using our
                            AI-powered chatbot.
                        </p>
                    </div>

                    <div class="footer">
                        <p>
                            Best regards,<br>
                            The Twinkle AI Team
                        </p>

                        <p>
                            &copy; 2026 Twinkle AI ChatBot.
                            All rights reserved.
                        </p>
                    </div>

                </div>
            </body>
            </html>
            """, userName);
    }

    /**
     * Email delivery exception.
     */
    public static class EmailDeliveryException
            extends RuntimeException {

        public EmailDeliveryException(String message) {
            super(message);
        }

        public EmailDeliveryException(
                String message,
                Throwable cause
        ) {
            super(message, cause);
        }
    }
}
