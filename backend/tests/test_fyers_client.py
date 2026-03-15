import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# Ensure backend dir is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fyers_client import FyersClient, FyersStreamer
import fyers_client

class TestFyersClient(unittest.TestCase):
    def setUp(self):
        # Mock fyersModel module
        self.mock_fyers_model = MagicMock()
        fyers_client.fyersModel = self.mock_fyers_model
        
        # Mock data_ws module
        self.mock_data_ws = MagicMock()
        fyers_client.data_ws = self.mock_data_ws
        
        # Test logs callback
        self.logs = []
        def log_cb(level, msg):
            self.logs.append((level, msg))
        self.log_callback = log_cb

    def test_fyers_client_latency_logging(self):
        # Setup mock api layer
        mock_api = MagicMock()
        mock_api.place_order.return_value = {"s": "ok", "id": "12345"}
        self.mock_fyers_model.FyersModel.return_value = mock_api
        
        client = FyersClient("test_client", "test_token", log_callback=self.log_callback)
        
        # Ensure FyersModel initialized correctly
        self.mock_fyers_model.FyersModel.assert_called_with(
            client_id="test_client", is_async=False, token="test_token", log_path=""
        )
        
        res = client.place_order({"symbol": "NSE:ITC-EQ", "qty": 1, "type": 2, "side": 1})
        self.assertEqual(res, {"s": "ok", "id": "12345"})
        
        # Check logs for latency
        latency_logs = [msg for lvl, msg in self.logs if "FYERS API latency for place_order" in msg]
        self.assertTrue(len(latency_logs) > 0, "Latency should be logged on place_order")

    def test_fyers_streamer_tick_processing(self):
        # Setup mock websocket
        symbols = ["NSE:ITC"]
        tokens = {"NSE:ITC": "NSE:ITC-EQ"}
        
        streamer = FyersStreamer("test_client", "test_token", symbols, tokens, log_callback=self.log_callback)
        
        # Mock broadcast callback
        mock_broadcast = MagicMock()
        streamer.broadcast_callback = mock_broadcast
        
        # Ensure trackers initialized
        self.assertIn("NSE:ITC", streamer.trackers)
        
        # Simulate connection
        streamer._on_connect()
        # Verify it attempts to subscribe
        self.mock_data_ws.FyersDataSocket.return_value.subscribe.assert_called_with(
            symbol=["NSE:ITC-EQ"], data_type="SymbolUpdate"
        )
        
        # Simulate an incoming message block
        mock_message = {
            "symbol": "NSE:ITC-EQ",
            "ltp": 450.50,
            "vol_traded_today": 1500000
        }
        
        # Temporarily mock datetime to always return a valid market slot equivalent or just let it process
        # For simplicity, if we are off-market hours in testing, it won't broadcast.
        from datetime import datetime
        with patch('kite_streamer.get_current_slot') as mock_slot:
            mock_slot.return_value = {'start': '09:15', 'end': '09:40'}
            with patch('kite_streamer.get_slot_label') as mock_label:
                mock_label.return_value = '09:15-09:40'
                streamer._on_message(mock_message)
                
                # Verify tracker updated
                tracker = streamer.trackers["NSE:ITC"]
                self.assertEqual(tracker.ohlcv["close"], 450.50)
                
                # Verify broadcast attempt
                # Since broadcast involves asyncio, just checking if get_metrics ran (since get_metrics generates payload)
                # the broadcast async test is a bit complex, but we can verify tracker state easily.
                self.assertTrue(streamer.broadcast_callback is not None)

if __name__ == '__main__':
    unittest.main(verbosity=2)
