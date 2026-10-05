def normalize_label(value: str, trim: bool = True) -> str:
    if trim:
        cleaned = value.strip()
        if not cleaned:
            return "unknown"
        return cleaned.lower()

    cleaned = value
    if not cleaned:
        return "unknown"
    return cleaned.lower()
