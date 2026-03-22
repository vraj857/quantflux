import logging
import json
import os
from datetime import datetime
from typing import Any, Dict
from pythonjsonlogger import jsonlogger

class AuditLogger:
    """
    Standardized Enterprise Audit Logger.
    Outputs JSON formatted logs for ELK/CloudWatch ingestion.
    """
    def __init__(self, name: str = "quantflux.audit"):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)
        
        # Avoid duplicate handlers
        if not self.logger.handlers:
            log_dir = "logs/security"
            os.makedirs(log_dir, exist_ok=True)
            
            # File Handler for persistence
            file_handler = logging.FileHandler(os.path.join(log_dir, "audit_trail.json"))
            
            # JSON Formatter
            formatter = jsonlogger.JsonFormatter(
                fmt='%(timestamp)s %(user_id)s %(action)s %(broker)s %(ip_address)s %(status)s %(message)s',
                json_ensure_ascii=False
            )
            file_handler.setFormatter(formatter)
            self.logger.addHandler(file_handler)
            
            # Stream Handler for console/container logs
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(formatter)
            self.logger.addHandler(console_handler)

    def log_event(
        self, 
        action: str, 
        user_id: str = "anonymous", 
        broker: str = "N/A", 
        ip_address: str = "0.0.0.0", 
        status: str = "SUCCESS", 
        message: str = "",
        extra: Dict[str, Any] = None
    ):
        """Captures an audit event with standard context."""
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "user_id": user_id,
            "action": action,
            "broker": broker,
            "ip_address": ip_address,
            "status": status
        }
        if extra:
            log_data.update(extra)
            
        self.logger.info(message, extra=log_data)

# Global Audit Engine
audit_log = AuditLogger()
