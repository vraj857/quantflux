import os
import base64
from typing import Tuple, Dict
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

class MockKMS:
    """
    Mock Key Management Service for Enterprise Key Rotation.
    In production, this would interface with AWS KMS, Hashicorp Vault, or Azure KeyVault.
    """
    def __init__(self):
        # Master Key would be stored in an Environment Variable or Secrets Manager
        raw_key = os.getenv("QUANTFLUX_MASTER_KEY", "quantflux_enterprise_master_secret")
        # Normalize to exactly 32 bytes (256 bits) for AES-256-GCM
        self._master_key = raw_key.encode().ljust(32, b"0")[:32]

    def get_dek(self) -> bytes:
        """Generates a new Data Encryption Key (DEK)."""
        return AESGCM.generate_key(bit_length=256)

    def encrypt_dek(self, dek: bytes) -> str:
        """Wraps the DEK using the Master Key."""
        aesgcm = AESGCM(self._master_key)
        nonce = os.urandom(12)
        encrypted = aesgcm.encrypt(nonce, dek, None)
        return base64.b64encode(nonce + encrypted).decode('utf-8')

    def decrypt_dek(self, wrapped_dek: str) -> bytes:
        """Unwraps the DEK using the Master Key."""
        data = base64.b64decode(wrapped_dek)
        nonce, ciphertext = data[:12], data[12:]
        aesgcm = AESGCM(self._master_key)
        return aesgcm.decrypt(nonce, ciphertext, None)

class EnvelopeEncryption:
    """
    Implements Envelope Encryption for sensitive data.
    Each record is encrypted with a unique DEK, which is then wrapped by a Master Key.
    """
    def __init__(self):
        self.kms = MockKMS()

    def encrypt(self, plaintext: str) -> Dict[str, str]:
        """
        Encrypts plaintext using a fresh DEK.
        Returns payload containing: encrypted_content, wrapped_dek, iv
        """
        dek = self.kms.get_dek()
        aesgcm = AESGCM(dek)
        nonce = os.urandom(12)
        
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
        
        return {
            "encrypted_data": base64.b64encode(ciphertext).decode('utf-8'),
            "wrapped_dek": self.kms.encrypt_dek(dek),
            "iv": base64.b64encode(nonce).decode('utf-8')
        }

    def decrypt(self, encrypted_data: str, wrapped_dek: str, iv: str) -> str:
        """Decrypts content by unwrapping the DEK."""
        dek = self.kms.decrypt_dek(wrapped_dek)
        aesgcm = AESGCM(dek)
        
        nonce = base64.b64decode(iv)
        ciphertext = base64.b64decode(encrypted_data)
        
        decrypted = aesgcm.decrypt(nonce, ciphertext, None)
        return decrypted.decode('utf-8')

# Global encryption handle
security_engine = EnvelopeEncryption()
