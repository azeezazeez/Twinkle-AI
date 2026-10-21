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

    @Value("${brevo.sender.name:Twinkle}")
    private String senderName;

    @Value("${otp.expiration.minutes:10}")
    private int otpExpirationMinutes;

    @Value("${frontend.url:https://twinkleai.vercel.app}")
    private String frontendUrl;

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
                "Welcome to Twinkle",
                buildWelcomeHtmlContent(userName)
        );
    }

    /**
     * Tell someone a chat was shared with them ("Only people invited").
     */
    public void sendChatInviteEmail(
            String toEmail,
            String inviterName,
            String chatName,
            String chatUrl
    ) {
        String who = (inviterName == null || inviterName.isBlank()) ? "Someone" : escapeHtml(inviterName.trim());
        String title = (chatName == null || chatName.isBlank()) ? "a chat" : "&ldquo;" + escapeHtml(chatName.trim()) + "&rdquo;";

        String body =
                paragraph(who + " shared " + title + " with you on Twinkle.")
                + paragraph("Sign in with this email address to read the conversation.")
                + button("Open chat", chatUrl)
                + note("You&rsquo;re receiving this because someone invited this email address. If you don&rsquo;t know them, you can ignore this message.");

        sendEmail(
                toEmail,
                "A chat was shared with you on Twinkle",
                buildLayout(
                        "A chat was shared with you",
                        "Shared chat",
                        body,
                        who + " shared a chat with you on Twinkle."
                )
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
            senderName = "Twinkle";
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
        String body =
                paragraph("Enter this code on the verification screen to finish creating your Twinkle account.")
                + codeBlock(otp)
                + paragraph("The code expires in <strong class=\"tw-strong\" style=\"color:#1F1E1D;\">"
                + otpExpirationMinutes + " minutes</strong> and can only be used once.")
                + note("Didn&rsquo;t request this? You can safely ignore this email &mdash; no account will be created.");

        return buildLayout(
                "Your verification code",
                "Confirm your email address",
                body,
                "Your Twinkle verification code is " + otp
        );
    }

    /**
     * Password reset HTML.
     */
    private String buildPasswordResetHtmlContent(String otp) {
        String body =
                paragraph("Use this code to choose a new password for your Twinkle account.")
                + codeBlock(otp)
                + paragraph("The code expires in <strong class=\"tw-strong\" style=\"color:#1F1E1D;\">"
                + otpExpirationMinutes + " minutes</strong> and can only be used once.")
                + note("Didn&rsquo;t ask to reset your password? Ignore this email and your password will stay exactly as it is.");

        return buildLayout(
                "Reset your password",
                "Password reset request",
                body,
                "Your Twinkle password reset code is " + otp
        );
    }

    /**
     * Welcome email HTML.
     */
    private String buildWelcomeHtmlContent(String userName) {
        String name = (userName == null || userName.isBlank()) ? "there" : escapeHtml(userName.trim());

        String body =
                paragraph("Hi " + name + ", your account is ready. Bring Twinkle anything &mdash; a tricky problem, "
                + "a rough idea, or something you need to write.")
                + paragraph("You can type, talk with Live Talk, or attach files and ask about them.")
                + button("Start chatting", frontendUrl)
                + note("You&rsquo;re receiving this because an account was created with this email address.");

        return buildLayout(
                "Welcome to Twinkle",
                "Your account is ready",
                body,
                "Welcome to Twinkle. Your account is ready."
        );
    }

    /* ------------------------------------------------------------------
     * Shared email layout (editorial style).
     *
     * No card and no centred hero: a small wordmark, a left-aligned serif
     * heading, plain readable copy, and a soft code panel &mdash; the same
     * warm palette as the app. Built with tables and inline styles so it
     * renders in Gmail, Outlook and Apple Mail, and it switches to dark
     * colours automatically where the client supports dark mode.
     * ------------------------------------------------------------------ */

    private static final String SERIF =
            "'Source Serif 4', 'Iowan Old Style', Georgia, Cambria, 'Times New Roman', serif";
    private static final String SANS =
            "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

    private String buildLayout(String title, String eyebrow, String bodyHtml, String preheader) {
        String html = """
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <meta name="color-scheme" content="light dark">
              <meta name="supported-color-schemes" content="light dark">
              <title>{{TITLE}}</title>
              <style>
                @media (max-width: 480px) {
                  .tw-wrap { padding: 28px 22px 36px 22px !important; }
                  .tw-title { font-size: 28px !important; }
                  .tw-code { font-size: 30px !important; letter-spacing: 0.22em !important; }
                }
                @media (prefers-color-scheme: dark) {
                  .tw-page, .tw-wrap { background-color: #1F1E1D !important; }
                  .tw-brand, .tw-title, .tw-strong, .tw-code { color: #F5F4EE !important; }
                  .tw-text { color: #D6D2C4 !important; }
                  .tw-muted, .tw-eyebrow { color: #A8A396 !important; }
                  .tw-code-box { background-color: #30302E !important; border-color: #3D3D3A !important; }
                  .tw-rule { border-top-color: #3D3D3A !important; }
                  .tw-btn { background-color: #F5F4EE !important; }
                  .tw-btn a { color: #1F1E1D !important; }
                }
              </style>
            </head>
            <body style="margin:0;padding:0;background-color:#FFFFFF;">
              <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{{PREHEADER}}</div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     class="tw-page" style="background-color:#FFFFFF;">
                <tr>
                  <td align="center">

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                           style="max-width:560px;">
                      <tr>
                        <td class="tw-wrap" align="left" style="padding:44px 32px 48px 32px;background-color:#FFFFFF;">

                          <!-- Wordmark -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding-right:9px;line-height:0;">
                                <img src="{{LOGO}}" width="28" height="28" alt=""
                                     style="display:block;width:28px;height:28px;border:0;outline:none;text-decoration:none;">
                              </td>
                              <td class="tw-brand"
                                  style="font-family:{{SERIF}};font-size:21px;line-height:1;letter-spacing:-0.01em;color:#1F1E1D;">Twinkle</td>
                            </tr>
                          </table>

                          <!-- Heading -->
                          <p class="tw-eyebrow"
                             style="margin:44px 0 10px 0;font-family:{{SANS}};font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#C6613F;">{{EYEBROW}}</p>
                          <h1 class="tw-title"
                              style="margin:0 0 8px 0;font-family:{{SERIF}};font-size:34px;font-weight:500;line-height:1.15;letter-spacing:-0.02em;color:#1F1E1D;">{{TITLE}}</h1>

                          {{BODY}}

                          <!-- Footer -->
                          <hr class="tw-rule" style="margin:36px 0 18px 0;border:0;border-top:1px solid #E6E3D8;">
                          <p class="tw-muted"
                             style="margin:0;font-family:{{SANS}};font-size:12px;line-height:1.6;color:#8A867B;">
                            Twinkle &middot; This is an automated message, please don&rsquo;t reply.<br>
                            &copy; 2026 Twinkle. All rights reserved.
                          </p>

                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </body>
            </html>
            """;

        return html
                .replace("{{LOGO}}", escapeHtml(logoUrl()))
                .replace("{{SERIF}}", SERIF)
                .replace("{{SANS}}", SANS)
                .replace("{{TITLE}}", escapeHtml(title))
                .replace("{{EYEBROW}}", escapeHtml(eyebrow))
                .replace("{{PREHEADER}}", escapeHtml(preheader))
                .replace("{{BODY}}", bodyHtml);
    }

    /**
     * Public URL of the Twinkle star logo (frontend/public/twinkle-logo.png).
     * Email clients such as Gmail strip inline SVG, so the same logo is served
     * as a PNG from the frontend and referenced by absolute URL.
     */
    private String logoUrl() {
        String base = (frontendUrl == null || frontendUrl.isBlank())
                ? "https://twinkleai.vercel.app"
                : frontendUrl.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + "/twinkle-logo.png";
    }

    /** Verification code in a soft panel, left aligned with the copy. */
    private String codeBlock(String otp) {
        return """
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0 0;">
              <tr>
                <td class="tw-code-box"
                    style="background-color:#F5F4EE;border:1px solid #E6E3D8;border-radius:12px;padding:16px 26px;">
                  <span class="tw-code"
                        style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:36px;font-weight:600;letter-spacing:0.3em;color:#1F1E1D;">{{OTP}}</span>
                </td>
              </tr>
            </table>
            """.replace("{{OTP}}", escapeHtml(otp));
    }

    /** Bulletproof dark button (works in Outlook too). */
    private String button(String label, String url) {
        return """
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0 0;">
              <tr>
                <td class="tw-btn" align="center" bgcolor="#1F1E1D" style="background-color:#1F1E1D;border-radius:10px;">
                  <a href="{{URL}}" target="_blank"
                     style="display:inline-block;padding:13px 26px;font-family:{{SANS}};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">{{LABEL}}</a>
                </td>
              </tr>
            </table>
            """.replace("{{URL}}", escapeHtml(url))
               .replace("{{LABEL}}", escapeHtml(label))
               .replace("{{SANS}}", SANS);
    }

    private String paragraph(String html) {
        return "<p class=\"tw-text\" style=\"margin:16px 0 0 0;font-family:" + SANS
                + ";font-size:16px;line-height:1.65;color:#4A4945;\">" + html + "</p>";
    }

    private String note(String html) {
        return "<p class=\"tw-muted\" style=\"margin:22px 0 0 0;font-family:" + SANS
                + ";font-size:13px;line-height:1.6;color:#6B6860;\">" + html + "</p>";
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
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
