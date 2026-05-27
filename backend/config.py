import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    GEMINI_API_KEYS = [
        key.strip()
        for key in [
            os.getenv("GEMINI_API_KEY_1"),
            os.getenv("GEMINI_API_KEY_2"),
            os.getenv("GEMINI_API_KEY_3"),
            os.getenv("GEMINI_API_KEY_4"),
        ]
        if key and key.strip()
    ]
    FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))
