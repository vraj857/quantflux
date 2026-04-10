from sqlalchemy import select
from app.models.instrument import Instrument
from sqlalchemy.ext.asyncio import AsyncSession
import logging

class FnoSyncManager:
    """
    Manages the F&O instrument database with lot sizes.
    
    Source: Accurate lot sizes from CSV in quantFlux/Files (matching Dhan Apr-Jun 2026 series).
    """

    # ─── Accurate SEED_DATA (Apr 2026 Lot Sizes) ────────────────────────────
    SEED_DATA = {
        "360ONE":         {"lot": 500, "type": "STOCK"},
        "ABB":            {"lot": 125, "type": "STOCK"},
        "ABCAPITAL":      {"lot": 3100, "type": "STOCK"},
        "ADANIENSOL":     {"lot": 675, "type": "STOCK"},
        "ADANIENT":       {"lot": 309, "type": "STOCK"},
        "ADANIGREEN":     {"lot": 600, "type": "STOCK"},
        "ADANIPORTS":     {"lot": 475, "type": "STOCK"},
        "ADANIPOWER":     {"lot": 3550, "type": "STOCK"},
        "ALKEM":          {"lot": 125, "type": "STOCK"},
        "AMBER":          {"lot": 100, "type": "STOCK"},
        "AMBUJACEM":      {"lot": 1050, "type": "STOCK"},
        "ANGELONE":       {"lot": 2500, "type": "STOCK"},
        "APLAPOLLO":      {"lot": 350, "type": "STOCK"},
        "APOLLOHOSP":     {"lot": 125, "type": "STOCK"},
        "ASHOKLEY":       {"lot": 5000, "type": "STOCK"},
        "ASIANPAINT":     {"lot": 250, "type": "STOCK"},
        "ASTRAL":         {"lot": 425, "type": "STOCK"},
        "AUBANK":         {"lot": 1000, "type": "STOCK"},
        "AUROPHARMA":     {"lot": 550, "type": "STOCK"},
        "AXISBANK":       {"lot": 625, "type": "STOCK"},
        "BAJAJ-AUTO":     {"lot": 75, "type": "STOCK"},
        "BAJAJFINSV":     {"lot": 250, "type": "STOCK"},
        "BAJAJHLDNG":     {"lot": 50, "type": "STOCK"},
        "BAJFINANCE":     {"lot": 750, "type": "STOCK"},
        "BANDHANBNK":     {"lot": 3600, "type": "STOCK"},
        "BANKBARODA":     {"lot": 2925, "type": "STOCK"},
        "BANKINDIA":      {"lot": 5200, "type": "STOCK"},
        "BANKNIFTY":      {"lot": 30, "type": "INDEX"},
        "BDL":            {"lot": 350, "type": "STOCK"},
        "BEL":            {"lot": 1425, "type": "STOCK"},
        "BHARATFORG":     {"lot": 500, "type": "STOCK"},
        "BHARTIARTL":     {"lot": 475, "type": "STOCK"},
        "BHEL":           {"lot": 2625, "type": "STOCK"},
        "BIOCON":         {"lot": 2500, "type": "STOCK"},
        "BLUESTARCO":     {"lot": 325, "type": "STOCK"},
        "BOSCHLTD":       {"lot": 25, "type": "STOCK"},
        "BPCL":           {"lot": 1975, "type": "STOCK"},
        "BRITANNIA":      {"lot": 125, "type": "STOCK"},
        "BSE":            {"lot": 375, "type": "STOCK"},
        "CAMS":           {"lot": 750, "type": "STOCK"},
        "CANBK":          {"lot": 6750, "type": "STOCK"},
        "CDSL":           {"lot": 475, "type": "STOCK"},
        "CGPOWER":        {"lot": 850, "type": "STOCK"},
        "CHOLAFIN":       {"lot": 625, "type": "STOCK"},
        "CIPLA":          {"lot": 375, "type": "STOCK"},
        "COALINDIA":      {"lot": 1350, "type": "STOCK"},
        "COCHINSHIP":     {"lot": 400, "type": "STOCK"},
        "COFORGE":        {"lot": 375, "type": "STOCK"},
        "COLPAL":         {"lot": 225, "type": "STOCK"},
        "CONCOR":         {"lot": 1250, "type": "STOCK"},
        "CROMPTON":       {"lot": 1800, "type": "STOCK"},
        "CUMMINSIND":     {"lot": 200, "type": "STOCK"},
        "DABUR":          {"lot": 1250, "type": "STOCK"},
        "DALBHARAT":      {"lot": 325, "type": "STOCK"},
        "DELHIVERY":      {"lot": 2075, "type": "STOCK"},
        "DIVISLAB":       {"lot": 100, "type": "STOCK"},
        "DIXON":          {"lot": 50, "type": "STOCK"},
        "DLF":            {"lot": 825, "type": "STOCK"},
        "DMART":          {"lot": 150, "type": "STOCK"},
        "DRREDDY":        {"lot": 625, "type": "STOCK"},
        "EICHERMOT":      {"lot": 100, "type": "STOCK"},
        "ETERNAL":        {"lot": 2425, "type": "STOCK"},
        "EXIDEIND":       {"lot": 1800, "type": "STOCK"},
        "FEDERALBNK":     {"lot": 5000, "type": "STOCK"},
        "FINNIFTY":       {"lot": 60, "type": "INDEX"},
        "FORCEMOT":       {"lot": 25, "type": "STOCK"},
        "FORTIS":         {"lot": 775, "type": "STOCK"},
        "GAIL":           {"lot": 3150, "type": "STOCK"},
        "GLENMARK":       {"lot": 375, "type": "STOCK"},
        "GMRAIRPORT":     {"lot": 6975, "type": "STOCK"},
        "GODFRYPHLP":     {"lot": 275, "type": "STOCK"},
        "GODREJCP":       {"lot": 500, "type": "STOCK"},
        "GODREJPROP":     {"lot": 275, "type": "STOCK"},
        "GRASIM":         {"lot": 250, "type": "STOCK"},
        "HAL":            {"lot": 150, "type": "STOCK"},
        "HAVELLS":        {"lot": 500, "type": "STOCK"},
        "HCLTECH":        {"lot": 350, "type": "STOCK"},
        "HDFCAMC":        {"lot": 300, "type": "STOCK"},
        "HDFCBANK":       {"lot": 550, "type": "STOCK"},
        "HDFCLIFE":       {"lot": 1100, "type": "STOCK"},
        "HEROMOTOCO":     {"lot": 150, "type": "STOCK"},
        "HINDALCO":       {"lot": 700, "type": "STOCK"},
        "HINDPETRO":      {"lot": 2025, "type": "STOCK"},
        "HINDUNILVR":     {"lot": 300, "type": "STOCK"},
        "HINDZINC":       {"lot": 1225, "type": "STOCK"},
        "HUDCO":          {"lot": 2775, "type": "STOCK"},
        "HYUNDAI":        {"lot": 275, "type": "STOCK"},
        "ICICIBANK":      {"lot": 700, "type": "STOCK"},
        "ICICIGI":        {"lot": 325, "type": "STOCK"},
        "ICICIPRULI":     {"lot": 925, "type": "STOCK"},
        "IDEA":           {"lot": 71475, "type": "STOCK"},
        "IDFCFIRSTB":     {"lot": 9275, "type": "STOCK"},
        "IEX":            {"lot": 3750, "type": "STOCK"},
        "INDHOTEL":       {"lot": 1000, "type": "STOCK"},
        "INDIANB":        {"lot": 1000, "type": "STOCK"},
        "INDIGO":         {"lot": 150, "type": "STOCK"},
        "INDUSINDBK":     {"lot": 700, "type": "STOCK"},
        "INDUSTOWER":     {"lot": 1700, "type": "STOCK"},
        "INFY":           {"lot": 400, "type": "STOCK"},
        "INOXWIND":       {"lot": 3575, "type": "STOCK"},
        "IOC":            {"lot": 4875, "type": "STOCK"},
        "IREDA":          {"lot": 3450, "type": "STOCK"},
        "IRFC":           {"lot": 4250, "type": "STOCK"},
        "ITC":            {"lot": 1600, "type": "STOCK"},
        "JINDALSTEL":     {"lot": 625, "type": "STOCK"},
        "JIOFIN":         {"lot": 2350, "type": "STOCK"},
        "JSWENERGY":      {"lot": 1000, "type": "STOCK"},
        "JSWSTEEL":       {"lot": 675, "type": "STOCK"},
        "JUBLFOOD":       {"lot": 1250, "type": "STOCK"},
        "KALYANKJIL":     {"lot": 1175, "type": "STOCK"},
        "KAYNES":         {"lot": 100, "type": "STOCK"},
        "KEI":            {"lot": 175, "type": "STOCK"},
        "KFINTECH":       {"lot": 500, "type": "STOCK"},
        "KOTAKBANK":      {"lot": 2000, "type": "STOCK"},
        "KPITTECH":       {"lot": 425, "type": "STOCK"},
        "LAURUSLABS":     {"lot": 850, "type": "STOCK"},
        "LICHSGFIN":      {"lot": 1000, "type": "STOCK"},
        "LICI":           {"lot": 700, "type": "STOCK"},
        "LODHA":          {"lot": 450, "type": "STOCK"},
        "LT":             {"lot": 175, "type": "STOCK"},
        "LTF":            {"lot": 2250, "type": "STOCK"},
        "LTM":            {"lot": 150, "type": "STOCK"},
        "LUPIN":          {"lot": 425, "type": "STOCK"},
        "M&M":            {"lot": 200, "type": "STOCK"},
        "MANAPPURAM":     {"lot": 3000, "type": "STOCK"},
        "MANKIND":        {"lot": 225, "type": "STOCK"},
        "MARICO":         {"lot": 1200, "type": "STOCK"},
        "MARUTI":         {"lot": 50, "type": "STOCK"},
        "MAXHEALTH":      {"lot": 525, "type": "STOCK"},
        "MAZDOCK":        {"lot": 200, "type": "STOCK"},
        "MCX":            {"lot": 625, "type": "STOCK"},
        "MFSL":           {"lot": 400, "type": "STOCK"},
        "MIDCPNIFTY":     {"lot": 120, "type": "INDEX"},
        "MOTHERSON":      {"lot": 6150, "type": "STOCK"},
        "MOTILALOFS":     {"lot": 775, "type": "STOCK"},
        "MPHASIS":        {"lot": 275, "type": "STOCK"},
        "MUTHOOTFIN":     {"lot": 275, "type": "STOCK"},
        "NAM-INDIA":      {"lot": 625, "type": "STOCK"},
        "NATIONALUM":     {"lot": 3750, "type": "STOCK"},
        "NAUKRI":         {"lot": 375, "type": "STOCK"},
        "NBCC":           {"lot": 6500, "type": "STOCK"},
        "NESTLEIND":      {"lot": 500, "type": "STOCK"},
        "NHPC":           {"lot": 6400, "type": "STOCK"},
        "NIFTY":          {"lot": 65, "type": "INDEX"},
        "NIFTYNXT50":     {"lot": 25, "type": "INDEX"},
        "NMDC":           {"lot": 6750, "type": "STOCK"},
        "NTPC":           {"lot": 1500, "type": "STOCK"},
        "NUVAMA":         {"lot": 500, "type": "STOCK"},
        "NYKAA":          {"lot": 3125, "type": "STOCK"},
        "OBEROIRLTY":     {"lot": 350, "type": "STOCK"},
        "OFSS":           {"lot": 75, "type": "STOCK"},
        "OIL":            {"lot": 1400, "type": "STOCK"},
        "ONGC":           {"lot": 2250, "type": "STOCK"},
        "PAGEIND":        {"lot": 15, "type": "STOCK"},
        "PATANJALI":      {"lot": 900, "type": "STOCK"},
        "PAYTM":          {"lot": 725, "type": "STOCK"},
        "PERSISTENT":     {"lot": 100, "type": "STOCK"},
        "PETRONET":       {"lot": 1900, "type": "STOCK"},
        "PFC":            {"lot": 1300, "type": "STOCK"},
        "PGEL":           {"lot": 950, "type": "STOCK"},
        "PHOENIXLTD":     {"lot": 350, "type": "STOCK"},
        "PIDILITIND":     {"lot": 500, "type": "STOCK"},
        "PIIND":          {"lot": 175, "type": "STOCK"},
        "PNB":            {"lot": 8000, "type": "STOCK"},
        "PNBHOUSING":     {"lot": 650, "type": "STOCK"},
        "POLICYBZR":      {"lot": 350, "type": "STOCK"},
        "POLYCAB":        {"lot": 125, "type": "STOCK"},
        "POWERGRID":      {"lot": 1900, "type": "STOCK"},
        "POWERINDIA":     {"lot": 50, "type": "STOCK"},
        "PPLPHARMA":      {"lot": 2625, "type": "STOCK"},
        "PREMIERENE":     {"lot": 575, "type": "STOCK"},
        "PRESTIGE":       {"lot": 450, "type": "STOCK"},
        "RBLBANK":        {"lot": 3175, "type": "STOCK"},
        "RECLTD":         {"lot": 1400, "type": "STOCK"},
        "RELIANCE":       {"lot": 500, "type": "STOCK"},
        "RVNL":           {"lot": 1525, "type": "STOCK"},
        "SAIL":           {"lot": 4700, "type": "STOCK"},
        "SAMMAANCAP":     {"lot": 4300, "type": "STOCK"},
        "SBICARD":        {"lot": 800, "type": "STOCK"},
        "SBILIFE":        {"lot": 375, "type": "STOCK"},
        "SBIN":           {"lot": 750, "type": "STOCK"},
        "SHREECEM":       {"lot": 25, "type": "STOCK"},
        "SHRIRAMFIN":     {"lot": 825, "type": "STOCK"},
        "SIEMENS":        {"lot": 175, "type": "STOCK"},
        "SOLARINDS":      {"lot": 50, "type": "STOCK"},
        "SONACOMS":       {"lot": 1225, "type": "STOCK"},
        "SRF":            {"lot": 200, "type": "STOCK"},
        "SUNPHARMA":      {"lot": 350, "type": "STOCK"},
        "SUPREMEIND":     {"lot": 175, "type": "STOCK"},
        "SUZLON":         {"lot": 9025, "type": "STOCK"},
        "SWIGGY":         {"lot": 1300, "type": "STOCK"},
        "TATACONSUM":     {"lot": 550, "type": "STOCK"},
        "TATAELXSI":      {"lot": 100, "type": "STOCK"},
        "TATAPOWER":      {"lot": 1450, "type": "STOCK"},
        "TATASTEEL":      {"lot": 5500, "type": "STOCK"},
        "TATATECH":       {"lot": 800, "type": "STOCK"},
        "TCS":            {"lot": 175, "type": "STOCK"},
        "TECHM":          {"lot": 600, "type": "STOCK"},
        "TIINDIA":        {"lot": 200, "type": "STOCK"},
        "TITAN":          {"lot": 175, "type": "STOCK"},
        "TMPV":           {"lot": 800, "type": "STOCK"},
        "TORNTPHARM":     {"lot": 250, "type": "STOCK"},
        "TORNTPOWER":     {"lot": 425, "type": "STOCK"},
        "TRENT":          {"lot": 100, "type": "STOCK"},
        "TVSMOTOR":       {"lot": 175, "type": "STOCK"},
        "ULTRACEMCO":     {"lot": 50, "type": "STOCK"},
        "UNIONBANK":      {"lot": 4425, "type": "STOCK"},
        "UNITDSPR":       {"lot": 400, "type": "STOCK"},
        "UNOMINDA":       {"lot": 550, "type": "STOCK"},
        "UPL":            {"lot": 1355, "type": "STOCK"},
        "VBL":            {"lot": 1125, "type": "STOCK"},
        "VEDL":           {"lot": 1150, "type": "STOCK"},
        "VMM":            {"lot": 4850, "type": "STOCK"},
        "VOLTAS":         {"lot": 375, "type": "STOCK"},
        "WAAREEENER":     {"lot": 175, "type": "STOCK"},
        "WIPRO":          {"lot": 3000, "type": "STOCK"},
        "YESBANK":        {"lot": 31100, "type": "STOCK"},
        "ZYDUSLIFE":      {"lot": 900, "type": "STOCK"},
    }

    @classmethod
    async def sync_all(cls, db: AsyncSession):
        """Syncs all F&O instruments into the instruments table."""
        count = 0
        for sym, data in cls.SEED_DATA.items():
            query = select(Instrument).where(Instrument.symbol == sym)
            result = await db.execute(query)
            inst = result.scalar_one_or_none()

            if inst:
                inst.lot_size = data["lot"]
                inst.instrument_type = data["type"]
            else:
                new_inst = Instrument(
                    symbol=sym,
                    exchange="NSE",
                    lot_size=data["lot"],
                    instrument_type=data["type"]
                )
                db.add(new_inst)
            count += 1

        await db.commit()
        logging.info(f"[FnoSync] Successfully synced {count} F&O instruments.")
        return count

    @classmethod
    def get_lot_size(cls, symbol: str) -> int:
        """
        Fast local lookup for lot size without a DB call.
        Useful for simEngine to get lot size without an async DB call.
        Returns 1 for unknown / equity symbols.
        """
        # Try direct match
        if symbol in cls.SEED_DATA:
            return cls.SEED_DATA[symbol]["lot"]

        # Try stripping exchange prefix: "NSE:SBIN-EQ" -> "SBIN"
        # Handle index symbols which might not have -EQ
        base = symbol.split(":")[-1].split("-")[0]
        
        # Strip trailing Year/Month stuff: "NIFTY26APR23000CE" -> "NIFTY"
        # Regex to strip numbers and common option suffixes
        import re
        base = re.split(r'\d{2}[A-Z]{3}', base)[0]
        
        return cls.SEED_DATA.get(base, {}).get("lot", 1)
