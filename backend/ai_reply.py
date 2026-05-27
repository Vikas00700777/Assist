import base64
import json
import re
import threading

from google import genai
from google.genai import types

from config import Config


MODEL_NAME = "gemini-2.5-flash"
_client_index = 0
_client_lock = threading.Lock()


def get_gemini_client():
    global _client_index

    if not Config.GEMINI_API_KEYS:
        raise ValueError("No Gemini API keys are configured.")

    with _client_lock:
        api_key = Config.GEMINI_API_KEYS[_client_index]
        _client_index = (_client_index + 1) % len(Config.GEMINI_API_KEYS)

    return genai.Client(api_key=api_key)


def _run_with_key_rotation(operation):
    if not Config.GEMINI_API_KEYS:
        raise ValueError("No Gemini API keys are configured.")

    errors = []

    for _ in Config.GEMINI_API_KEYS:
        client = get_gemini_client()

        try:
            return operation(client)
        except Exception as error:
            errors.append(error)

    raise RuntimeError("All Gemini API keys failed. Please check your Gemini API keys and quota.") from errors[-1]


def clean_reply(reply):
    cleaned = str(reply or "").strip()
    cleaned = re.sub(r"^\s*(?:[-*]|\d+[.)])\s*", "", cleaned)
    cleaned = cleaned.strip().strip("\"'")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    return cleaned[:280]


def _dedupe_replies(replies):
    unique_replies = []
    seen = set()

    for reply in replies:
        cleaned = clean_reply(reply)
        normalized = cleaned.casefold()

        if cleaned and normalized not in seen:
            seen.add(normalized)
            unique_replies.append(cleaned)

    return unique_replies


def parse_replies(output_text):
    output_text = str(output_text or "").strip()
    output_text = re.sub(r"^```(?:json)?\s*|\s*```$", "", output_text)

    replies = []
    try:
        parsed = json.loads(output_text)
        if isinstance(parsed, dict):
            replies = parsed.get("replies", [])
        elif isinstance(parsed, list):
            replies = parsed
    except json.JSONDecodeError:
        replies = output_text.splitlines()

    return _dedupe_replies(replies)[:3]


def _build_replies_prompt(text, tone, fallback=False):
    fallback_instruction = (
        "The previous response did not include 3 usable unique replies. "
        "Try again with clearer, distinct, safe suggestions that follow every rule below.\n\n"
        if fallback
        else ""
    )

    return f"""
{fallback_instruction}Generate exactly 3 short reply suggestions for X/Twitter.

Tone: {tone}
Post or message:
{text}

Rules:
- Return only valid JSON in this exact shape:
  {{"replies": ["reply one", "reply two", "reply three"]}}
- Each reply must be under 280 characters.
- Make all 3 replies meaningfully different.
- Make replies suitable for X/Twitter.
- Do not include spam, engagement bait, scams, phishing, deceptive claims, or illegal activity.
- Do not include abuse, hate, harassment, slurs, threats, intimidation, doxxing, or private personal data.
- Do not help with violence, self-harm, sexual exploitation, cyber abuse, fraud, weapons, or other unsafe content.
- If the original text is rude, toxic, hateful, or baiting, generate calm, respectful replies.
- If the original text asks for harmful or illegal content, generate safe neutral replies that do not assist wrongdoing.
- Keep the replies helpful, natural, and non-escalating.
"""


def _request_replies_from_gemini(text, tone, fallback=False):
    prompt = _build_replies_prompt(text, tone, fallback=fallback)

    response = _run_with_key_rotation(
        lambda client: client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
    )

    return parse_replies(response.text or "")


def generate_replies(text, tone):
    replies = _request_replies_from_gemini(text, tone)

    if len(replies) != 3:
        fallback_replies = _request_replies_from_gemini(text, tone, fallback=True)
        replies = _dedupe_replies([*replies, *fallback_replies])[:3]

    if len(replies) < 3:
        raise RuntimeError("Gemini returned fewer than 3 usable unique replies after fallback.")

    return replies


def _parse_image_data_url(image_data_url):
    match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", image_data_url)

    if not match:
        raise ValueError("Invalid image data URL.")

    mime_type = match.group(1)
    image_bytes = base64.b64decode(match.group(2), validate=True)

    return mime_type, image_bytes


def extract_text_from_image(image_data_url):
    mime_type, image_bytes = _parse_image_data_url(image_data_url)

    response = _run_with_key_rotation(
        lambda client: client.models.generate_content(
            model=MODEL_NAME,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                (
                    "Extract only readable text from this screenshot or image. "
                    "Return only the extracted text. If no readable text is found, "
                    "return exactly: No readable text found"
                ),
            ],
        )
    )

    extracted_text = (response.text or "").strip()

    return extracted_text or "No readable text found"
