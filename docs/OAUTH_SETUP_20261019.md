# Google/Apple login (credential-gated)

The branch implements OAuth authorization-code login for Google and Apple. **Both providers remain hidden/disabled until the corresponding environment credentials are supplied**, verified and registered with the providers.

Google: register a confidential Web Client with authorized redirect:
`https://ffm-aktuell.smarbiz.sbs/api/auth/oauth/google/callback`
Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.

Apple: configure an Apple Developer Services ID, web domain and return URL:
`https://ffm-aktuell.smarbiz.sbs/api/auth/oauth/apple/callback`
Set `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (PEM with literal \n accepted). Apple sends `form_post`, the temporary state cookie uses `SameSite=None; Secure` in production.

Security: unpredictable state, OIDC nonce, Google PKCE, exact redirect, JWT signature against Google's or Apple's JWK, issuer, audience, expiry, verified email, atomic provider subject mapping, no automatic email-based account takeover, server-only secrets. Existing password-email accounts need an explicit separately authenticated linking flow and cannot silently be linked.

The branch does not claim native iOS/Android sign in: native redirect/client registration and store reviews need additional configuration and device tests.

No real OAuth or production deploy verification is possible before credentials and provider consoles are available.
