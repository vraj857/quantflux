import sys
import os
from loguru import logger

def setup_logging():
    """Configures Loguru for structured JSON logging and console output."""
    logger.remove() # Remove default handler
    
    # Console Handler (Human Readable)
    logger.add(
        sys.stdout, 
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level="INFO"
    )
    
    # File Handler (JSON for production ingestion)
    from config import LOGS_DIR
    app_log_path = os.path.join(LOGS_DIR, "app", "quantflux_json.log")
    os.makedirs(os.path.dirname(app_log_path), exist_ok=True)
    
    logger.add(
        app_log_path,
        serialize=True,
        rotation="10 MB",
        retention="10 days",
        level="DEBUG"
    )

# Shortcut export
ql_logger = logger
