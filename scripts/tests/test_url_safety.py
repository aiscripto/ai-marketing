import socket
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from url_safety import fetch_public_text, normalize_public_url


def public_dns(host, port, type):
    return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("93.184.216.34", port))]


class RedirectResponse:
    status = 302
    reason = "Found"
    headers = {}

    def getheader(self, name):
        return "http://127.0.0.1/admin" if name.lower() == "location" else None

    def read(self, amount):
        return b""


class FakeConnection:
    def __init__(self, *args, **kwargs):
        pass

    def request(self, *args, **kwargs):
        pass

    def getresponse(self):
        return RedirectResponse()

    def close(self):
        pass


class UrlSafetyTests(unittest.TestCase):
    def test_normalizes_bare_host_and_uses_public_dns(self):
        with patch("socket.getaddrinfo", side_effect=public_dns):
            self.assertEqual(normalize_public_url("example.com/path"), "https://example.com/path")

    def test_rejects_local_hosts_and_private_ip_addresses(self):
        with self.assertRaisesRegex(ValueError, "Local and private"):
            normalize_public_url("http://127.0.0.1/admin")
        with self.assertRaisesRegex(ValueError, "Local and private"):
            normalize_public_url("http://printer.local/")

    def test_rejects_credentials_and_non_web_ports(self):
        with self.assertRaisesRegex(ValueError, "credentials"):
            normalize_public_url("https://user:secret@example.com/")
        with patch("socket.getaddrinfo", side_effect=public_dns):
            with self.assertRaisesRegex(ValueError, "ports"):
                normalize_public_url("https://example.com:8443/")

    def test_revalidates_redirect_destinations_before_connecting(self):
        with patch("socket.getaddrinfo", side_effect=public_dns), patch("url_safety._PinnedHTTPSConnection", FakeConnection):
            with self.assertRaisesRegex(ValueError, "Local and private"):
                fetch_public_text("https://example.com/", "AIScripto test")


if __name__ == "__main__":
    unittest.main()
