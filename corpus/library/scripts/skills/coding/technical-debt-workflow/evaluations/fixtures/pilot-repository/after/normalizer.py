def normalize_label(value: str, trim: bool = True) -> str:
    cleaned = value.strip() if trim else value
    if not cleaned:
        return "unknown"
    return cleaned.lower()
