"""OAuth support for using an eligible ChatGPT plan in this local harness."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from collections.abc import Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa, utils

AUTHORIZE_URL = "https://auth.openai.com/api/accounts/authorize"
TOKEN_URL = "https://auth.openai.com/api/accounts/oauth/token"
RESOURCE = "https://api.openai.com/v1"
ISSUER = "https://auth.openai.com"
SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def new_authorization(
    *, client_id: str, redirect_uri: str, host_id: str,
    agent_name: str | None = None, id_token_hint: str | None = None,
    login_hint: str | None = None,
) -> dict[str, str]:
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    params = {
        "client_id": client_id,
        "ext_agent_host_id": host_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": SCOPE,
        "resource": RESOURCE,
        "state": state,
        "nonce": nonce,
        "code_challenge_method": "S256",
        "code_challenge": _b64url(hashlib.sha256(verifier.encode("ascii")).digest()),
    }
    if agent_name:
        params["agent_name_hint"] = agent_name
    if id_token_hint:
        params["id_token_hint"] = id_token_hint
    if login_hint:
        params["login_hint"] = login_hint
    return {
        "state": state,
        "nonce": nonce,
        "verifier": verifier,
        "authorization_url": f"{AUTHORIZE_URL}?{urlencode(params)}",
    }


def _post_form(url: str, values: Mapping[str, str]) -> dict[str, object]:
    request = Request(
        url,
        data=urlencode(values).encode("ascii"),
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            detail = json.loads(error.read().decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            detail = {}
        code = detail.get("error") if isinstance(detail, dict) else None
        raise RuntimeError(str(code or "OAuth request failed.")) from error
    except (URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Could not reach the OpenAI sign-in service.") from error
    if not isinstance(payload, dict):
        raise RuntimeError("The OpenAI sign-in service returned an invalid response.")
    return payload


def exchange_code(*, code: str, client_id: str, redirect_uri: str, verifier: str) -> dict[str, object]:
    return _post_form(TOKEN_URL, {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": code,
        "code_verifier": verifier,
        "redirect_uri": redirect_uri,
        "resource": RESOURCE,
    })


def refresh_credentials(*, client_id: str, refresh_token: str) -> dict[str, object]:
    return _post_form(TOKEN_URL, {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "refresh_token": refresh_token,
        "resource": RESOURCE,
    })


def revoke_credentials(*, client_id: str, refresh_token: str) -> None:
    discovery = _get_json(f"{ISSUER}/.well-known/openid-configuration")
    endpoint = discovery.get("revocation_endpoint")
    if not isinstance(endpoint, str):
        raise RuntimeError("OpenAI did not provide a token revocation endpoint.")
    request = Request(
        endpoint,
        data=urlencode({
            "client_id": client_id,
            "token": refresh_token,
            "token_type_hint": "refresh_token",
        }).encode("ascii"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            if response.status != 200:
                raise RuntimeError("Could not revoke the OpenAI sign-in session.")
    except (HTTPError, URLError, TimeoutError) as error:
        raise RuntimeError("Could not revoke the OpenAI sign-in session.") from error


def _get_json(url: str) -> dict[str, object]:
    request = Request(url, headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Could not validate the OpenAI sign-in response.") from error
    if not isinstance(payload, dict):
        raise RuntimeError("OpenAI returned invalid sign-in metadata.")
    return payload


def _decode_segment(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def validate_id_token(token: str, *, client_id: str, nonce: str) -> dict[str, object]:
    parts = token.split(".")
    if len(parts) != 3:
        raise RuntimeError("OpenAI returned an invalid identity token.")
    try:
        header = json.loads(_decode_segment(parts[0]))
        claims = json.loads(_decode_segment(parts[1]))
        signature = _decode_segment(parts[2])
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("OpenAI returned an invalid identity token.") from error
    if not isinstance(header, dict) or not isinstance(claims, dict):
        raise RuntimeError("OpenAI returned an invalid identity token.")

    discovery = _get_json(f"{ISSUER}/.well-known/openid-configuration")
    jwks_uri = discovery.get("jwks_uri")
    if discovery.get("issuer") != ISSUER or not isinstance(jwks_uri, str):
        raise RuntimeError("OpenAI identity metadata is invalid.")
    jwks = _get_json(jwks_uri)
    keys = jwks.get("keys")
    kid = header.get("kid")
    key = next((item for item in keys if isinstance(item, dict) and item.get("kid") == kid), None) if isinstance(keys, list) else None
    if key is None:
        raise RuntimeError("OpenAI identity token signing key was not found.")

    signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
    algorithm = header.get("alg")
    try:
        if algorithm == "RS256" and key.get("kty") == "RSA":
            public_key = rsa.RSAPublicNumbers(
                int.from_bytes(_decode_segment(str(key["e"])), "big"),
                int.from_bytes(_decode_segment(str(key["n"])), "big"),
            ).public_key()
            public_key.verify(signature, signing_input, padding.PKCS1v15(), hashes.SHA256())
        elif algorithm == "ES256" and key.get("kty") == "EC" and key.get("crv") == "P-256":
            public_key = ec.EllipticCurvePublicNumbers(
                int.from_bytes(_decode_segment(str(key["x"])), "big"),
                int.from_bytes(_decode_segment(str(key["y"])), "big"),
                ec.SECP256R1(),
            ).public_key()
            width = len(signature) // 2
            if width != 32:
                raise ValueError("Invalid ES256 signature.")
            der_signature = utils.encode_dss_signature(
                int.from_bytes(signature[:width], "big"),
                int.from_bytes(signature[width:], "big"),
            )
            public_key.verify(der_signature, signing_input, ec.ECDSA(hashes.SHA256()))
        else:
            raise ValueError("Unsupported signing algorithm.")
    except Exception as error:
        raise RuntimeError("OpenAI identity token signature validation failed.") from error

    audience = claims.get("aud")
    audiences = audience if isinstance(audience, list) else [audience]
    now = int(time.time())
    if (
        claims.get("iss") != ISSUER
        or client_id not in audiences
        or not isinstance(claims.get("sub"), str)
        or not isinstance(claims.get("exp"), int)
        or claims["exp"] <= now
        or claims.get("nonce") != nonce
    ):
        raise RuntimeError("OpenAI identity token claims validation failed.")
    return claims


def fetch_plan_models(access_token: str) -> list[dict[str, str]]:
    request = Request(
        f"{RESOURCE}/models",
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise RuntimeError("Could not list models for this ChatGPT account.") from error
    except (URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Could not reach the OpenAI model service.") from error
    models = payload.get("models") if isinstance(payload, dict) else None
    if not isinstance(models, list):
        raise RuntimeError("OpenAI returned an invalid model catalog.")
    return [
        {"id": item["slug"], "name": item.get("display_name") or item["slug"]}
        for item in models
        if isinstance(item, dict)
        and item.get("visibility") == "list"
        and isinstance(item.get("slug"), str)
    ]
