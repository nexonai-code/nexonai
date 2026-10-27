"""Small LLM client without SDKs: Ollama (local), OpenAI-compatible servers, OpenAI,
Anthropic, Google Gemini and OpenRouter. Only the standard library is used."""
from __future__ import annotations

import json
import re
import ssl
import urllib.error
import urllib.request

PROVIDERS = {
    "none":       {"label": "Kein Modell (nur lokale Analyse)", "local": True,  "model": "",                       "base_url": ""},
    "ollama":     {"label": "Ollama (lokal)",                   "local": True,  "model": "llama3.1:8b",            "base_url": "http://127.0.0.1:11434"},
    "local":      {"label": "Lokaler OpenAI-kompatibler Server (LM Studio, vLLM, llama.cpp)", "local": True, "model": "local-model", "base_url": "http://127.0.0.1:1234/v1"},
    "openai":     {"label": "OpenAI",                           "local": False, "model": "gpt-4.1-mini",           "base_url": "https://api.openai.com/v1"},
    "anthropic":  {"label": "Anthropic Claude",                 "local": False, "model": "claude-haiku-5-5",       "base_url": "https://api.anthropic.com"},
    "gemini":     {"label": "Google Gemini",                    "local": False, "model": "gemini-2.5-flash",       "base_url": "https://generativelanguage.googleapis.com"},
    "openrouter": {"label": "OpenRouter",                       "local": False, "model": "openai/gpt-4.1-mini",    "base_url": "https://openrouter.ai/api/v1"},
}


class LLMError(RuntimeError):
    pass


def enabled(cfg: dict) -> bool:
    return (cfg or {}).get("provider", "none") not in ("", "none")


def is_local(cfg: dict) -> bool:
    return PROVIDERS.get((cfg or {}).get("provider", "none"), {}).get("local", False)


def _post(url: str, payload: dict, headers: dict, timeout: float) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", **headers}, method="POST")
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "replace")[:500]
        raise LLMError(f"HTTP {err.code}: {body}") from None
    except urllib.error.URLError as err:
        raise LLMError(f"Verbindung fehlgeschlagen: {err.reason}") from None
    except (TimeoutError, OSError) as err:
        raise LLMError(f"Zeitüberschreitung oder Netzwerkfehler: {err}") from None


def complete(cfg: dict, system: str, user: str, json_mode: bool = False, timeout: float = 180, max_tokens: int = 2000) -> str:
    p = (cfg or {}).get("provider", "none")
    if p == "none":
        raise LLMError("Kein Modell eingestellt.")
    defaults = PROVIDERS.get(p, PROVIDERS["openai"])
    model = cfg.get("model") or defaults["model"]
    base = (cfg.get("base_url") or defaults["base_url"]).rstrip("/")
    key = cfg.get("api_key", "")
    if not PROVIDERS.get(p, {}).get("local") and not key:
        raise LLMError("API-Schlüssel fehlt.")

    if p == "ollama":
        payload = {"model": model, "stream": False, "options": {"temperature": 0},
                   "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        if json_mode:
            payload["format"] = "json"
        out = _post(f"{base}/api/chat", payload, {}, timeout)
        return out.get("message", {}).get("content", "")

    if p == "anthropic":
        payload = {"model": model, "max_tokens": max_tokens, "system": system,
                   "messages": [{"role": "user", "content": user}]}
        out = _post(f"{base}/v1/messages", payload, {"x-api-key": key, "anthropic-version": "2023-06-01"}, timeout)
        return "".join(part.get("text", "") for part in out.get("content", []) if part.get("type") == "text")

    if p == "gemini":
        payload = {"systemInstruction": {"parts": [{"text": system}]},
                   "contents": [{"role": "user", "parts": [{"text": user}]}],
                   "generationConfig": {"temperature": 0, "maxOutputTokens": max_tokens}}
        if json_mode:
            payload["generationConfig"]["responseMimeType"] = "application/json"
        out = _post(f"{base}/v1beta/models/{model}:generateContent", payload, {"x-goog-api-key": key}, timeout)
        cands = out.get("candidates") or []
        if not cands:
            raise LLMError(f"Leere Antwort: {json.dumps(out)[:300]}")
        return "".join(part.get("text", "") for part in cands[0].get("content", {}).get("parts", []))

    # OpenAI, OpenRouter and local OpenAI-compatible servers
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    if p == "openrouter":
        headers.update({"HTTP-Referer": "https://nexonai.ro", "X-Title": "NexonGraph"})
    payload = {"model": model, "temperature": 0, "max_tokens": max_tokens,
               "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    if json_mode and p in ("openai", "openrouter"):
        payload["response_format"] = {"type": "json_object"}
    out = _post(f"{base}/chat/completions", payload, headers, timeout)
    choices = out.get("choices") or []
    if not choices:
        raise LLMError(f"Leere Antwort: {json.dumps(out)[:300]}")
    return choices[0].get("message", {}).get("content", "") or ""


def parse_json(text: str) -> dict:
    """Reads the first JSON object from a model answer, also when wrapped in ``` fences."""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1).strip()
    start = text.find("{")
    if start < 0:
        raise ValueError("no JSON object")
    depth, in_str, esc = 0, False, False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])
    raise ValueError("unterminated JSON object")


def test_connection(cfg: dict) -> str:
    answer = complete(cfg, "Answer with exactly one word.", "Say OK.", timeout=60, max_tokens=10)
    return answer.strip()[:80] or "(leer)"
