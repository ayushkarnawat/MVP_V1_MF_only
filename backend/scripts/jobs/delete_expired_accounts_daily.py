import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.auth.account_deletion import hard_delete_expired_accounts

logger = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        deleted = hard_delete_expired_accounts(db)
        logger.info("delete_expired_accounts_daily: deleted_accounts=%d success=True", deleted)


if __name__ == "__main__":
    main()
