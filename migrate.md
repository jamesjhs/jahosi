# Jahosi GitHub Deployment Settings

This repo deploys through GitHub Actions, publishes container images to GitHub
Packages / GHCR, and creates GitHub Releases from `v*` tags.

The application runs on internal container port `3000` in every environment.

## Branch and Domain Mapping

| Git ref | GitHub environment | Domains served |
| --- | --- | --- |
| `main` branch | `production` | `www.jahosi.co.uk` |
| `testing` branch | `testing` | `www-test.jahosi.co.uk` |
| `v*` tag | `production` | Creates a Release and GHCR image tag only; does not deploy |

Production's application endpoint is `www.jahosi.co.uk`. To make
`https://jahosi.co.uk` work as an alias, create a Cloudflare Redirect Rule from
the apex hostname to `https://www.jahosi.co.uk`, preserving path and query string.
Do not add the apex hostname to the app's Traefik router unless you specifically
want the container to serve both hosts.

## Repository Secrets

Create these under:

`Settings > Secrets and variables > Actions > Repository secrets`

| Name | Purpose |
| --- | --- |
| `SSH_PRIVATE_KEY` | SSH key used by GitHub Actions to connect to the Debian Docker host through Cloudflare Access. |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access service token ID for the protected SSH hostname. |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service token secret for the protected SSH hostname. |

## Optional Repository Secrets

Deployment authenticates to GHCR using the workflow's GitHub token by default.
These secrets can override that login for packages requiring a different account.
Credentials are passed over SSH stdin and stored in a temporary Docker config
that is removed when the remote script exits. The image is pulled before the
existing container is removed.

| Name | Purpose |
| --- | --- |
| `GHCR_USERNAME` | Optional username used by the Debian host when pulling private GHCR images. |
| `GHCR_TOKEN` | Optional token override used with `GHCR_USERNAME` when pulling private GHCR images; otherwise the workflow token is used. |

## Repository Variables

No repository-level variables are required.

Keep runtime configuration in the `production` and `testing` GitHub
Environments instead. That prevents a testing deploy from accidentally inheriting
production domains or contact settings from repository-wide variables.

## Production Environment Variables

Create these under:

`Settings > Environments > production > Environment variables`

| Name | Value |
| --- | --- |
| `SITE_URL` | `https://www.jahosi.co.uk` |
| `PORT` | `3000` |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |
| `SERVICE_NAME` | `jahosi` |
| `APP_TIMEZONE` | `Europe/London` |
| `CONTACT_TO_EMAIL` | Recipient email address for the contact form. |
| `CONTACT_FROM_EMAIL` | Sender display/address for contact form email, for example `Portfolio Contact <no-reply@example.com>`. |
| `SMTP_HOST` | SMTP server hostname. |
| `SMTP_PORT` | `587` unless your SMTP provider requires another port. |
| `SMTP_SECURE` | `false` for STARTTLS on port 587; `true` for SSL/TLS on port 465. |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile public site key. |
| `SPLASH_OPENAI_BASE_URL` | `https://api.openai.com/v1` unless using an OpenAI-compatible proxy. |
| `ANALYTICS_ENABLED` | `true` |
| `ANALYTICS_DB_PATH` | `./data/jahosi.sqlite` |
| `ANALYTICS_RESPECT_DNT` | `true` |

## Production Environment Secrets

Create these under:

`Settings > Environments > production > Environment secrets`

| Name | Purpose |
| --- | --- |
| `SMTP_USER` | SMTP username. |
| `SMTP_PASS` | SMTP password or provider token. |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key. |
| `SPLASH_OPENAI_API_KEY` | Optional OpenAI API key for Splash chat features. |
| `SPLASH_CF_ACCESS_CLIENT_ID` | Optional Cloudflare Access client ID for an Access-protected OpenAI-compatible upstream. |
| `SPLASH_CF_ACCESS_CLIENT_SECRET` | Optional Cloudflare Access client secret for an Access-protected OpenAI-compatible upstream. |

## Testing Environment Variables

Create these under:

`Settings > Environments > testing > Environment variables`

| Name | Value |
| --- | --- |
| `SITE_URL` | `https://www-test.jahosi.co.uk` |
| `PORT` | `3000` |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |
| `SERVICE_NAME` | `jahosi` |
| `APP_TIMEZONE` | `Europe/London` |
| `CONTACT_TO_EMAIL` | Testing recipient email address for the contact form. |
| `CONTACT_FROM_EMAIL` | Testing sender display/address for contact form email. |
| `SMTP_HOST` | SMTP server hostname. |
| `SMTP_PORT` | `587` unless your SMTP provider requires another port. |
| `SMTP_SECURE` | `false` for STARTTLS on port 587; `true` for SSL/TLS on port 465. |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile public site key for testing. |
| `SPLASH_OPENAI_BASE_URL` | `https://api.openai.com/v1` unless using an OpenAI-compatible proxy. |
| `ANALYTICS_ENABLED` | `true` |
| `ANALYTICS_DB_PATH` | `./data/jahosi.sqlite` |
| `ANALYTICS_RESPECT_DNT` | `true` |

## Testing Environment Secrets

Create these under:

`Settings > Environments > testing > Environment secrets`

| Name | Purpose |
| --- | --- |
| `SMTP_USER` | SMTP username for testing. |
| `SMTP_PASS` | SMTP password or provider token for testing. |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key for testing. |
| `SPLASH_OPENAI_API_KEY` | Optional OpenAI API key for Splash chat features in testing. |
| `SPLASH_CF_ACCESS_CLIENT_ID` | Optional Cloudflare Access client ID for an Access-protected OpenAI-compatible upstream. |
| `SPLASH_CF_ACCESS_CLIENT_SECRET` | Optional Cloudflare Access client secret for an Access-protected OpenAI-compatible upstream. |

## Values Generated by the Workflow

Do not create these manually in GitHub settings. The workflow derives them during
each run and writes them into the generated server `.env` file:

| Name | Source |
| --- | --- |
| `BRANCH_NAME` | `main` or `testing`, derived from the pushed branch. |
| `JAHOSI_TRAEFIK_RULE` | Traefik `Host(...)` rule generated from `SITE_URL`. |
| `JAHOSI_IMAGE` | Immutable GHCR image tag for the current commit SHA. |
