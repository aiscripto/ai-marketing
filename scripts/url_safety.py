"""Safe, bounded public-web requests shared by the original CLI utilities."""

from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import urllib.error
from email.message import Message
from urllib.parse import urljoin, urlsplit, urlunsplit

MAX_RESPONSE_BYTES = 5 * 1024 * 1024
ALLOWED_PORTS = {80, 443}


def _resolve_public_addresses(host: str, port: int) -> list[str]:
    try:
        records = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError("Website hostname could not be resolved") from exc
    if not records:
        raise ValueError("Website hostname did not resolve to a public address")
    public_ips = []
    for record in records:
        address = ipaddress.ip_address(record[4][0].split("%", 1)[0])
        if not address.is_global:
            raise ValueError("Local and private network destinations are not allowed")
        if address.compressed not in public_ips:
            public_ips.append(address.compressed)
    return public_ips


def normalize_public_url(url: str) -> str:
    value = url.strip()
    if not value:
        raise ValueError("Website URL is required")
    if "://" not in value:
        value = "https://" + value
    parts = urlsplit(value)
    scheme = parts.scheme.lower()
    if scheme not in {"http", "https"}:
        raise ValueError("Only HTTP and HTTPS website URLs are supported")
    if parts.username or parts.password:
        raise ValueError("Website URLs cannot contain credentials")
    if not parts.hostname:
        raise ValueError("Website URL must include a public hostname")
    try:
        port = parts.port or (443 if scheme == "https" else 80)
    except ValueError as exc:
        raise ValueError("Website URL contains an invalid port") from exc
    if port not in ALLOWED_PORTS:
        raise ValueError("Website scans only support public HTTP and HTTPS ports")
    host = parts.hostname.rstrip(".").lower()
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
        raise ValueError("Local and private network destinations are not allowed")
    try:
        address = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        address = None
    if address and not address.is_global:
        raise ValueError("Local and private network destinations are not allowed")
    _resolve_public_addresses(host, port)
    return urlunsplit((scheme, parts.netloc, parts.path or "/", parts.query, ""))


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host: str, port: int, address: str, timeout: int):
        super().__init__(host=host, port=port, timeout=timeout)
        self.address = address

    def connect(self):
        self.sock = socket.create_connection((self.address, self.port), self.timeout)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, port: int, address: str, timeout: int):
        super().__init__(host=host, port=port, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw_socket = socket.create_connection((self.address, self.port), self.timeout)
        self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)


def fetch_public_text(url: str, user_agent: str, timeout: int = 15) -> str:
    current_url = normalize_public_url(url)
    for redirect_count in range(6):
        parts = urlsplit(current_url)
        host = parts.hostname or ""
        port = parts.port or (443 if parts.scheme == "https" else 80)
        address = _resolve_public_addresses(host, port)[0]
        connection_type = _PinnedHTTPSConnection if parts.scheme == "https" else _PinnedHTTPConnection
        connection = connection_type(host, port, address, timeout)
        request_path = parts.path or "/"
        if parts.query:
            request_path += "?" + parts.query
        try:
            connection.request("GET", request_path, headers={
                "Host": parts.netloc,
                "User-Agent": user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.5",
                "Connection": "close",
            })
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                response.read(1024)
                if not location:
                    raise ValueError("Website returned a redirect without a destination")
                if redirect_count >= 5:
                    raise ValueError("Website exceeded the 5-redirect scan limit")
                current_url = normalize_public_url(urljoin(current_url, location))
                continue
            if response.status < 200 or response.status >= 300:
                raise urllib.error.HTTPError(current_url, response.status, response.reason, response.headers, None)
            payload = response.read(MAX_RESPONSE_BYTES + 1)
            if len(payload) > MAX_RESPONSE_BYTES:
                raise ValueError("Website response exceeded the 5 MB scan limit")
            content_type = Message()
            content_type["content-type"] = response.getheader("Content-Type", "")
            charset = content_type.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace")
        finally:
            connection.close()
    raise ValueError("Website could not be safely fetched")
