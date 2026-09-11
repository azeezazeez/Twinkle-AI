package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.exception.AIServiceException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
@Slf4j
public class GroqService {

    @Value("${groq.api.key}")
    private String apiKey;

    @Value("${groq.api.url}")
    private String apiUrl;

    @Value("${groq.model}")
    private String defaultModel;

    @Value("${groq.models:${groq.model}}")
    private String configuredModels;

    @Value("${groq.vision.models:}")
    private String configuredVisionModels;

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

    private String resolveModel(String requestedModel) {
        String requested = requestedModel == null ? "" : requestedModel.trim();
        if (requested.isEmpty()) {
            return defaultModel;
        }

        if (!getAvailableModels().contains(requested)) {
            throw new IllegalArgumentException("Unsupported AI model: " + requested);
        }
        return requested;
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
        List<Map<String, Object>> messages = buildHistory(conversationHistory);
        messages.add(Map.of(
                "role", "user",
                "content", userMessage));
        return callGroq(messages, resolveModel(requestedModel));
    }

    public String generateResponseWithImages(
            String userMessage,
            List<Map<String, String>> conversationHistory,
            List<String> base64Images,
            List<String> mimeTypes,
            String requestedModel) {
        if (base64Images == null || base64Images.isEmpty()) {
            return generateResponse(userMessage, conversationHistory, requestedModel);
        }

        if (base64Images.size() > 3) {
            throw new IllegalArgumentException(
                    "You can attach a maximum of 3 images per message.");
        }

        String resolvedModel = resolveModel(requestedModel);
        if (!isVisionModel(resolvedModel)) {
            throw new IllegalArgumentException(
                    "The selected AI model does not support image attachments. "
                            + "Configure GROQ_VISION_MODELS with a vision-capable model and select it.");
        }

        if (mimeTypes == null || mimeTypes.size() < base64Images.size()) {
            throw new IllegalArgumentException("Image MIME type information is missing.");
        }

        List<Map<String, Object>> messages = buildHistory(conversationHistory);
        List<Map<String, Object>> contentParts = new ArrayList<>();

        for (int i = 0; i < base64Images.size(); i++) {
            String mime = mimeTypes.get(i);
            if (mime == null || !mime.startsWith("image/")) {
                throw new IllegalArgumentException("Unsupported image MIME type.");
            }

            String dataUrl = "data:" + mime + ";base64," + base64Images.get(i);
            contentParts.add(Map.of(
                    "type", "image_url",
                    "image_url", Map.of("url", dataUrl)));
        }

        String text = (userMessage == null || userMessage.isBlank())
                ? "Please analyse the attached image(s) carefully and answer in English."
                : userMessage;

        contentParts.add(Map.of(
                "type", "text",
                "text", text));

        messages.add(Map.of(
                "role", "user",
                "content", contentParts));

        return callGroq(messages, resolvedModel);
    }

    private boolean isVisionModel(String model) {
        if (configuredVisionModels == null || configuredVisionModels.isBlank()) {
            return false;
        }

        for (String value : configuredVisionModels.split(",")) {
            if (model.equals(value.trim())) {
                return true;
            }
        }
        return false;
    }

    private List<Map<String, Object>> buildHistory(
            List<Map<String, String>> history) {
        List<Map<String, Object>> messages = new ArrayList<>();

        messages.add(Map.of(
                "role", "system",
                "content",
                "You are Twinkle AI, a professional, intelligent, and helpful general-purpose AI assistant. "
                        + "Understand the user's actual intent and answer using your model intelligence. "
                        + "Do not follow a rigid response template and do not use predefined answer text unless the task explicitly requires it. "
                        + "Always respond in English unless the user explicitly asks for another language. "
                        + "Use conversation history, supplied text, documents, and images as context when relevant. "
                        + "Answer simply for simple requests and provide appropriate depth, structure, examples, or step-by-step guidance for complex requests. "
                        + "Be accurate, practical, clear, and natural. Do not invent facts. "
                        + "For document uploads without a specific question or instruction, return the COMPLETE extracted document content in clean Markdown. "
                        + "Preserve all source sections, headings, bullets, numbering, names, dates, technologies, links, contact details, and factual information. "
                        + "Do not summarize, shorten, or omit content in that mode, and do not stop after the title, name, subtitle, or first section. "
                        + "Only improve formatting; do not change the document's information. "
                        + "Do not add unnecessary introductions, conclusions, analysis, commentary, or generic sections. "
                        + "For normal user questions about documents, answer the question directly using the document as context. "
                        + "For code, writing, calculations, explanations, and other tasks, adapt naturally to what the user is asking."));

        if (history != null) {
            for (Map<String, String> h : history) {
                if (h == null) {
                    continue;
                }

                String role = h.get("role");
                String content = h.get("content");

                if (role == null || content == null || content.isBlank()) {
                    continue;
                }

                messages.add(Map.of(
                        "role", role,
                        "content", content));
            }
        }

        return messages;
    }

    private String callGroq(
            List<Map<String, Object>> messages,
            String model) {
        try {
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", model);
            requestBody.put("messages", messages);
            requestBody.put("temperature", 0.7);
            requestBody.put("max_tokens", 6000);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            ResponseEntity<Map> response = restTemplate.postForEntity(
                    apiUrl + "/chat/completions",
                    entity,
                    Map.class);

            Map<String, Object> body = response.getBody();

            if (body != null && body.containsKey("choices")) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) body.get("choices");

                if (!choices.isEmpty()) {
                    Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");

                    if (message != null) {
                        Object content = message.get("content");
                        if (content != null && !content.toString().isBlank()) {
                            return content.toString();
                        }
                    }
                }
            }

            throw new AIServiceException(
                    "Groq returned an invalid or empty response.");

        } catch (org.springframework.web.client.HttpClientErrorException e) {
            String responseBody = e.getResponseBodyAsString();
            log.error(
                    "Groq client error. model={}, status={}, response={}",
                    model,
                    e.getStatusCode().value(),
                    responseBody);

            throw new AIServiceException(
                    "Groq API error " + e.getStatusCode().value() + ": " + responseBody,
                    e);

        } catch (org.springframework.web.client.HttpServerErrorException e) {
            String responseBody = e.getResponseBodyAsString();
            log.error(
                    "Groq server error. model={}, status={}, response={}",
                    model,
                    e.getStatusCode().value(),
                    responseBody);

            throw new AIServiceException(
                    "Groq API error " + e.getStatusCode().value() + ": " + responseBody,
                    e);

        } catch (org.springframework.web.client.ResourceAccessException e) {
            log.error(
                    "Unable to reach Groq. model={}, error={}",
                    model,
                    e.getMessage(),
                    e);

            throw new AIServiceException(
                    "Unable to connect to Groq AI service.",
                    e);

        } catch (AIServiceException e) {
            throw e;

        } catch (Exception e) {
            log.error(
                    "Unexpected Groq error. model={}, error={}",
                    model,
                    e.getMessage(),
                    e);

            throw new AIServiceException(
                    "Unexpected error while communicating with the AI service.",
                    e);
        }
    }
}
