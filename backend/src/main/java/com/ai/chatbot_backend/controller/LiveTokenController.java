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
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/live")
@RequiredArgsConstructor
public class LiveTokenController {

    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
    private static final String GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
    private static final List<String> API_VERSIONS = List.of("v1beta", "v1alpha");
    private static final int TOKEN_USES = 10;


    @Value("${gemini.api.key}")
    private String geminiApiKey;

    @Value("${gemini.live.model:gemini-3.8-live}")
    private String liveModel;

    private final ObjectMapper objectMapper;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(Duration.ofSeconds(8))
            .readTimeout(Duration.ofSeconds(12))
            .writeTimeout(Duration.ofSeconds(8))
            .build();

    /**
     * Creates a short-lived Gemini Live ephemeral token.
     *
     * Google's current documentation provisions ephemeral tokens on the
     * v1beta API, while older deployments only accepted v1alpha. A token is
     * only valid on the API version that issued it, so this endpoint tries
     * v1beta first, falls back to v1alpha, and reports the version it used.
     * The browser must open its Live WebSocket on that same version.
     * A client can force one version by sending {"apiVersion": "v1alpha"}.
     *
     * The request is deliberately minimal (lifetime and usage limits only);
     * the browser sends model, voice and audio setup in its setup frame.
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

        String requested = requestedApiVersion(requestBody);
        List<String> versions = requested != null ? List.of(requested) : API_VERSIONS;

        String lastError = "Gemini token provisioning failed.";
        for (String version : versions) {
            try {
                return ResponseEntity.ok(mintToken(version));
            } catch (TokenProvisioningException exception) {
                lastError = exception.getMessage();
            } catch (Exception exception) {
                String detail = exception.getMessage();
                lastError = detail == null || detail.isBlank()
                        ? "Unable to create Live Talk session."
                        : "Unable to create Live Talk session: " + detail;
            }
        }

        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", lastError));
    }

    private Map<String, Object> mintToken(String apiVersion) throws Exception {
        Instant now = Instant.now();
        String expireTime = now.plus(Duration.ofMinutes(30)).truncatedTo(ChronoUnit.SECONDS).toString();
        String newSessionExpireTime = now.plus(Duration.ofMinutes(1)).truncatedTo(ChronoUnit.SECONDS).toString();

        Map<String, Object> requestJson = new LinkedHashMap<>();
        requestJson.put("uses", TOKEN_USES);
        requestJson.put("expireTime", expireTime);
        requestJson.put("newSessionExpireTime", newSessionExpireTime);

        String body = objectMapper.writeValueAsString(requestJson);

        Request request = new Request.Builder()
                .url(GEMINI_BASE_URL + "/" + apiVersion + "/auth_tokens")
                .addHeader("x-goog-api-key", geminiApiKey)
                .addHeader("Content-Type", "application/json")
                .post(okhttp3.RequestBody.create(body, JSON))
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            String responseBody = response.body() == null ? "" : response.body().string();

            if (!response.isSuccessful()) {
                String message = "Gemini token provisioning failed (" + apiVersion + ", HTTP " + response.code() + ").";
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
                throw new TokenProvisioningException(message);
            }

            JsonNode tokenResponse = objectMapper.readTree(responseBody);
            String token = tokenResponse.path("name").asText("");
            if (token.isBlank()) {
                throw new TokenProvisioningException("Gemini returned an empty Live Talk token.");
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("token", token);
            result.put("model", liveModel);
            result.put("apiVersion", apiVersion);
            result.put("expiresAt", expireTime);
            result.put("newSessionExpiresAt", newSessionExpireTime);
            result.put("uses", TOKEN_USES);
            return result;
        }
    }

    private static String requestedApiVersion(Map<String, Object> requestBody) {
        if (requestBody == null) return null;
        Object value = requestBody.get("apiVersion");
        if (value == null) return null;
        String version = String.valueOf(value).trim().toLowerCase();
        return API_VERSIONS.contains(version) ? version : null;
    }

    private static final class TokenProvisioningException extends Exception {
        TokenProvisioningException(String message) {
            super(message);
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
