import os
import sys
from app.db import SessionLocal
from app.models import Transaction, Scheme, Folio, ImportRecord, Investor

def check():
    db = SessionLocal()
    print('Txns:', db.query(Transaction).count())
    print('Schemes:', db.query(Scheme).count())
    print('Imports:', db.query(ImportRecord).count())
    print('Folios:', db.query(Folio).count())
    print('Investors:', db.query(Investor).count())
    for f in db.query(Folio).all():
        print(f"Folio {f.id}: pan_masked={f.pan_masked}")
    db.close()

if __name__ == "__main__":
    check()
