import os
import sys
from app.db import SessionLocal
from app.models import Investor, Folio, Scheme, Transaction, ImportRecord

def remove_test_data():
    db = SessionLocal()
    
    print("Removing test data...")

    # Find test import record
    test_imports = db.query(ImportRecord).filter(ImportRecord.session_id == 'test_session_123').all()
    for imp in test_imports:
        # Delete transactions for this import
        db.query(Transaction).filter(Transaction.import_id == imp.id).delete(synchronize_session=False)
        db.delete(imp)

    # Delete test folios and their transactions
    test_folios = db.query(Folio).filter(Folio.pan_masked == 'ABCDE1234F').all()
    for folio in test_folios:
        db.query(Transaction).filter(Transaction.folio_id == folio.id).delete(synchronize_session=False)
        db.delete(folio)

    # Delete test schemes (only the ones we explicitly created if they have no transactions left)
    test_schemes = db.query(Scheme).filter(Scheme.amfi_code.in_(['119062', '122639'])).all()
    for scheme in test_schemes:
        if db.query(Transaction).filter(Transaction.scheme_id == scheme.id).count() == 0:
            db.delete(scheme)

    # Delete test investor
    db.query(Investor).filter(Investor.pan_masked == 'ABCDE1234F').delete(synchronize_session=False)

    db.commit()
    print("Test data successfully removed!")
    db.close()

if __name__ == "__main__":
    remove_test_data()
