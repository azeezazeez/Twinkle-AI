package com.ai.chatbot_backend.controller;

import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.service.OAuthService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

@Controller
@RequestMapping("/api/auth/oauth")
@RequiredArgsConstructor
@Slf4j
public class OAuthController {

    private final OAuthService oauthService;

    @Value("${oauth.state-secret}")
    private String stateSecret;

    @Value("${app.frontend-url:https://twinkleai.vercel.app}")
    private String frontendUrl;


    // ============================================================
    // GOOGLE LOGIN
    // ============================================================

    @GetMapping("/google")
    public String google() {

        try {

            String state = createState("GOOGLE");

            String authorizationUrl =
                    oauthService.googleAuthorizationUrl(state);

            log.info("Starting Google OAuth flow");

            return "redirect:" + authorizationUrl;

        } catch (Exception e) {

            log.error(
                    "Failed to start Google OAuth",
                    e
            );

            return redirect(
                    "/login?oauthError=Google+OAuth+configuration+error"
            );
        }
    }


    // ============================================================
    // GOOGLE CALLBACK
    // ============================================================

    @GetMapping("/google/callback")
    public String googleCallback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            HttpServletRequest request
    ) {

        // --------------------------------------------------------
        // GOOGLE RETURNED AN ERROR
        // --------------------------------------------------------

        if (error != null && !error.isBlank()) {

            log.warn(
                    "Google OAuth returned error: {}",
                    error
            );

            return redirect(
                    "/login?oauthError=" + url(error)
            );
        }


        // --------------------------------------------------------
        // VALIDATE GOOGLE RESPONSE
        // --------------------------------------------------------

        if (code == null ||
                code.isBlank() ||
                state == null ||
                state.isBlank()) {

            log.warn(
                    "Google OAuth callback missing code or state"
            );

            return redirect(
                    "/login?oauthError=Invalid+Google+response"
            );
        }


        // --------------------------------------------------------
        // VALIDATE STATE
        // --------------------------------------------------------

        if (!verifyState(state, "GOOGLE")) {

            log.warn(
                    "Google OAuth state validation failed"
            );

            return redirect(
                    "/login?oauthError=Invalid+OAuth+state"
            );
        }


        try {

            // ----------------------------------------------------
            // EXCHANGE CODE + LOAD GOOGLE USER
            // ----------------------------------------------------

            User user =
                    oauthService.googleUser(code);


            if (user == null) {

                throw new IllegalStateException(
                        "Google user could not be loaded"
                );
            }


            // ----------------------------------------------------
            // CREATE AUTHENTICATED SESSION
            // ----------------------------------------------------

            createLoginSession(
                    request,
                    user
            );


            log.info(
                    "Google OAuth login successful for {}",
                    user.getEmail()
            );


            // ----------------------------------------------------
            // REDIRECT TO FRONTEND CHAT
            // ----------------------------------------------------

            return redirect("/");

        } catch (Exception e) {

            log.error(
                    "Google OAuth callback failed",
                    e
            );

            return redirect(
                    "/login?oauthError=" +
                            url(
                                    safeMessage(
                                            e,
                                            "Google sign-in failed"
                                    )
                            )
            );
        }
    }


    // ============================================================
    // CREATE LOGIN SESSION
    // ============================================================

    private void createLoginSession(
            HttpServletRequest request,
            User user
    ) {

        /*
         * IMPORTANT:
         *
         * We deliberately create/use the HTTP session here.
         *
         * The frontend subsequently calls:
         *
         * GET /api/auth/status
         *
         * with credentials included.
         *
         * Spring Session + Redis keeps this session available
         * between the OAuth callback and frontend API requests.
         */

        HttpSession session =
                request.getSession(true);


        session.setAttribute(
                "user",
                user
        );


        session.setAttribute(
                "userId",
                user.getId()
        );


        log.info(
                "Authenticated session created. sessionId={}, userId={}",
                session.getId(),
                user.getId()
        );
    }


    // ============================================================
    // OAUTH STATE
    // ============================================================

    private String createState(
            String provider
    ) {

        long timestamp =
                Instant.now().getEpochSecond();


        String payload =
                provider +
                        ":" +
                        timestamp;


        String signature =
                hmac(payload);


        String encodedPayload =
                Base64.getUrlEncoder()
                        .withoutPadding()
                        .encodeToString(
                                payload.getBytes(
                                        StandardCharsets.UTF_8
                                )
                        );


        return encodedPayload +
                "." +
                signature;
    }


    private boolean verifyState(
            String state,
            String expectedProvider
    ) {

        try {

            if (state == null ||
                    state.isBlank()) {

                return false;
            }


            String[] parts =
                    state.split("\\.", 2);


            if (parts.length != 2) {

                return false;
            }


            String encodedPayload =
                    parts[0];

            String providedSignature =
                    parts[1];


            byte[] payloadBytes =
                    Base64.getUrlDecoder()
                            .decode(
                                    encodedPayload
                            );


            String payload =
                    new String(
                            payloadBytes,
                            StandardCharsets.UTF_8
                    );


            String[] payloadParts =
                    payload.split(":", 2);


            if (payloadParts.length != 2) {

                return false;
            }


            String provider =
                    payloadParts[0];

            long timestamp =
                    Long.parseLong(
                            payloadParts[1]
                    );


            // Provider must match.
            if (!expectedProvider.equals(provider)) {

                return false;
            }


            // State is valid for 10 minutes.
            long now =
                    Instant.now().getEpochSecond();

            long age =
                    now - timestamp;


            if (age < 0 || age > 600) {

                return false;
            }


            String expectedSignature =
                    hmac(payload);


            return constantTimeEquals(
                    expectedSignature,
                    providedSignature
            );

        } catch (Exception e) {

            log.warn(
                    "OAuth state validation failed: {}",
                    e.getMessage()
            );

            return false;
        }
    }


    // ============================================================
    // HMAC
    // ============================================================

    private String hmac(
            String value
    ) {

        try {

            Mac mac =
                    Mac.getInstance("HmacSHA256");


            SecretKeySpec key =
                    new SecretKeySpec(
                            stateSecret.getBytes(
                                    StandardCharsets.UTF_8
                            ),
                            "HmacSHA256"
                    );


            mac.init(key);


            byte[] digest =
                    mac.doFinal(
                            value.getBytes(
                                    StandardCharsets.UTF_8
                            )
                    );


            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(digest);

        } catch (Exception e) {

            throw new IllegalStateException(
                    "Unable to create OAuth state signature",
                    e
            );
        }
    }


    // ============================================================
    // CONSTANT-TIME COMPARISON
    // ============================================================

    private boolean constantTimeEquals(
            String first,
            String second
    ) {

        byte[] firstBytes =
                first.getBytes(
                        StandardCharsets.UTF_8
                );

        byte[] secondBytes =
                second.getBytes(
                        StandardCharsets.UTF_8
                );


        return java.security.MessageDigest
                .isEqual(
                        firstBytes,
                        secondBytes
                );
    }


    // ============================================================
    // FRONTEND REDIRECT
    // ============================================================

    private String redirect(
            String path
    ) {

        String base =
                frontendUrl;


        if (base == null ||
                base.isBlank()) {

            base =
                    "https://twinkleai.vercel.app";
        }


        // Remove trailing slash.
        base =
                base.replaceAll(
                        "/+$",
                        ""
                );


        if (path == null ||
                path.isBlank()) {

            return "redirect:" + base;
        }


        if (!path.startsWith("/")) {

            path =
                    "/" + path;
        }


        return "redirect:" +
                base +
                path;
    }


    // ============================================================
    // URL ENCODING
    // ============================================================

    private String url(
            String value
    ) {

        try {

            return java.net.URLEncoder
                    .encode(
                            value,
                            StandardCharsets.UTF_8
                    );

        } catch (Exception e) {

            return "OAuth+error";
        }
    }


    // ============================================================
    // SAFE ERROR MESSAGE
    // ============================================================

    private String safeMessage(
            Exception e,
            String fallback
    ) {

        String message =
                e.getMessage();


        if (message == null ||
                message.isBlank()) {

            return fallback;
        }


        return message;
    }
}
