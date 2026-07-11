import re
import time
from datetime import datetime, timezone
import feedparser
import db

FEEDS = [
    {"url": "https://feeds.bbci.co.uk/news/rss.xml",                     "source": "BBC News"},
    {"url": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",  "source": "NY Times"},
    {"url": "https://feeds.reuters.com/reuters/topNews",                   "source": "Reuters"},
    {"url": "https://rss.cnn.com/rss/edition.rss",                        "source": "CNN"},
    {"url": "https://www.theguardian.com/world/rss",                       "source": "Guardian"},
    {"url": "https://feeds.npr.org/1001/rss.xml",                          "source": "NPR"},
    {"url": "https://www.aljazeera.com/xml/rss/all.xml",                   "source": "Al Jazeera"},
    {"url": "https://feeds.skynews.com/feeds/rss/home.xml",               "source": "Sky News"},
    {"url": "https://apnews.com/rss",                                      "source": "AP News"},
    {"url": "https://feeds.washingtonpost.com/rss/national",               "source": "Washington Post"},
    {"url": "https://www.politico.com/rss/politics08.xml",                 "source": "Politico"},
    {"url": "https://techcrunch.com/feed/",                                "source": "TechCrunch"},
    {"url": "https://feeds.arstechnica.com/arstechnica/index",             "source": "Ars Technica"},
    {"url": "https://www.wired.com/feed/rss",                              "source": "Wired"},
    {"url": "https://www.theverge.com/rss/index.xml",                      "source": "The Verge"},
]

def _parse_date(entry) -> str | None:
    if not getattr(entry, "published_parsed", None):
        return None
    try:
        dt = datetime.fromtimestamp(time.mktime(entry.published_parsed), tz = timezone.utc)
        return dt.isoformat()
    except Exception:
        return None

def _strip_html(text:str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
def _fetch_feed(feed: dict) -> list[dict]:
    try:
        parsed = feedparser.parse(feed["url"])
    except Exception as e:
        print(f"Failed to fetch {feed['source']}: {e}")
        return []

    articles = []
    for entry in parsed.entries:
        url   = getattr(entry, "link",    None)
        title = getattr(entry, "title",   "").strip()

        if not url or not title:
            continue

        summary = getattr(entry, "summary", "") or ""
        summary = _strip_html(summary)[:1000]

        articles.append({
            "url":          url,
            "title":        title,
            "summary":      summary,
            "source":       feed["source"],
            "published_at": _parse_date(entry),
        })

    return articles

def poll_feeds() -> int:
    all_articles = []
    for feed in FEEDS:
        articles = _fetch_feed(feed)
        print(f"{feed['source']}: {len(articles)} articles")
        all_articles.extend(articles)

    n_inserted = db.insert_articles(all_articles)
    return n_inserted

