import os
import sys
from datetime import date, timedelta
from app.db import SessionLocal, init_db, engine, Base
from app.models import Investor, Folio, Scheme, Transaction, TxnType, MatchStatus, ImportRecord, ImportStatus

def seed_data():
    # Ensure tables exist
    init_db()

    db = SessionLocal()

    # Clear existing test data
    db.query(Transaction).delete()
    db.query(Scheme).delete()
    db.query(Folio).delete()
    db.query(Investor).delete()
    db.query(ImportRecord).delete()
    db.commit()

    print("Populating test data...")

    # Investor
    investor = Investor(name="Test User", email="test@example.com", pan_masked="ABCDE1234F")
    db.add(investor)
    
    # Folio
    folio1 = Folio(folio_number="123456789", amc="HDFC Mutual Fund", pan_masked="ABCDE1234F")
    folio2 = Folio(folio_number="987654321", amc="Parag Parikh Mutual Fund", pan_masked="ABCDE1234F")
    db.add_all([folio1, folio2])
    db.commit()

    # Schemes
    scheme1 = Scheme(name="HDFC Index Fund-NIFTY 50 Plan - Direct", isin="INF179K01YE4", amfi_code="119062", category="Equity", match_confidence=1.0, match_status=MatchStatus.CONFIRMED)
    scheme2 = Scheme(name="Parag Parikh Flexi Cap Fund - Direct", isin="INF397L01249", amfi_code="122639", category="Equity", match_confidence=1.0, match_status=MatchStatus.CONFIRMED)
    db.add_all([scheme1, scheme2])
    db.commit()

    # Import Record
    import_rec = ImportRecord(session_id="test_session_123", filename="test_cas.pdf", status=ImportStatus.COMPLETED)
    db.add(import_rec)
    db.commit()

    # Transactions (simulating a few SIPs over a year)
    transactions = []
    base_date = date.today() - timedelta(days=365)
    
    # Scheme 1 SIP (HDFC)
    nav_s1 = 150.5
    for i in range(12):
        txn_date = base_date + timedelta(days=30 * i)
        amount = 10000
        nav = nav_s1 + (i * 2.5) # Simulating increasing NAV
        units = round(amount / nav, 3)
        transactions.append(
            Transaction(
                scheme_id=scheme1.id, folio_id=folio1.id, import_id=import_rec.id,
                txn_date=txn_date, txn_type=TxnType.PURCHASE_SIP, description="Systematic Investment Plan",
                amount=amount, units=units, nav=nav, dedupe_hash=f"s1_sip_{i}"
            )
        )

    # Scheme 2 SIP (PPFAS)
    nav_s2 = 50.2
    for i in range(12):
        txn_date = base_date + timedelta(days=30 * i)
        amount = 5000
        nav = nav_s2 + (i * 1.2) # Simulating increasing NAV
        units = round(amount / nav, 3)
        transactions.append(
            Transaction(
                scheme_id=scheme2.id, folio_id=folio2.id, import_id=import_rec.id,
                txn_date=txn_date, txn_type=TxnType.PURCHASE_SIP, description="Systematic Investment Plan",
                amount=amount, units=units, nav=nav, dedupe_hash=f"s2_sip_{i}"
            )
        )

    db.add_all(transactions)
    db.commit()
    
    # Update import record stats
    import_rec.schemes_found = 2
    import_rec.txns_added = len(transactions)
    db.commit()

    print("Test data seeded successfully!")
    print(f"Added {len(transactions)} transactions across 2 schemes.")
    
    db.close()

if __name__ == "__main__":
    seed_data()
