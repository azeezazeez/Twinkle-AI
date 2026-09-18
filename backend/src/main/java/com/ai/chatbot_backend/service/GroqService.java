package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.exception.AIServiceException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service; 
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class GroqService {

    private static final int MAX_RATE_LIMIT_RETRIES = 2;
    private static final long DEFAULT_BACKOFF_MS = 1000L;
    private static final long MAX_BACKOFF_MS = 30000L;

    @Value("${groq.api.key}")
    private String apiKey;

    @Value("${groq.api.url}")
    private String apiUrl;

    @Value("${groq.model}")
    private String defaultModel;

    @Value("${groq.models:${groq.model}}")
    private String configuredModels;

    private final RestTemplate restTemplate;

    public GroqService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public List<String> getAvailableModels() {
        LinkedHashSet<String> models = new LinkedHashSet<>();

        for (String model : configuredModels.split(",")) {
            String value = model.trim();
            if (!value.isEmpty()) {
                models.add(value);
            }
        }

        if (models.isEmpty()) {
            models.add(defaultModel);
        }

        return new ArrayList<>(models);
    }

    public String generateResponse(
            String userMessage,
            List<Map<String, String>> conversationHistory) {
        return generateResponse(userMessage, conversationHistory, null);
    }

    public String generateResponse(
            String userMessage,
            List<Map<String, String>> conversationHistory,
            String requestedModel) {
        return generateResponse(userMessage, conversationHistory, requestedModel, null);
    }

    public String generateResponse(
            String userMessage,
            List<Map<String, String>> conversationHistory,
            String requestedModel,
            String requestedLanguage) {

        String resolvedModel = resolveModel(requestedModel);
        List<Map<String, Object>> messages = buildHistory(conversationHistory, requestedLanguage);

        messages.add(Map.of(
                "role", "user",
                "content", userMessage == null ? "" : userMessage
        ));

        return callGroq(messages, resolvedModel);
    }

    private String resolveModel(String requestedModel) {
        String requested = requestedModel == null ? "" : requestedModel.trim();

        if (requested.isEmpty()) {
            return defaultModel;
        }

        if (!getAvailableModels().contains(requested)) {
            throw new IllegalArgumentException("Unsupported Groq model: " + requested);
        }

        return requested;
    }

    private List<Map<String, Object>> buildHistory(
            List<Map<String, String>> history,
            String requestedLanguage) {

        List<Map<String, Object>> messages = new ArrayList<>();

        String languageInstruction = buildLanguageInstruction(requestedLanguage);

        messages.add(Map.of(
                "role", "system",
                "content",
                "You are Twinkle AI, a professional, intelligent, and helpful general-purpose AI assistant. "
                        + "Understand the user's actual intent and answer using your model intelligence. "
                        + "Do not follow a rigid response template. "
                        + "Preserve technical terms, code, identifiers, and proper names when appropriate. "
                        + "Use conversation history and supplied text as context when relevant. "
                        + "Answer simply for simple requests and provide appropriate depth for complex requests. "
                        + "Be accurate, practical, clear, and natural. Do not invent facts. "
                        + "For normal questions, answer directly and naturally. "
                        + "For code, writing, calculations, explanations, and other tasks, adapt naturally to what the user asks. "
                        + languageInstruction
        ));

        if (history != null) {
            for (Map<String, String> item : history) {
                if (item == null) {
                    continue;
                }

                String role = item.get("role");
                String content = item.get("content");

                if (role == null || content == null || content.isBlank()) {
                    continue;
                }

                String normalizedRole = "assistant".equalsIgnoreCase(role)
                        ? "assistant"
                        : "user".equalsIgnoreCase(role)
                        ? "user"
                        : null;

                if (normalizedRole == null) {
                    continue;
                }

                messages.add(Map.of(
                        "role", normalizedRole,
                        "content", content
                ));
            }
        }

        return messages;
    }

    private String buildLanguageInstruction(String requestedLanguage) {
        String code = requestedLanguage == null ? "" : requestedLanguage.trim().toLowerCase(java.util.Locale.ROOT);
        if (code.isEmpty() || "auto".equals(code)) {
            return "Detect the language of the user's latest message and respond in that same language. "
                    + "If the user changes language, immediately follow the new language. "
                    + "Do not default to English when the user is speaking another language. ";
        }

        String name = switch (code) {
            case "en" -> "English"; case "hi" -> "Hindi"; case "te" -> "Telugu"; case "ta" -> "Tamil";
            case "kn" -> "Kannada"; case "ml" -> "Malayalam"; case "bn" -> "Bengali"; case "mr" -> "Marathi";
            case "gu" -> "Gujarati"; case "pa" -> "Punjabi"; case "ur" -> "Urdu"; case "ar" -> "Arabic";
            case "es" -> "Spanish"; case "fr" -> "French"; case "de" -> "German"; case "it" -> "Italian";
            case "pt" -> "Portuguese"; case "ru" -> "Russian"; case "ja" -> "Japanese"; case "ko" -> "Korean";
            case "zh" -> "Chinese"; case "tr" -> "Turkish"; case "vi" -> "Vietnamese"; case "id" -> "Indonesian";
            case "th" -> "Thai"; case "fil" -> "Filipino"; default -> null;
        };
        if (name == null) {
            return "Detect the language of the user's latest message and respond in that same language. ";
        }
        return "The user selected " + name + ". Respond entirely in " + name + " unless the user explicitly asks for another language. "
                + "Never switch to English merely because technical terms or the interface are in English. ";
    }

    private String callGroq(
            List<Map<String, Object>> messages,
            String model) {

        int rateLimitAttempt = 0;

        while (true) {
            try {
                Map<String, Object> requestBody = new HashMap<>();
                requestBody.put("model", model);
                requestBody.put("messages", messages);
                requestBody.put("temperature", 0.7);
                requestBody.put("max_tokens", 6000);

                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.setBearerAuth(apiKey);

                HttpEntity<Map<String, Object>> entity =
                        new HttpEntity<>(requestBody, headers);

                ResponseEntity<Map> response = restTemplate.postForEntity(
                        apiUrl + "/chat/completions",
                        entity,
                        Map.class
                );

                Map<String, Object> body = response.getBody();

                if (body != null && body.get("choices") instanceof List<?> choices
                        && !choices.isEmpty()
                        && choices.get(0) instanceof Map<?, ?> choice
                        && choice.get("message") instanceof Map<?, ?> message) {

                    Object content = message.get("content");
                    if (content != null && !content.toString().isBlank()) {
                        return content.toString();
                    }
                }

                throw new AIServiceException("Groq returned an invalid or empty response.");

            } catch (HttpClientErrorException e) {
                if (e.getStatusCode().value() == 429
                        && rateLimitAttempt < MAX_RATE_LIMIT_RETRIES) {

                    long delay = resolveRetryDelay(e, rateLimitAttempt);
                    log.warn(
                            "Groq rate limited. Retrying in {} ms. model={}, attempt={}/{}",
                            delay,
                            model,
                            rateLimitAttempt + 1,
                            MAX_RATE_LIMIT_RETRIES
                    );

                    sleep(delay);
                    rateLimitAttempt++;
                    continue;
                }

                String body = e.getResponseBodyAsString();
                log.error(
                        "Groq client error. model={}, status={}, response={}",
                        model,
                        e.getStatusCode().value(),
                        body
                );

                String message = e.getStatusCode().value() == 429
                        ? "The AI service is temporarily rate-limited. Please wait a few seconds and try again."
                        : "Groq API error " + e.getStatusCode().value() + ": " + body;

                throw new AIServiceException(message, e);

            } catch (HttpServerErrorException e) {
                String body = e.getResponseBodyAsString();
                log.error(
                        "Groq server error. model={}, status={}, response={}",
                        model,
                        e.getStatusCode().value(),
                        body
                );

                throw new AIServiceException(
                        "Groq API error " + e.getStatusCode().value() + ": " + body,
                        e
                );

            } catch (ResourceAccessException e) {
                log.error(
                        "Unable to reach Groq. model={}, error={}",
                        model,
                        e.getMessage(),
                        e
                );

                throw new AIServiceException(
                        "Unable to connect to Groq AI service.",
                        e
                );

            } catch (AIServiceException e) {
                throw e;

            } catch (Exception e) {
                log.error(
                        "Unexpected Groq error. model={}, error={}",
                        model,
                        e.getMessage(),
                        e
                );

                throw new AIServiceException(
                        "Unexpected error while communicating with the AI service.",
                        e
                );
            }
        }
    }

    private long resolveRetryDelay(HttpClientErrorException exception, int attempt) {
        String retryAfter = exception.getResponseHeaders() == null
                ? null
                : exception.getResponseHeaders().getFirst("Retry-After");

        if (retryAfter != null && !retryAfter.isBlank()) {
            try {
                return Math.min(
                        Long.parseLong(retryAfter.trim()) * 1000L,
                        MAX_BACKOFF_MS
                );
            } catch (NumberFormatException ignored) {
                // Fall back to exponential backoff.
            }
        }

        long delay = DEFAULT_BACKOFF_MS * (1L << Math.min(attempt, 4));
        return Math.min(delay, MAX_BACKOFF_MS);
    }

    private void sleep(long delay) {
        try {
            Thread.sleep(Math.max(0L, delay));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AIServiceException("Groq retry was interrupted.", e);
        }
    }
}
