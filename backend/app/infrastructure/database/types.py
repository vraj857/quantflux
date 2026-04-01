import json
from sqlalchemy.types import TypeDecorator, String
from app.infrastructure.security.encryption import security_engine

class EncryptedString(TypeDecorator):
    """
    Transparently encrypts Python strings into Envelope Ciphertext JSON for the database,
    and decrypts them back into Python strings upon read.
    """
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        # Use the EnvelopeEncryption engine
        payload = security_engine.encrypt(value)
        # Store the payload (encrypted_data, wrapped_dek, iv) as a JSON string in the DB column
        return json.dumps(payload)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        
        # Legacy/Fallback check: If it's not a JSON dict, it might be plaintext or an old token
        try:
            payload = json.loads(value)
            if isinstance(payload, dict) and "wrapped_dek" in payload and "iv" in payload:
                # Proper encrypted payload, decode it
                decrypted = security_engine.decrypt(
                    encrypted_data=payload["encrypted_data"],
                    wrapped_dek=payload["wrapped_dek"],
                    iv=payload["iv"]
                )
                return decrypted
            return value # Fallback if JSON but no envelope structure
        except (json.JSONDecodeError, KeyError, Exception) as e:
            # If it's not JSON, or decryption fails, assume it's legacy plaintext
            return value
