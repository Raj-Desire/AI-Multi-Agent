"""One password rule for every place a person sets a password (new organization, new admin, new user, resets).

At least 6 characters, at least one number and at least one capital letter.
Login is deliberately NOT checked, so accounts created before this rule can still sign in.
"""

MIN_PASSWORD_LENGTH = 6
PASSWORD_RULE_TEXT = "Password must be at least 6 characters and include at least one number and one capital letter."


def password_problem(password: str) -> str | None:
    """Returns what is wrong with the password, or None when it is acceptable."""
    value = password or ""
    if len(value) < MIN_PASSWORD_LENGTH:
        return "Password must be at least 6 characters long."
    if not any(ch.isdigit() for ch in value):
        return "Password must include at least one number."
    if not any(ch.isupper() for ch in value):
        return "Password must include at least one capital letter."
    return None


def validate_password(value: str) -> str:
    """Pydantic validator body: returns the password unchanged or raises ValueError with a clear message."""
    problem = password_problem(value)
    if problem:
        raise ValueError(problem)
    return value
