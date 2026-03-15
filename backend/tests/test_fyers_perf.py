from fyers_apiv3 import fyersModel
import time
print("Imported fyersModel")
start = time.time()
session = fyersModel.SessionModel(
    client_id="test",
    secret_key="test",
    redirect_uri="http://test.com",
    response_type="code",
    grant_type="authorization_code"
)
print(f"SessionModel took {time.time() - start:.2f}s")
start = time.time()
url = session.generate_authcode()
print(f"generate_authcode took {time.time() - start:.2f}s")
print(f"URL: {url}")
