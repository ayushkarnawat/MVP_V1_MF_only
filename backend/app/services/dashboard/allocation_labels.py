def asset_class_bucket(sebi_category: str) -> str:
    category = sebi_category.lower()
    if "equity" in category:
        return "Equity"
    if "debt" in category or "income" in category or "liquid" in category or "money market" in category:
        return "Debt"
    if "hybrid" in category:
        return "Hybrid"
    return "Other"
