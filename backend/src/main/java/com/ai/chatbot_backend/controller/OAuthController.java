package com.ai.chatbot_backend.controller;

import com.ai.chatbot_backend.config.SessionSupport;
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

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;


@Controller
@RequestMapping("/api/auth/oauth")
@RequiredArgsConstructor
@Slf4j
public class OAuthController {

    private static final String OAUTH_NONCE_ATTRIBUTE = "oauth_state_nonce";

    private static final java.security.SecureRandom NONCE_RANDOM = new java.security.SecureRandom();


    private final OAuthService oauthService;


    /*
     * ============================================================
     * CONFIGURATION
     * ============================================================
     */

    @Value("${oauth.state-secret}")
    private String stateSecret;


    @Value("${frontend.url:https://twinkleai.vercel.app}")
    private String frontendUrl;


    /*
     * ============================================================
     * GOOGLE LOGIN
     * ============================================================
     */

    @GetMapping("/google")
    public String google(HttpServletRequest request) {

        try {

            // The state is bound to THIS browser: a random nonce is kept in the server-side
            // session and also signed into the state. The callback only accepts a state
            // whose nonce matches the session (blocks login CSRF / state replay).
            String nonce = newNonce();
            request.getSession(true).setAttribute(OAUTH_NONCE_ATTRIBUTE, nonce);

            String state =
                    createState("GOOGLE", nonce);


            String authorizationUrl =
                    oauthService.googleAuthorizationUrl(
                            state
                    );


            log.info(
                    "Starting Google OAuth flow"
            );


            return "redirect:" +
                    authorizationUrl;


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


    /*
     * ============================================================
     * GOOGLE CALLBACK
     * ============================================================
     */

    @GetMapping("/google/callback")
    public String googleCallback(

            @RequestParam(
                    required = false
            )
            String code,

            @RequestParam(
                    required = false
            )
            String state,

            @RequestParam(
                    required = false
            )
            String error,

            HttpServletRequest request

    ) {

        log.info(
                "Google OAuth callback received"
        );


        /*
         * --------------------------------------------------------
         * GOOGLE ERROR
         * --------------------------------------------------------
         */

        if (
                error != null &&
                !error.isBlank()
        ) {

            log.warn(
                    "Google OAuth returned error: {}",
                    error
            );


            return redirect(
                    "/login?oauthError=" +
                            url(error)
            );
        }


        /*
         * --------------------------------------------------------
         * VALIDATE CODE + STATE
         * --------------------------------------------------------
         */

        if (
                code == null ||
                code.isBlank() ||
                state == null ||
                state.isBlank()
        ) {

            log.warn(
                    "Google OAuth callback missing code or state"
            );


            return redirect(
                    "/login?oauthError=Invalid+Google+response"
            );
        }


        /*
         * --------------------------------------------------------
         * VALIDATE STATE
         * --------------------------------------------------------
         */

        HttpSession stateSession = request.getSession(false);
        Object expectedNonce = stateSession == null
                ? null
                : stateSession.getAttribute(OAUTH_NONCE_ATTRIBUTE);
        if (stateSession != null) {
            // Single use: a state can never be replayed.
            stateSession.removeAttribute(OAUTH_NONCE_ATTRIBUTE);
        }

        if (
                !(expectedNonce instanceof String)
                        || !verifyState(
                        state,
                        "GOOGLE",
                        (String) expectedNonce
                )
        ) {

            log.warn(
                    "Google OAuth state validation failed"
            );


            return redirect(
                    "/login?oauthError=Invalid+OAuth+state"
            );
        }


        try {

            /*
             * ----------------------------------------------------
             * LOAD GOOGLE USER
             * ----------------------------------------------------
             */

            User user =
                    oauthService.googleUser(
                            code
                    );


            if (user == null) {

                throw new IllegalStateException(
                        "Google user could not be loaded"
                );
            }


            if (
                    user.getId() == null
            ) {

                throw new IllegalStateException(
                        "Google user ID is missing"
                );
            }


            if (
                    user.getEmail() == null ||
                    user.getEmail().isBlank()
            ) {

                throw new IllegalStateException(
                        "Google user email is missing"
                );
            }


            /*
             * ----------------------------------------------------
             * CREATE / UPDATE SESSION
             * ----------------------------------------------------
             */

            HttpSession session =
                    createLoginSession(
                            request,
                            user
                    );


            /*
             * ----------------------------------------------------
             * IMPORTANT DIAGNOSTIC LOGGING
             * ----------------------------------------------------
             */

            log.info(
                    "Google OAuth authentication successful for userId {}",
                    session.getAttribute("userId")
            );


            /*
             * ----------------------------------------------------
             * REDIRECT TO FRONTEND
             * ----------------------------------------------------
             */

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


    /*
     * ============================================================
     * CREATE LOGIN SESSION
     * ============================================================
     */

    private HttpSession createLoginSession(

            HttpServletRequest request,

            User user

    ) {

        /*
         * Get the existing session if the browser already has one.
         *
         * Otherwise create a new Redis-backed session.
         */

        HttpSession session =
                SessionSupport.establishAuthenticatedSession(
                        request,
                        user
                );


        /*
         * Make sure the session remains active.
         */

        session.setMaxInactiveInterval(
                24 * 60 * 60
        );


        /*
         * Force the session to be touched/updated.
         *
         * Spring Session will persist this session into Redis
         * when the request completes.
         */

        session.setAttribute(
                "authentication_method",
                "GOOGLE"
        );


        return session;
    }


    /*
     * ============================================================
     * CREATE OAUTH STATE
     * ============================================================
     */

    private String createState(
            String provider,
            String nonce
    ) {

        long timestamp =
                Instant.now()
                        .getEpochSecond();


        String payload =
                provider +
                        ":" +
                        timestamp +
                        ":" +
                        nonce;


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


    /*
     * ============================================================
     * VERIFY OAUTH STATE
     * ============================================================
     */

    private boolean verifyState(
            String state,
            String expectedProvider,
            String expectedNonce
    ) {

        try {

            if (
                    state == null ||
                    state.isBlank()
            ) {

                return false;
            }


            String[] parts =
                    state.split(
                            "\\.",
                            2
                    );


            if (
                    parts.length != 2
            ) {

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
                    payload.split(
                            ":",
                            3
                    );

            if (
                    payloadParts.length != 3
            ) {

                return false;
            }


            String provider =
                    payloadParts[0];


            long timestamp =
                    Long.parseLong(
                            payloadParts[1]
                    );

            /*
             * Nonce must be the one stored in this browser's session.
             */
            if (
                    !constantTimeEquals(
                            payloadParts[2],
                            expectedNonce
                    )
            ) {
                return false;
            }


            /*
             * Provider check
             */

            if (
                    !expectedProvider.equals(
                            provider
                    )
            ) {

                return false;
            }


            /*
             * State expires after 10 minutes.
             */

            long now =
                    Instant.now()
                            .getEpochSecond();


            long age =
                    now - timestamp;


            if (
                    age < 0 ||
                    age > 600
            ) {

                return false;
            }


            /*
             * Recalculate signature.
             */

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


    /*
     * ============================================================
     * HMAC
     * ============================================================
     */

    private static String newNonce() {
        byte[] bytes = new byte[24];
        NONCE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }


        private String hmac(
            String value
    ) {

        try {

            Mac mac =
                    Mac.getInstance(
                            "HmacSHA256"
                    );


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
                    .encodeToString(
                            digest
                    );


        } catch (Exception e) {

            throw new IllegalStateException(
                    "Unable to create OAuth state signature",
                    e
            );
        }
    }


    /*
     * ============================================================
     * CONSTANT-TIME COMPARISON
     * ============================================================
     */

    private boolean constantTimeEquals(

            String first,

            String second

    ) {

        if (
                first == null ||
                second == null
        ) {

            return false;
        }


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


    /*
     * ============================================================
     * FRONTEND REDIRECT
     * ============================================================
     */

    private String redirect(
            String path
    ) {

        String base =
                frontendUrl;


        if (
                base == null ||
                base.isBlank()
        ) {

            base =
                    "https://twinkleai.vercel.app";
        }


        base =
                base.replaceAll(
                        "/+$",
                        ""
                );


        if (
                path == null ||
                path.isBlank()
        ) {

            return "redirect:" +
                    base;
        }


        if (
                !path.startsWith("/")
        ) {

            path =
                    "/" + path;
        }


        return "redirect:" +
                base +
                path;
    }


    /*
     * ============================================================
     * URL ENCODING
     * ============================================================
     */

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


    /*
     * ============================================================
     * SAFE ERROR
     * ============================================================
     */

    private String safeMessage(

            Exception e,

            String fallback

    ) {

        String message =
                e.getMessage();


        if (
                message == null ||
                message.isBlank()
        ) {

            return fallback;
        }


        return message;
    }
}
