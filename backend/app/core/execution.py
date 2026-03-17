import logging
from typing import Dict, Any, Optional
from datetime import datetime

class OrderManager:
    """
    Handles order placement, Stop-Loss tracking, and Trade Lifecycle.
    Bridges the Sentinel signals to the Broker APIs.
    """
    
    def __init__(self):
        self.active_positions = {} # symbol -> position_info
        self.order_history = []

    async def place_phase_order(self, symbol: str, side: str, quantity: int, stop_loss_pct: float = 1.0):
        """
        Places a real or paper order based on a phase signal.
        side: 'BUY' or 'SELL'
        """
        from app.state import state
        if not state.active_broker:
            logging.error("No active broker to place order.")
            return None

        logging.info(f"🚀 Placing Phase Order: {side} {quantity} units of {symbol}")
        
        try:
            # Standardized order request (Adapters must implement this)
            # In a real scenario, we'd use bracket orders or separate SL orders.
            order_params = {
                "symbol": symbol,
                "qty": quantity,
                "type": 2, # Market for now
                "side": 1 if side == 'BUY' else -1,
                "productType": "INTRADAY"
            }
            
            # This is a mock/placeholder until broker adapters have place_order
            # res = await state.active_broker.place_order(order_params)
            
            res = {"status": "success", "id": f"ORD-{int(datetime.now().timestamp())}"}
            
            if res.get("status") == "success":
                pos_id = res.get("id")
                self.active_positions[symbol] = {
                    "id": pos_id,
                    "side": side,
                    "qty": quantity,
                    "entry_price": 0.0, # Will be updated via tick/callback
                    "sl_price": 0.0,
                    "entry_time": datetime.now()
                }
                self.order_history.append(self.active_positions[symbol])
                return pos_id
        except Exception as e:
            logging.error(f"Order placement failed for {symbol}: {e}")
            return None

    async def close_position(self, symbol: str):
        """Closes an active position."""
        if symbol in self.active_positions:
            logging.info(f"🛑 Closing position for {symbol}")
            del self.active_positions[symbol]
            return True
        return False
        
    def get_summary(self):
        return {
            "active_count": len(self.active_positions),
            "history_count": len(self.order_history),
            "positions": self.active_positions
        }
