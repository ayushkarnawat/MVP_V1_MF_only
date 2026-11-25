from dataclasses import dataclass, fields


@dataclass
class ExportTimings:
    slot_wait_ms: int | None = None
    browser_start_ms: int | None = None
    goto_ms: int | None = None
    build_wait_ms: int | None = None
    pdf1_ms: int | None = None
    contents_ms: int | None = None
    contents_outcome: str = "skipped"
    store_ms: int | None = None

    def log_fields(self) -> str:
        return " ".join(
            f"{field.name}={value if value is not None else '-'}"
            for field in fields(self)
            for value in (getattr(self, field.name),)
        )
