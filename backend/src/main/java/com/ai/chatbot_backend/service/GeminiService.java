package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.exception.AIServiceException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class GeminiService {

    private static final int MAX_RETRIES = 2;
    private static final long DEFAULT_RETRY_DELAY_MS = 1000L;
    private static final long MAX_RETRY_DELAY_MS = 30000L;

    @Value("${gemini.api.key}")
    private String apiKey;

    @Value("${gemini.api.url:https://generativelanguage.googleapis.com/v1beta}")
    private String apiUrl;

    @Value("${gemini.model:gemini-3.8-flash}")
    private String model;

    @Value("${gemini.max-output-tokens:16384}")
    private int maxOutputTokens;

    @Value("${gemini.thinking-level:medium}")
    private String thinkingLevel;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public GeminiService(RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    public String getModel() {
        return model;
    }

    public boolean isGeminiModel(String requestedModel) {
        return requestedModel != null
                && !requestedModel.isBlank()
                && model.equals(requestedModel.trim());
    }

    public String generateResponse(
            String userMessage,
            List<Map<String, String>> conversationHistory,
            List<String> attachmentDataUrls) {

        List<Map<String, Object>> contents = new ArrayList<>();

        if (conversationHistory != null) {
            for (Map<String, String> historyItem : conversationHistory) {
                if (historyItem == null) {
                    continue;
                }

                String role = normalizeRole(historyItem.get("role"));
                String content = historyItem.get("content");

                if (content == null || content.isBlank()) {
                    continue;
                }

                contents.add(Map.of(
                        "role", role,
                        "parts", List.of(Map.of("text", content))
                ));
            }
        }

        List<Map<String, Object>> parts = new ArrayList<>();
        String text = userMessage == null ? "" : userMessage.trim();

        if (!text.isBlank()) {
            parts.add(Map.of("text", text));
        }

        if (attachmentDataUrls != null) {
            for (String dataUrl : attachmentDataUrls) {
                if (dataUrl == null || dataUrl.isBlank()) {
                    continue;
                }

                ParsedDataUrl parsed = parseDataUrl(dataUrl);
                if (parsed == null) {
                    continue;
                }

                if (isTextMimeType(parsed.mimeType)) {
                    String decodedText = decodeText(parsed.base64Data);
                    if (!decodedText.isBlank()) {
                        parts.add(Map.of(
                                "text",
                                "Attached file: " + parsed.filename + "\n\n" + decodedText
                        ));
                    }
                    continue;
                }

                if (!isGeminiInlineMimeType(parsed.mimeType)) {
                    // Unsupported Office/archive formats are handled by Apache Tika
                    // in ChatController and their extracted text is included in the prompt.
                    continue;
                }

                Map<String, Object> inlineData = new LinkedHashMap<>();
                inlineData.put("mime_type", parsed.mimeType);
                inlineData.put("data", parsed.base64Data);

                parts.add(Map.of("inline_data", inlineData));
            }
        }

        if (parts.isEmpty()) {
            parts.add(Map.of("text", "Please answer the user's request."));
        }

        contents.add(Map.of(
                "role", "user",
                "parts", parts
        ));

        Map<String, Object> systemInstruction = Map.of(
                "parts", List.of(Map.of("text", systemPrompt()))
        );

        Map<String, Object> generationConfig = new LinkedHashMap<>();
        generationConfig.put("maxOutputTokens", Math.max(1024, Math.min(maxOutputTokens, 65536)));

        Map<String, Object> thinkingConfig = new LinkedHashMap<>();
        thinkingConfig.put("thinkingLevel", normalizeThinkingLevel());
        generationConfig.put("thinkingConfig", thinkingConfig);

        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("system_instruction", systemInstruction);
        requestBody.put("contents", contents);
        requestBody.put("generationConfig", generationConfig);

        return callGemini(requestBody);
    }

    private String callGemini(Map<String, Object> requestBody) {
        int attempt = 0;

        while (true) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.set("x-goog-api-key", apiKey);

                HttpEntity<Map<String, Object>> entity =
                        new HttpEntity<>(requestBody, headers);

                String endpoint = apiUrl.replaceAll("/+$", "")
                        + "/models/" + model + ":generateContent";

                ResponseEntity<Map> response = restTemplate.postForEntity(
                        endpoint,
                        entity,
                        Map.class
                );

                String text = extractResponseText(response.getBody());
                if (!text.isBlank()) {
                    return text;
                }

                throw new AIServiceException("Gemini returned an empty response.");

            } catch (HttpClientErrorException e) {
                if (e.getStatusCode().value() == 429 && attempt < MAX_RETRIES) {
                    long delay = retryDelayMillis(e, attempt);
                    log.warn("Gemini rate limited. Retrying in {} ms. attempt={}/{}",
                            delay, attempt + 1, MAX_RETRIES);
                    sleep(delay);
                    attempt++;
                    continue;
                }

                String message = extractApiError(e.getResponseBodyAsString());
                log.error("Gemini client error. status={}, message={}",
                        e.getStatusCode().value(), message);
                throw new AIServiceException(
                        "Gemini API error " + e.getStatusCode().value() + ": " + message,
                        e
                );

            } catch (HttpServerErrorException e) {
                if (attempt < MAX_RETRIES) {
                    long delay = retryDelayMillis(e, attempt);
                    log.warn("Gemini server error. Retrying in {} ms. status={}, attempt={}/{}",
                            delay, e.getStatusCode().value(), attempt + 1, MAX_RETRIES);
                    sleep(delay);
                    attempt++;
                    continue;
                }

                String message = extractApiError(e.getResponseBodyAsString());
                throw new AIServiceException(
                        "Gemini API error " + e.getStatusCode().value() + ": " + message,
                        e
                );

            } catch (ResourceAccessException e) {
                if (attempt < MAX_RETRIES) {
                    long delay = retryDelayMillis(null, attempt);
                    log.warn("Unable to reach Gemini. Retrying in {} ms. attempt={}/{}",
                            delay, attempt + 1, MAX_RETRIES);
                    sleep(delay);
                    attempt++;
                    continue;
                }

                throw new AIServiceException(
                        "Unable to connect to Gemini AI service.",
                        e
                );

            } catch (AIServiceException e) {
                throw e;

            } catch (Exception e) {
                log.error("Unexpected Gemini error: {}", e.getMessage(), e);
                throw new AIServiceException(
                        "Unexpected error while communicating with Gemini AI service.",
                        e
                );
            }
        }
    }

    private String extractApiError(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return "Unknown Gemini API error.";
        }

        try {
            Map<?, ?> root = objectMapper.readValue(
                    responseBody,
                    new TypeReference<Map<String, Object>>() {}
            );

            Object errorObject = root.get("error");
            if (errorObject instanceof Map<?, ?> error) {
                Object message = error.get("message");
                if (message != null && !message.toString().isBlank()) {
                    return message.toString();
                }
            }

            Object message = root.get("message");
            if (message != null && !message.toString().isBlank()) {
                return message.toString();
            }
        } catch (Exception ignored) {
            // Fall through and return the raw response below.
        }

        String compact = responseBody.trim().replaceAll("\\s+", " ");
        return compact.length() > 1000
                ? compact.substring(0, 1000) + "..."
                : compact;
    }

    private String extractResponseText(Map body) {
        if (body == null) {
            return "";
        }

        Object candidatesObject = body.get("candidates");
        if (!(candidatesObject instanceof List<?> candidates) || candidates.isEmpty()) {
            Object promptFeedback = body.get("promptFeedback");
            if (promptFeedback != null) {
                return "Gemini could not generate a response: " + promptFeedback;
            }
            return "";
        }

        Object firstCandidate = candidates.get(0);
        if (!(firstCandidate instanceof Map<?, ?> candidate)) {
            return "";
        }

        Object contentObject = candidate.get("content");
        if (!(contentObject instanceof Map<?, ?> content)) {
            return "";
        }

        Object partsObject = content.get("parts");
        if (!(partsObject instanceof List<?> parts)) {
            return "";
        }

        StringBuilder result = new StringBuilder();
        for (Object partObject : parts) {
            if (!(partObject instanceof Map<?, ?> part)) {
                continue;
            }

            Object text = part.get("text");
            if (text != null && !text.toString().isBlank()) {
                if (result.length() > 0) {
                    result.append("\n");
                }
                result.append(text);
            }
        }

        return result.toString().trim();
    }

    private String systemPrompt() {
        return "You are Twinkle AI, a professional, intelligent, and helpful general-purpose AI assistant. "
                + "Understand the user's actual intent and answer using your model intelligence. "
                + "Respond in the language the user uses or explicitly requests, while preserving technical terms, code, identifiers, and proper names when appropriate. "
                + "Use conversation history and attached files as context when relevant. "
                + "Answer simply for simple requests and provide appropriate depth for complex requests. "
                + "Be accurate, practical, clear, and natural. Do not invent facts. "
                + "For document uploads without a specific question or instruction, return the complete actual document content in clean Markdown. "
                + "Preserve source sections, headings, bullets, numbering, names, dates, technologies, links, contact details, and factual information. "
                + "Do not summarize, shorten, or omit source content in that mode. "
                + "Do not add unnecessary introductions, conclusions, analysis, or generic sections. "
                + "For normal questions about uploaded files, answer the question directly using the file as context. "
                + "For code, writing, calculations, explanations, and other tasks, adapt naturally to the user's request.";
    }

    private String normalizeRole(String role) {
        return "assistant".equalsIgnoreCase(role) || "model".equalsIgnoreCase(role)
                ? "model"
                : "user";
    }

    private boolean isTextMimeType(String mime) {
        return mime.startsWith("text/")
                || "application/json".equals(mime)
                || "application/xml".equals(mime);
    }

    private boolean isGeminiInlineMimeType(String mime) {
        if (mime == null || mime.isBlank()) {
            return false;
        }

        if (mime.startsWith("image/")
                || mime.startsWith("audio/")
                || mime.startsWith("video/")) {
            return true;
        }

        return "application/pdf".equals(mime);
    }

    private ParsedDataUrl parseDataUrl(String dataUrl) {
        try {
            int comma = dataUrl.indexOf(',');
            if (comma <= 0 || comma == dataUrl.length() - 1) {
                return null;
            }

            String metadata = dataUrl.substring(5, comma);
            String base64 = dataUrl.substring(comma + 1);

            if (!metadata.toLowerCase().contains(";base64")) {
                return null;
            }

            String mime = metadata.split(";", 2)[0].trim().toLowerCase();
            String filename = "uploaded-file";

            for (String segment : metadata.split(";")) {
                if (segment.startsWith("name=")) {
                    filename = URLDecoder.decode(
                            segment.substring("name=".length()),
                            StandardCharsets.UTF_8
                    );
                    break;
                }
            }

            return new ParsedDataUrl(mime, filename, base64);
        } catch (Exception e) {
            log.warn("Could not parse attachment data URL: {}", e.getMessage());
            return null;
        }
    }

    private String decodeText(String base64) {
        try {
            return new String(
                    Base64.getDecoder().decode(base64),
                    StandardCharsets.UTF_8
            );
        } catch (Exception e) {
            return "";
        }
    }

    private String normalizeThinkingLevel() {
        String value = thinkingLevel == null
                ? "medium"
                : thinkingLevel.trim().toLowerCase();

        return switch (value) {
            case "low", "medium", "high" -> value;
            default -> "medium";
        };
    }

    private long retryDelayMillis(Exception exception, int attempt) {
        if (exception instanceof HttpClientErrorException httpException) {
            String retryAfter = httpException.getResponseHeaders() == null
                    ? null
                    : httpException.getResponseHeaders().getFirst("Retry-After");
            Long parsed = parseRetryAfter(retryAfter);
            if (parsed != null) {
                return Math.min(parsed, MAX_RETRY_DELAY_MS);
            }
        }

        long exponential = DEFAULT_RETRY_DELAY_MS * (1L << Math.min(attempt, 4));
        return Math.min(exponential, MAX_RETRY_DELAY_MS);
    }

    private Long parseRetryAfter(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            return Long.parseLong(value.trim()) * 1000L;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private void sleep(long milliseconds) {
        try {
            Thread.sleep(Math.max(0L, milliseconds));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AIServiceException("Gemini retry was interrupted.", e);
        }
    }

    private record ParsedDataUrl(String mimeType, String filename, String base64Data) {}
}
