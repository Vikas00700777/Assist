import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import Flask, jsonify
from flask_cors import CORS

from config import Config
from routes.reply_routes import reply_bp


def configure_logging(app):
    log_dir = Path(__file__).resolve().parent / "logs"
    log_dir.mkdir(exist_ok=True)

    file_handler = RotatingFileHandler(
        log_dir / "app.log",
        maxBytes=1024 * 1024,
        backupCount=3,
    )
    file_handler.setLevel(logging.ERROR)
    file_handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    ))

    app.logger.addHandler(file_handler)
    app.logger.setLevel(logging.ERROR)


def create_app():
    app = Flask(__name__)
    CORS(app)
    configure_logging(app)

    app.register_blueprint(reply_bp)

    @app.get("/health")
    def health():
        return jsonify({
            "success": True,
            "status": "ok",
            "message": "X Assistant backend is running",
        })

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=Config.FLASK_PORT, debug=True)
