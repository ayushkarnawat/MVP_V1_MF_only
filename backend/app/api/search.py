from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.home import get_now_ist
from app.db.session import get_db
from app.models.user import User
from app.services.auth.session import get_data_user
from app.services.search.index import build_search_index
from app.services.search.schemas import SearchIndexResponse

router = APIRouter(tags=["search"])


@router.get("/household/search-index", response_model=SearchIndexResponse)
def search_index(
    user: User = Depends(get_data_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
) -> SearchIndexResponse:
    result = build_search_index(db, user.id, now.date())
    return result.model_copy(update={"generated_at": now})
