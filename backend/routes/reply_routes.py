from flask import Blueprint, current_app, jsonify, request

from ai_reply import extract_text_from_image, generate_replies as create_reply_suggestions
from config import Config


reply_bp = Blueprint("reply", __name__)

ALLOWED_TONES = {
    "friendly",
    "professional",
    "funny",
    "short",
    "supportive",
    "hinglish",
}
MAX_TEXT_LENGTH = 5000
MAX_TOTAL_TEXT_LENGTH = 8000
MAX_IMAGE_DATA_LENGTH = 8000000


def _get_json_body():
    data = request.get_json(silent=True)

    if data is None:
        return None, (jsonify({"success": False, "error": "JSON request body is required."}), 400)

    if not isinstance(data, dict):
        return None, (jsonify({"success": False, "error": "JSON request body must be an object."}), 400)

    return data, None


@reply_bp.post("/api/generate-replies")
def generate_replies():
    data, error_response = _get_json_body()

    if error_response:
        return error_response

    text = data.get("text")
    context = data.get("context", "")
    tone = data.get("tone", "friendly")

    if not isinstance(text, str):
        return jsonify({"success": False, "error": "Text must be a string."}), 400

    if not isinstance(context, str):
        return jsonify({"success": False, "error": "Context must be a string."}), 400

    text = text.strip()
    context = context.strip()

    if not text:
        return jsonify({"success": False, "error": "Text is required."}), 400

    if len(text) > MAX_TEXT_LENGTH:
        return jsonify({"success": False, "error": "Text is too long."}), 400

    if len(text) + len(context) > MAX_TOTAL_TEXT_LENGTH:
        return jsonify({"success": False, "error": "Context and text are too long."}), 400

    if not isinstance(tone, str):
        tone = "friendly"

    tone = tone.strip().lower()

    if tone not in ALLOWED_TONES:
        tone = "friendly"

    if not Config.GEMINI_API_KEYS:
        return jsonify({"success": False, "error": "Gemini API key is not configured."}), 500

    try:
        replies = create_reply_suggestions(text, tone, context)
    except Exception as error:
        current_app.logger.exception(error)
        return jsonify({"success": False, "error": "Failed to generate replies."}), 500

    return jsonify({"success": True, "replies": replies})


@reply_bp.post("/api/extract-text")
def extract_text():
    data, error_response = _get_json_body()

    if error_response:
        return error_response

    image_data = data.get("imageData")

    if not isinstance(image_data, str):
        return jsonify({"success": False, "error": "Image data must be a string."}), 400

    image_data = image_data.strip()

    if not image_data:
        return jsonify({"success": False, "error": "Image data is required."}), 400

    if not image_data.startswith("data:image/"):
        return jsonify({"success": False, "error": "Image data must be a valid image data URL."}), 400

    if len(image_data) > MAX_IMAGE_DATA_LENGTH:
        return jsonify({"success": False, "error": "Image data is too large."}), 400

    if not Config.GEMINI_API_KEYS:
        return jsonify({"success": False, "error": "Gemini API key is not configured."}), 500

    try:
        text = extract_text_from_image(image_data)
    except Exception as error:
        current_app.logger.exception(error)
        return jsonify({"success": False, "error": "Failed to extract text from image."}), 500

    return jsonify({"success": True, "text": text})
