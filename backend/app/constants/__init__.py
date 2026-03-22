"""
Centralized constants for the QuantFlux platform.
"""

# Market Session Timings (IST)
MARKET_START = "09:15"
MARKET_END = "15:30"

# 25-Minute Slot Configuration (Total 15 slots)
SLOT_SIZE_MINUTES = 25
TIME_SLOTS_25 = [
    "09:15", "09:40", "10:05", "10:30", "10:55",
    "11:20", "11:45", "12:10", "12:35", "13:00",
    "13:25", "13:50", "14:15", "14:40", "15:05"
]

# Market Holidays for 2026 (NSE)
# Note: 2026-03-20 is NOT a holiday (Restored to Live)
NSE_HOLIDAYS_2026 = {
    "2026-01-26", # Republic Day
    "2026-03-06", # Holi
    "2026-04-01", # Annual Bank Closing
    "2026-04-02", # Mahavir Jayanti
    "2026-04-03", # Good Friday
    "2026-10-02", # Mahatma Gandhi Jayanti
    "2026-12-25", # Christmas
}
