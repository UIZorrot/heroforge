from urllib.parse import quote_plus

from config import _normalize_database_url


def test_normalize_database_url_encodes_reserved_password_chars():
    raw_url = "postgresql://user:pa?ss,word@db.example.com:5432/app"
    normalized = _normalize_database_url(raw_url)

    assert normalized == f"postgresql://user:{quote_plus('pa?ss,word')}@db.example.com:5432/app"


def test_normalize_database_url_leaves_valid_urls_unchanged():
    raw_url = "postgresql://user:pa%3Fss%2Cword@db.example.com:5432/app?sslmode=require"
    assert _normalize_database_url(raw_url) == raw_url
