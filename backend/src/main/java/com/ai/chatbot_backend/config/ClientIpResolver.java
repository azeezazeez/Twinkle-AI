package com.ai.chatbot_backend.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;


@Component
public class ClientIpResolver {

    private static final int MAX_IP_LENGTH = 45; // longest textual IPv6 address

    private final int trustedHops;

    public ClientIpResolver(@Value("${client-ip.trusted-hops:2}") int trustedHops) {
        this.trustedHops = Math.max(0, trustedHops);
    }

    public String resolve(HttpServletRequest request) {
        if (request == null) {
            return "unknown";
        }

        if (trustedHops > 0) {
            List<String> chain = forwardedChain(request.getHeader("X-Forwarded-For"));

            if (!chain.isEmpty()) {
                // Count from the right; if the chain is shorter than expected, use its first entry.
                int index = Math.max(0, chain.size() - trustedHops);
                return chain.get(index);
            }

            String realIp = clean(request.getHeader("X-Real-IP"));
            if (realIp != null) {
                return realIp;
            }
        }

        String remote = clean(request.getRemoteAddr());
        return remote != null ? remote : "unknown";
    }

    private static List<String> forwardedChain(String header) {
        List<String> chain = new ArrayList<>();
        if (header == null || header.isBlank()) {
            return chain;
        }
        for (String part : header.split(",")) {
            String ip = clean(part);
            if (ip != null) {
                chain.add(ip);
            }
        }
        return chain;
    }

    /** Returns the trimmed address, or null if it does not look like an IPv4/IPv6 address. */
    private static String clean(String value) {
        if (value == null) {
            return null;
        }
        String ip = value.trim();
        if (ip.isEmpty() || ip.length() > MAX_IP_LENGTH) {
            return null;
        }
        // Only characters that can appear in an IPv4 / IPv6 literal. This also keeps junk
        // (or an attacker-supplied string) out of the Redis keys built from the IP.
        for (int i = 0; i < ip.length(); i++) {
            char c = ip.charAt(i);
            boolean ok = (c >= '0' && c <= '9')
                    || (c >= 'a' && c <= 'f')
                    || (c >= 'A' && c <= 'F')
                    || c == '.' || c == ':';
            if (!ok) {
                return null;
            }
        }
        return ip;
    }
}
