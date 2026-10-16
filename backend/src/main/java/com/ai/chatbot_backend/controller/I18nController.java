package com.ai.chatbot_backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;


@RestController
@RequestMapping("/api/i18n")
public class I18nController {

    private static final Logger log = LoggerFactory.getLogger(I18nController.class);

    private static final int MAX_TEXTS = 60;
    private static final int MAX_TEXT_LENGTH = 300;
    private static final int MAX_CACHE_SIZE = 50_000;

    private static final Map<String, String> LANGUAGE_NAMES = Map.ofEntries(
            Map.entry("hi", "Hindi"), Map.entry("te", "Telugu"), Map.entry("ta", "Tamil"),
            Map.entry("kn", "Kannada"), Map.entry("ml", "Malayalam"), Map.entry("bn", "Bengali"),
            Map.entry("mr", "Marathi"), Map.entry("gu", "Gujarati"), Map.entry("pa", "Punjabi"),
            Map.entry("ur", "Urdu"), Map.entry("ar", "Arabic"), Map.entry("es", "Spanish"),
            Map.entry("fr", "French"), Map.entry("de", "German"), Map.entry("it", "Italian"),
            Map.entry("pt", "Portuguese"), Map.entry("ru", "Russian"), Map.entry("ja", "Japanese"),
            Map.entry("ko", "Korean"), Map.entry("zh", "Simplified Chinese"), Map.entry("tr", "Turkish"),
            Map.entry("vi", "Vietnamese"), Map.entry("id", "Indonesian"), Map.entry("th", "Thai"),
            Map.entry("fil", "Filipino")
    );

    private final Map<String, String> cache = new ConcurrentHashMap<>();

    @Value("${groq.api.key}")
    private String apiKey;

    @Value("${groq.api.url}")
    private String apiUrl;

    @Value("${i18n.model:${groq.model}}")
    private String model;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public I18nController(RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    public static class TranslateRequest {
        public String language;
        public List<String> texts;
    }

    @PostMapping("/translate")
    public ResponseEntity<Map<String, Object>> translate(@RequestBody TranslateRequest request) {
        Map<String, Object> response = new LinkedHashMap<>();
        Map<String, String> result = new LinkedHashMap<>();
        response.put("translations", result);

        String code = request == null || request.language == null
                ? "" : request.language.trim().toLowerCase(Locale.ROOT);
        String languageName = LANGUAGE_NAMES.get(code);

        if (languageName == null || request.texts == null || request.texts.isEmpty()) {
            return ResponseEntity.ok(response);
        }

        List<String> pending = new ArrayList<>();
        for (String text : request.texts) {
            if (text == null) continue;
            String trimmed = text.trim();
            if (trimmed.isEmpty() || trimmed.length() > MAX_TEXT_LENGTH) continue;
            if (result.containsKey(trimmed) || pending.contains(trimmed)) continue;
            if (result.size() + pending.size() >= MAX_TEXTS) break;

            String cached = cache.get(code + "\u0000" + trimmed);
            if (cached != null) {
                result.put(trimmed, cached);
            } else {
                pending.add(trimmed);
            }
        }

        if (!pending.isEmpty()) {
            try {
                List<String> translated = callModel(languageName, pending);
                for (int i = 0; i < pending.size(); i++) {
                    String source = pending.get(i);
                    String target = i < translated.size() && translated.get(i) != null
                            && !translated.get(i).isBlank()
                            ? translated.get(i).trim() : source;
                    result.put(source, target);
                    if (cache.size() < MAX_CACHE_SIZE) {
                        cache.put(code + "\u0000" + source, target);
                    }
                }
            } catch (Exception e) {
                log.warn("Interface translation failed for {}: {}", code, e.getMessage());
                response.put("error", "translation_unavailable");
            }
        }

        return ResponseEntity.ok(response);
    }

    private List<String> callModel(String languageName, List<String> texts) throws Exception {
        String system = "You are a professional UI localisation engine. Translate each English user-interface "
                + "string in the given JSON array into " + languageName + ". Rules: keep the same order and "
                + "return exactly one translation per input; keep brand and product names (Twinkle AI, Google, "
                + "Gemini, Groq), model names, code, emails, URLs, numbers, emoji and punctuation unchanged; keep "
                + "placeholders and symbols as they are; keep translations short and natural for buttons, menus "
                + "and labels; never add explanations. Respond ONLY with a JSON object of the form "
                + "{\"translations\":[\"...\", \"...\"]}.";

        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("temperature", 0.2);
        body.put("max_tokens", 4096);
        body.put("response_format", Map.of("type", "json_object"));
        if (model.startsWith("openai/gpt-oss")) {
            body.put("reasoning_effort", "low");
        }
        body.put("messages", List.of(
                Map.of("role", "system", "content", system),
                Map.of("role", "user", "content", objectMapper.writeValueAsString(texts))
        ));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        ResponseEntity<String> raw = restTemplate.postForEntity(
                apiUrl + "/chat/completions", new HttpEntity<>(body, headers), String.class);

        JsonNode root = objectMapper.readTree(raw.getBody());
        String content = root.path("choices").path(0).path("message").path("content").asText("");
        JsonNode parsed = objectMapper.readTree(content);
        JsonNode array = parsed.isArray() ? parsed : parsed.path("translations");

        List<String> out = new ArrayList<>();
        if (array.isArray()) {
            for (JsonNode node : array) {
                out.add(node.asText(""));
            }
        }
        return out;
    }
}
