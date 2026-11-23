from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class SearchSip(BaseModel):
    status: str
    next_due_date: date | None


class SearchHolder(BaseModel):
    member_id: str
    member_name: str
    state: Literal["open", "sold"]
    sip: SearchSip | None


class SearchFund(BaseModel):
    scheme_id: str
    name: str
    amc_name: str
    sebi_category: str | None
    plan_type: str
    main_manager: str | None
    holders: list[SearchHolder]


class SearchIndexResponse(BaseModel):
    generated_at: datetime
    funds: list[SearchFund]
