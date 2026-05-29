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
TONE_INSTRUCTIONS = {
    "friendly": (
        "Friendly: warm, casual, approachable, and conversational. Use simple words, "
        "light enthusiasm, and a human social tone. Sound like a real person."
    ),
    "professional": (
        "Professional: clear, respectful, and composed, but still easy to understand. "
        "Avoid corporate wording, complex phrases, slang, jokes, and excessive emotion."
    ),
    "funny": (
        "Funny: playful and lightly humorous. Use simple jokes or casual wit, "
        "but do not be mean, cringe, offensive, or overdo it."
    ),
    "short": (
        "Short: very concise, simple, and natural. Keep each reply to one short sentence, "
        "ideally under 12 words. No filler, high-level words, or long explanations."
    ),
    "supportive": (
        "Supportive: encouraging, kind, and emotionally steady. Use simple words. Sound like "
        "someone naturally backing the person up without being dramatic."
    ),
    "hinglish": (
        "Hinglish: use natural Roman Hindi-English mix, like casual Indian social media. "
        "Do not write in Devanagari. Keep it easy, conversational, simple, and not forced."
    ),
}

GLOBAL_REPLY_STYLE_RULES = """
Style for every reply:
- Sound conversational, human, and easy to understand.
- Use simple everyday words. Avoid technical, fancy, corporate, or high-level vocabulary.
- Keep the replies natural for X/Twitter, like something a real person would type.
- Some replies can include one light emoji if it fits, but not all replies should use emoji.
- Never force emoji. Do not use more than one emoji in a reply.
- Mix the wording: some replies with emoji, some without, some very short, some slightly warmer.
- Do not sound robotic, motivational-poster-like, or overly polished.
"""


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


def get_tone_instruction(tone):
    normalized_tone = str(tone or "friendly").strip().lower()

    return TONE_INSTRUCTIONS.get(normalized_tone, TONE_INSTRUCTIONS["friendly"])


def normalize_reply_inputs(text, context):
    normalized_text = str(text or "").strip()
    normalized_context = str(context or "").strip()

    if normalized_text and normalized_context and normalized_text == normalized_context:
        return "", normalized_context

    return normalized_text, normalized_context


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

    text, context = normalize_reply_inputs(text, context)
    tone_instruction = get_tone_instruction(tone)

    return f"""
{fallback_instruction}You are helping the user write replies on X.
Generate replies the user can post as a viewer/commenter, not as the original author.
Use the original post context to understand what the post means.
If a reply/comment to answer is provided, answer that comment using the original context.
If no reply/comment is provided, generate natural replies to the original post itself.
Infer X/social-media meaning from short phrases, numbers, profile stats, milestones, sarcasm, and implied context.
Examples of implied meaning:
- "2 more" near 398 followers means the person needs 2 more followers to reach 400.
- "1 more" near 999 followers means one away from 1K.
- Profile screenshots, follower counts, dates, and captions are part of the post meaning.
Do not make generic replies that ignore the specific post.
Do not be rude.
Keep replies natural and human-like.

Original Post / Context:
{context}

Reply or Comment to Answer:
{text}

Mandatory Tone Style:
{tone_instruction}

{GLOBAL_REPLY_STYLE_RULES}

Generate exactly 10 replies.

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
- Make the selected tone obvious in every reply.
- Do not use the same generic friendly style for every tone.
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

    text, context = normalize_reply_inputs(text, context)
    tone_instruction = get_tone_instruction(tone)

    return f"""
{fallback_instruction}You are helping the user write replies on X.
Analyze the full post using:
1. Original Post / Context text
2. Reply or Comment to Answer
3. Uploaded image or meme screenshot

Important:
- Generate replies the user can post as a viewer/commenter, not as the original author.
- Understand visible text in the image.
- Understand meme meaning, joke, sarcasm, screenshot context, and image content.
- Infer the actual intent of short X captions from the image. For example, "2 more" with 398 followers means the person is 2 followers away from 400.
- Treat profile screenshots, follower counts, dates, usernames, verification badges, and captions as meaningful context.
- If the post combines a small text caption with an image, connect them before writing replies.
- If the image contains most of the meaning, use it.
- If context text and image disagree, prioritize visible image/post content.
- Directly answer the reply/comment if provided.
- If no reply/comment is provided, generate general replies to the post.
- Avoid vague replies like "you know it", "working on those", or "spot on" unless they clearly fit the post.
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

Mandatory Tone Style:
{tone_instruction}

{GLOBAL_REPLY_STYLE_RULES}

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

Rules:
- Make all 10 replies meaningfully different.
- Make the selected tone obvious in every reply.
- Do not use the same generic friendly style for every tone.
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
                    "Extract readable text from this X screenshot or image. "
                    "Preserve short captions, profile stats, follower counts, dates, and visible labels. "
                    "If there is an obvious implied meaning, add one short line starting with Meaning:. "
                    "Example: if the image shows 398 followers and the caption says '2 more', "
                    "write Meaning: 2 more followers needed to reach 400. "
                    "If no readable text is found, return exactly: No readable text found"
                ),
            ],
        )
    )

    extracted_text = (response.text or "").strip()

    return extracted_text or "No readable text found"
