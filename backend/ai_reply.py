import base64
import json
import re
import threading

from google import genai
from google.genai import types

from config import Config


MODEL_NAME = "gemini-2.5-flash"
REPLY_COUNT = 10
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

    return _dedupe_replies(replies)[:REPLY_COUNT]


def _build_replies_prompt(text, tone, context="", fallback=False):
    fallback_instruction = (
        "The previous response did not include 10 usable unique replies. "
        "Try again with clearer, distinct, safe suggestions that follow every rule below.\n\n"
        if fallback
        else ""
    )

    return f"""
{fallback_instruction}You are helping the user reply to someone on X.
The user may provide original post context and a reply/comment.
Generate replies as the original post author.
Use the context to understand the situation.
Directly answer the reply/comment.
Do not ignore the reply/comment.
Do not be rude.
Keep replies natural and human-like.

Original Post / Context:
{context}

Reply or Comment to Answer:
{text}

Tone:
{tone}

Generate exactly 10 replies that answer the reply/comment using the original context.

Rules:
- Return only valid JSON in this exact shape:
  {{
    "replies": [
      "reply one",
      "reply two",
      "reply three",
      "reply four",
      "reply five",
      "reply six",
      "reply seven",
      "reply eight",
      "reply nine",
      "reply ten"
    ]
  }}
- Each reply must be under 280 characters.
- Make all 10 replies meaningfully different.
- Make replies suitable for X/Twitter.
- Do not include spam, engagement bait, scams, phishing, deceptive claims, or illegal activity.
- Do not include abuse, hate, harassment, slurs, threats, intimidation, doxxing, or private personal data.
- Do not help with violence, self-harm, sexual exploitation, cyber abuse, fraud, weapons, or other unsafe content.
- If the original text is rude, toxic, hateful, or baiting, generate calm, respectful replies.
- If the original text asks for harmful or illegal content, generate safe neutral replies that do not assist wrongdoing.
- Keep the replies helpful, natural, and non-escalating.
"""


def _build_multimodal_replies_prompt(text, tone, context="", fallback=False):
    fallback_instruction = (
        "The previous response did not include 10 usable unique replies. "
        "Try again with clearer, distinct, safe suggestions that follow every rule below.\n\n"
        if fallback
        else ""
    )

    return f"""
{fallback_instruction}You are helping the user reply on X.
Analyze the full post using:
1. Original Post / Context text
2. Reply or Comment to Answer
3. Uploaded image or meme screenshot

Important:
- Understand visible text in the image.
- Understand meme meaning, joke, sarcasm, screenshot context, and image content.
- If the image contains most of the meaning, use it.
- If context text and image disagree, prioritize visible image/post content.
- Generate replies as the original post author.
- Directly answer the reply/comment if provided.
- If no reply/comment is provided, generate general replies to the post.
- Do not be rude.
- Keep replies natural, short, and suitable for X.
- Generate exactly 10 replies.
- Each reply must be under 280 characters.
- Return valid JSON only.
- Do not include spam, engagement bait, scams, phishing, deceptive claims, or illegal activity.
- Do not include abuse, hate, harassment, slurs, threats, intimidation, doxxing, or private personal data.
- Do not help with violence, self-harm, sexual exploitation, cyber abuse, fraud, weapons, or other unsafe content.
- If the post or image is rude, toxic, hateful, or baiting, generate calm, respectful replies.
- If the post or image asks for harmful or illegal content, generate safe neutral replies that do not assist wrongdoing.

Original Post / Context:
{context}

Reply or Comment to Answer:
{text}

Tone:
{tone}

Return only valid JSON in this exact shape:
{{
  "replies": [
    "reply one",
    "reply two",
    "reply three",
    "reply four",
    "reply five",
    "reply six",
    "reply seven",
    "reply eight",
    "reply nine",
    "reply ten"
  ]
}}
"""


def _request_replies_from_gemini(text, tone, context="", fallback=False, image_data_url=""):
    prompt = _build_replies_prompt(text, tone, context=context, fallback=fallback)
    contents = prompt

    if image_data_url:
        mime_type, image_bytes = _parse_image_data_url(image_data_url)
        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            _build_multimodal_replies_prompt(text, tone, context=context, fallback=fallback),
        ]

    response = _run_with_key_rotation(
        lambda client: client.models.generate_content(
            model=MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
    )

    return parse_replies(response.text or "")


def generate_replies(text, tone, context="", image_data_url=""):
    replies = _request_replies_from_gemini(text, tone, context=context, image_data_url=image_data_url)

    if len(replies) < REPLY_COUNT:
        fallback_replies = _request_replies_from_gemini(
            text,
            tone,
            context=context,
            fallback=True,
            image_data_url=image_data_url,
        )
        replies = _dedupe_replies([*replies, *fallback_replies])

    return replies[:REPLY_COUNT]


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
