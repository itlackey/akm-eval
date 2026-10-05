---
description: Configure OpenCode for enterprise network environments by setting
  up HTTP/HTTPS proxies, trusting custom Certificate Authorities via environment
  variables, and managing local bypass rules.
when_to_use: Use when deploying behind corporate firewalls with mandatory proxy
  servers, connecting through networks requiring custom CA certificates for
  HTTPS validation, or when proxy authentication is required for external API
  access while maintaining local TUI connectivity.
updated: 2026-05-15
---

# Network

Configure proxies and custom certificates to ensure OpenCode operates correctly within restricted enterprise network environments.

OpenCode respects standard proxy environment variables and supports custom certificate authorities (CA) for validating HTTPS connections in untrusted corporate networks.

## Proxy Configuration

OpenCode utilizes standard environment variables to route traffic through corporate proxies. Ensure the following variables are set before launching the application.

### Environment Variables

```bash
# HTTPS proxy (recommended)
export HTTPS_PROXY=https://proxy.example.com:8080

# HTTP proxy (if HTTPS not available)
export HTTP_PROXY=http://proxy.example.com:8080

# Bypass proxy for local server (required)
export NO_PROXY=localhost,127.0.0.1
```

> **Caution**: The TUI communicates with a local HTTP server. You must bypass the proxy for this connection to prevent routing loops.
>
> You can configure the server's port and hostname using [CLI flags](/docs/cli#run).

### Proxy Authentication

If your proxy requires basic authentication, include credentials in the URL within the environment variable.

```bash
export HTTPS_PROXY=http://username:password@proxy.example.com:8080
```

> **Caution**: Avoid hardcoding passwords. Use environment variables or secure credential storage.
>
> For proxies requiring advanced authentication like NTLM or Kerberos, consider using an LLM Gateway that supports your authentication method.

## Custom Certificates

If your enterprise uses custom Certificate Authorities (CA) for HTTPS connections, configure OpenCode to trust them by pointing to the CA certificate file.

```bash
export NODE_EXTRA_CA_CERTS=/path/to/ca-cert.pem
```

This configuration works for both proxy connections and direct API access.

## Troubleshooting

### Connection Refused

If OpenCode fails to connect to the API server, verify that `NO_PROXY` includes the local host address and port configured in your CLI flags. A common error occurs when the proxy intercepts local traffic, causing a loop or connection refusal.

### SSL/TLS Errors

If you encounter SSL handshake failures, ensure `NODE_EXTRA_CA_CERTS` points to a valid PEM file containing the root or intermediate CA certificates. If the error persists, verify that the certificate chain is complete and not expired.

### Proxy Timeouts

If requests time out, check your proxy server's status and network connectivity. Ensure that the proxy allows outbound connections to the required API endpoints. Some corporate proxies may block specific domains or ports; consult your network administrator if necessary.
