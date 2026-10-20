package com.ai.chatbot_backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/live")
@RequiredArgsConstructor
public class LiveTokenController {

    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
    private static final String GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

    
    private static final String API_VERSION = "v1beta";

    private static final int TOKEN_USES = 10;
    private static final Duration TOKEN_LIFETIME = Duration.ofMinutes(30);
  
    private static final Duration NEW_SESSION_WINDOW = Duration.ofMinutes(3);
    private static final int MINT_ATTEMPTS = 2;

    private static final String MSG_QUOTA =
            "Live Talk has reached its usage limit. Please try again later.";
    private static final String MSG_CONFIG =
            "Live Talk is not available right now because of a service configuration problem. "
                    + "Please try again later.";
    private static final String MSG_BUSY =
            "The voice service is busy or temporarily unavailable. Please try again in a moment.";
    private static final String MSG_UNREACHABLE =
            "Live Talk could not reach the voice service. Please try again in a moment.";

    @Value("${gemini.api.key}")
    private String geminiApiKey;

    @Value("${gemini.live.model:gemini-3.8-live}")
    private String liveModel;

    private final ObjectMapper objectMapper;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(Duration.ofSeconds(5))
            .readTimeout(Duration.ofSeconds(8))
            .writeTimeout(Duration.ofSeconds(5))
            .retryOnConnectionFailure(true)
            .build();

 
    @PostMapping("/token")
    public ResponseEntity<?> createToken(
            HttpSession session,
            @RequestBody(required = false) Map<String, Object> ignoredRequestBody) {

        if (session.getAttribute("userId") == null) {
            return noStore(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Please sign in before starting Live Talk."));
        }

        if (geminiApiKey == null || geminiApiKey.isBlank()) {
            return noStore(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", MSG_CONFIG));
        }

        String lastError = MSG_BUSY;
        HttpStatus failureStatus = HttpStatus.BAD_GATEWAY;
        for (int attempt = 1; attempt <= MINT_ATTEMPTS; attempt++) {
            try {
                return noStore(HttpStatus.OK).body(mintToken());
            } catch (TokenProvisioningException exception) {
                lastError = exception.userMessage;
                failureStatus = exception.httpStatus;
                // Quota / key problems cannot be fixed by retrying.
                if (!exception.retryable) break;
            } catch (IOException exception) {
                log.warn("Live token: could not reach Gemini: {}", exception.getMessage());
                lastError = MSG_UNREACHABLE;
                failureStatus = HttpStatus.BAD_GATEWAY;
            } catch (Exception exception) {
                log.error("Live token: unexpected failure", exception);
                lastError = MSG_BUSY;
                failureStatus = HttpStatus.BAD_GATEWAY;
                break;
            }
        }

        return noStore(failureStatus).body(Map.of("error", lastError));
    }

    private static ResponseEntity.BodyBuilder noStore(HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore());
    }

    private Map<String, Object> mintToken() throws Exception {
        Instant now = Instant.now();
        String expireTime = now.plus(TOKEN_LIFETIME).truncatedTo(ChronoUnit.SECONDS).toString();
        String newSessionExpireTime = now.plus(NEW_SESSION_WINDOW).truncatedTo(ChronoUnit.SECONDS).toString();

        Map<String, Object> requestJson = new LinkedHashMap<>();
        requestJson.put("uses", TOKEN_USES);
        requestJson.put("expireTime", expireTime);
        requestJson.put("newSessionExpireTime", newSessionExpireTime);

        String body = objectMapper.writeValueAsString(requestJson);

        Request request = new Request.Builder()
                .url(GEMINI_BASE_URL + "/" + API_VERSION + "/auth_tokens")
                .addHeader("x-goog-api-key", geminiApiKey)
                .addHeader("Content-Type", "application/json")
                .post(okhttp3.RequestBody.create(body, JSON))
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            String responseBody = response.body() == null ? "" : response.body().string();

            if (!response.isSuccessful()) {
                String rawMessage = "";
                if (!responseBody.isBlank()) {
                    try {
                        JsonNode error = objectMapper.readTree(responseBody);
                        if (error.path("error").path("message").isTextual()) {
                            rawMessage = error.path("error").path("message").asText();
                        }
                    } catch (Exception ignored) {
                        // Keep the generic message.
                    }
                }
                // The technical detail stays in the server log only.
                log.error("Gemini token provisioning failed (HTTP {}): {}", response.code(),
                        rawMessage.isBlank() ? "no message" : rawMessage);
                throw TokenProvisioningException.fromGemini(response.code(), rawMessage);
            }

            JsonNode tokenResponse = objectMapper.readTree(responseBody);
            String token = tokenResponse.path("name").asText("");
            if (token.isBlank()) {
                throw new TokenProvisioningException(MSG_BUSY, HttpStatus.BAD_GATEWAY, true);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("token", token);
            result.put("model", liveModel);
            result.put("apiVersion", API_VERSION);
            result.put("expiresAt", expireTime);
            result.put("newSessionExpiresAt", newSessionExpireTime);
            result.put("expiresInSeconds", TOKEN_LIFETIME.getSeconds());
            result.put("newSessionExpiresInSeconds", NEW_SESSION_WINDOW.getSeconds());
            result.put("uses", TOKEN_USES);
            return result;
        }
    }

    private static final class TokenProvisioningException extends Exception {
        private final String userMessage;
        private final HttpStatus httpStatus;
        private final boolean retryable;

        TokenProvisioningException(String userMessage, HttpStatus httpStatus, boolean retryable) {
            super(userMessage);
            this.userMessage = userMessage;
            this.httpStatus = httpStatus;
            this.retryable = retryable;
        }

        static TokenProvisioningException fromGemini(int code, String rawMessage) {
            String text = rawMessage == null ? "" : rawMessage.toLowerCase();
            boolean quota = code == 429
                    || text.contains("quota")
                    || text.contains("billing")
                    || text.contains("resource_exhausted")
                    || text.contains("exceeded your");
            if (quota) {
                return new TokenProvisioningException(MSG_QUOTA, HttpStatus.TOO_MANY_REQUESTS, false);
            }
            if (code == 400 || code == 401 || code == 403 || code == 404) {
                return new TokenProvisioningException(MSG_CONFIG, HttpStatus.SERVICE_UNAVAILABLE, false);
            }
            return new TokenProvisioningException(MSG_BUSY, HttpStatus.BAD_GATEWAY, code >= 500);
        }
    }
}
