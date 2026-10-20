package com.ai.chatbot_backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;


@Service
public class AutocorrectService {

    private static final Logger log = LoggerFactory.getLogger(AutocorrectService.class);

    public static final int MAX_TEXT_LENGTH = 400;
    private static final int CACHE_SIZE = 2000;
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private static final String SYSTEM_PROMPT =
            "You are the autocorrect engine inside a chat text box. The user's text is given to you; "
          + "return the same text with spelling mistakes fixed.\n"
          + "Fix: misspelled words, typos, transposed letters, missing apostrophes (dont -> don't), "
          + "wrong homophones when the context makes the intent clear (their/there, your/you're, "
          + "its/it's, to/too, no/know), and a lone lowercase \"i\" -> \"I\".\n"
          + "Never: rephrase, reorder, add or remove words, change meaning, change punctuation or "
          + "spacing, translate, or 'improve' style. Keep the user's language. Leave unchanged: "
          + "names, brand and technology names, code, commands, identifiers, URLs, emails, numbers, "
          + "emoji, acronyms, slang, and romanized Hindi/Telugu/other non-English words.\n"
          + "The number of words in your output must equal the number of words in the input.\n"
          + "Output ONLY the corrected text. No quotes, no explanation. If nothing needs fixing, "
          + "output the input exactly as given.\n\n"
          + "Examples:\n"
          + "Input: i dont no wat to do abot the databse \n"
          + "Output: I don't know what to do about the database \n"
          + "Input: Can you explan how react hooks wrk? \n"
          + "Output: Can you explain how React hooks work? \n"
          + "Input: nuvvu ela unnavu bro \n"
          + "Output: nuvvu ela unnavu bro \n"
          + "Input: their going to the park tomorow \n"
          + "Output: they're going to the park tomorrow ";

    @Value("${groq.api.key}")
    private String apiKey;

    @Value("${groq.api.url}")
    private String apiUrl;

    /** Fast, cheap model for per-keystroke use. Override with AUTOCORRECT_MODEL. */
    @Value("${autocorrect.model:llama-3.1-8b-instant}")
    private String primaryModel;

    /** Used when the primary model is unavailable. */
    @Value("${autocorrect.fallback-model:${groq.model}}")
    private String fallbackModel;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    private final Map<String, String> cache = java.util.Collections.synchronizedMap(
            new LinkedHashMap<String, String>(256, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
                    return size() > CACHE_SIZE;
                }
            });

    public AutocorrectService(RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    /** Returns the corrected text, or the original text when nothing should change. */
    public String correct(String text) {
        if (text == null || text.length() < 3 || text.length() > MAX_TEXT_LENGTH) return text;
        if (!text.chars().anyMatch(Character::isLetter)) return text;

        String cached = cache.get(text);
        if (cached != null) return cached;

        String result = text;
        try {
            String raw = callModel(primaryModel, text);
            if (raw == null && fallbackModel != null && !fallbackModel.equals(primaryModel)) {
                raw = callModel(fallbackModel, text);
            }
            if (raw != null) result = validateAndMerge(text, raw);
        } catch (Exception e) {
            log.debug("Autocorrect failed: {}", e.getMessage());
        }

        cache.put(text, result);
        return result;
    }

    // ---------------------------------------------------------------
    // MODEL CALL
    // ---------------------------------------------------------------

    private String callModel(String model, String text) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("model", model);
            body.put("temperature", 0);
            boolean reasoning = model.startsWith("openai/gpt-oss");
            body.put("max_tokens", reasoning ? 600 : 300);
            if (reasoning) body.put("reasoning_effort", "low");
            body.put("messages", List.of(
                    Map.of("role", "system", "content", SYSTEM_PROMPT),
                    Map.of("role", "user", "content", "Input: " + text)
            ));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            ResponseEntity<Map> response = restTemplate.postForEntity(
                    apiUrl + "/chat/completions", new HttpEntity<>(body, headers), Map.class);

            Map<?, ?> map = response.getBody();
            if (map != null
                    && map.get("choices") instanceof List<?> choices
                    && !choices.isEmpty()
                    && choices.get(0) instanceof Map<?, ?> choice
                    && choice.get("message") instanceof Map<?, ?> message
                    && message.get("content") != null) {
                return message.get("content").toString();
            }
        } catch (Exception e) {
            log.debug("Autocorrect model {} failed: {}", model, e.getMessage());
        }
        return null;
    }

    // ---------------------------------------------------------------
    // VALIDATION: the model may only change spelling inside words
    // ---------------------------------------------------------------

    private String validateAndMerge(String original, String modelOutput) {
        String out = modelOutput.strip();
        if (out.regionMatches(true, 0, "Output:", 0, 7)) out = out.substring(7).strip();
        if (out.startsWith("```")) out = out.replaceAll("^```[a-z]*\\n?|```$", "").strip();
        if (out.length() >= 2 && out.startsWith("\"") && out.endsWith("\"") && !original.strip().startsWith("\"")) {
            out = out.substring(1, out.length() - 1);
        }
        if (out.isBlank()) return original;

        String[] originalTokens = WHITESPACE.split(original.strip());
        String[] fixedTokens = WHITESPACE.split(out.strip());
        if (originalTokens.length != fixedTokens.length) return original;

        List<String> accepted = new ArrayList<>(originalTokens.length);
        for (int i = 0; i < originalTokens.length; i++) {
            accepted.add(acceptToken(originalTokens[i], fixedTokens[i]));
        }

        // Rebuild with the ORIGINAL whitespace so spacing and line breaks never change.
        StringBuilder merged = new StringBuilder();
        int tokenIndex = 0;
        int i = 0;
        int n = original.length();
        while (i < n) {
            if (Character.isWhitespace(original.charAt(i))) {
                merged.append(original.charAt(i++));
            } else {
                while (i < n && !Character.isWhitespace(original.charAt(i))) i++;
                merged.append(accepted.get(tokenIndex++));
            }
        }
        return merged.toString();
    }

    private String acceptToken(String original, String fixed) {
        if (original.equals(fixed)) return original;
        if (isProtected(original)) return original;

        int distance = levenshtein(original.toLowerCase(), fixed.toLowerCase());
        int allowed = Math.max(2, (int) Math.ceil(original.length() * 0.5));
        if (distance > allowed) return original;

        return fixed;
    }

    /** Tokens the model must never change. */
    private boolean isProtected(String token) {
        for (int i = 0; i < token.length(); i++) {
            char c = token.charAt(i);
            if (c > 127 && c != '\u2019' && c != '\u2018' && c != '\u201C' && c != '\u201D') return true; // non-Latin / emoji
            if (Character.isDigit(c) || c == '@' || c == '/' || c == '\\' || c == '`' || c == '_' || c == '#' || c == '=' || c == '<' || c == '>' || c == '{' || c == '}') return true;
        }
        String letters = token.replaceAll("[^A-Za-z]", "");
        if (letters.length() >= 2 && letters.equals(letters.toUpperCase())) return true; // acronyms
        if (letters.length() > 1 && !letters.equals(letters.toLowerCase())
                && !Character.isUpperCase(letters.charAt(0))) return true; // camelCase
        if (letters.length() > 2 && Character.isUpperCase(letters.charAt(0))
                && !letters.substring(1).equals(letters.substring(1).toLowerCase())) return true; // mixed case
        String lower = token.toLowerCase();
        return lower.startsWith("http") || lower.startsWith("www.") || lower.contains("://");
    }

    private static int levenshtein(String a, String b) {
        int[] prev = new int[b.length() + 1];
        int[] cur = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) prev[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            cur[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                cur[j] = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] tmp = prev; prev = cur; cur = tmp;
        }
        return prev[b.length()];
    }
}
