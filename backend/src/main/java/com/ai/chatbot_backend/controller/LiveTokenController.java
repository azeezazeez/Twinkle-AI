package com.ai.chatbot_backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/live")
@RequiredArgsConstructor
public class LiveTokenController {

    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
    private static final String LIVE_MODEL = "gemini-3.8-live";


    @Value("${gemini.api.key}")
    private String geminiApiKey;

    private final ObjectMapper objectMapper;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(Duration.ofSeconds(8))
            .readTimeout(Duration.ofSeconds(12))
            .writeTimeout(Duration.ofSeconds(8))
            .build();

    /**
     * Creates a short-lived Gemini Live token.
     *
     * Important: keep this request compatible with the auth_tokens schema
     * accepted by the deployed Gemini endpoint. The current backend was
     * sending unsupported fields such as liveConnectConstraints and
     * lockAdditionalFields, which caused the 502 error.
     *
     * The Live WebSocket client sends the model, voice and audio setup in
     * its initial setup frame, so the token only carries its lifetime and
     * usage limits.
     */
    @PostMapping("/token")
    public ResponseEntity<?> createToken(
            HttpSession session,
            @RequestBody(required = false) Map<String, Object> requestBody) {

        if (session.getAttribute("userId") == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Please sign in before starting Live Talk."));
        }

        if (geminiApiKey == null || geminiApiKey.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "GEMINI_API_KEY is not configured on the backend."));
        }

        try {
            /*
             * IMPORTANT:
             *
             * Keep the auth_tokens request deliberately minimal.
             * The deployed Gemini auth_tokens endpoint is rejecting
             * liveConnectConstraints / lockAdditionalFields with:
             *   Unknown name "liveConnectConstraints" at 'auth_token'
             *   Unknown name "lockAdditionalFields" at 'auth_token'
             *
             * The Live WebSocket client already sends the model, voice,
             * response modality and system instruction in its setup frame.
             * Therefore the ephemeral token only needs its lifetime/usage
             * limits here.
             */
            Instant now = Instant.now();
            String expireTime = now.plus(Duration.ofMinutes(30)).toString();
            String newSessionExpireTime = now.plus(Duration.ofMinutes(1)).toString();

            Map<String, Object> requestJson = new LinkedHashMap<>();
            requestJson.put("uses", 10);
            requestJson.put("expireTime", expireTime);
            requestJson.put("newSessionExpireTime", newSessionExpireTime);

            String body = objectMapper.writeValueAsString(requestJson);

            Request request = new Request.Builder()
                    .url("https://generativelanguage.googleapis.com/v1beta/auth_tokens")
                    .addHeader("x-goog-api-key", geminiApiKey)
                    .addHeader("Content-Type", "application/json")
                    .post(okhttp3.RequestBody.create(body, JSON))
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                String responseBody = response.body() == null ? "" : response.body().string();

                if (!response.isSuccessful()) {
                    String message = "Gemini token provisioning failed.";
                    if (!responseBody.isBlank()) {
                        try {
                            JsonNode error = objectMapper.readTree(responseBody);
                            if (error.path("error").path("message").isTextual()) {
                                message = error.path("error").path("message").asText();
                            }
                        } catch (Exception ignored) {
                            // Keep the safe generic message.
                        }
                    }
                    return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                            .body(Map.of("error", message));
                }

                JsonNode tokenResponse = objectMapper.readTree(responseBody);
                String token = tokenResponse.path("name").asText("");
                if (token.isBlank()) {
                    return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                            .body(Map.of("error", "Gemini returned an empty Live Talk token."));
                }

                return ResponseEntity.ok(Map.of(
                        "token", token,
                        "model", LIVE_MODEL,
                        "expiresAt", expireTime,
                        "newSessionExpiresAt", newSessionExpireTime,
                        "uses", 10
                ));
            }
        } catch (Exception exception) {
            String detail = exception.getMessage();
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of(
                            "error",
                            detail == null || detail.isBlank()
                                    ? "Unable to create Live Talk session."
                                    : "Unable to create Live Talk session: " + detail
                    ));
        }
    }

    private static String languageName(String code) {
        if (code == null || code.isBlank() || "auto".equalsIgnoreCase(code)) return null;
        return switch (code.toLowerCase()) {
            case "en" -> "English";
            case "hi" -> "Hindi";
            case "te" -> "Telugu";
            case "ta" -> "Tamil";
            case "kn" -> "Kannada";
            case "ml" -> "Malayalam";
            case "bn" -> "Bengali";
            case "mr" -> "Marathi";
            case "gu" -> "Gujarati";
            case "pa" -> "Punjabi";
            case "ur" -> "Urdu";
            case "ar" -> "Arabic";
            case "es" -> "Spanish";
            case "fr" -> "French";
            case "de" -> "German";
            case "it" -> "Italian";
            case "pt" -> "Portuguese";
            case "ru" -> "Russian";
            case "ja" -> "Japanese";
            case "ko" -> "Korean";
            case "zh" -> "Chinese";
            case "tr" -> "Turkish";
            case "vi" -> "Vietnamese";
            case "id" -> "Indonesian";
            case "th" -> "Thai";
            case "fil" -> "Filipino";
            default -> null;
        };
    }
}
