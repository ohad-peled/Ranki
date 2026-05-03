import json
import os
from contextlib import contextmanager
from urllib.parse import urlparse

import psycopg2
from psycopg2.extras import RealDictCursor

INIT_SQL = """
CREATE TABLE IF NOT EXISTS scholar_results (
    author_id   TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    institution TEXT DEFAULT '',
    data        JSONB NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS site_visits (
    id          INTEGER PRIMARY KEY DEFAULT 1,
    visit_count INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMP DEFAULT NOW(),
    CHECK (id = 1)
);
INSERT INTO site_visits (id, visit_count)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;
"""

_db_available = False


def is_db_available():
    """Return whether the database is configured and reachable."""
    return _db_available


def get_connection_params():
    """Parse DATABASE_URL into connection params for psycopg2."""
    database_url = os.environ.get('DATABASE_URL', '')
    if not database_url:
        return None
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    parsed = urlparse(database_url)
    return {
        'host': parsed.hostname,
        'port': parsed.port or 5432,
        'dbname': parsed.path.lstrip('/'),
        'user': parsed.username,
        'password': parsed.password,
        'sslmode': 'require',
    }


@contextmanager
def get_db():
    """Yield a database connection, commit on success, rollback on error."""
    params = get_connection_params()
    if params is None:
        raise RuntimeError('DATABASE_URL not set')
    conn = psycopg2.connect(**params)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create the scholar_results table if it does not exist. Sets _db_available flag."""
    global _db_available
    params = get_connection_params()
    if params is None:
        print('[db] DATABASE_URL not set — scholar persistence disabled')
        _db_available = False
        return
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(INIT_SQL)
        _db_available = True
        print('[db] Connected to Postgres — scholar persistence enabled')
    except Exception as e:
        _db_available = False
        print(f'[db] Could not connect to Postgres: {e} — scholar persistence disabled')


def upsert_scholar_result(author_id, name, institution, data):
    """Insert or update a single scholar result. No-op if DB not available."""
    if not _db_available:
        return
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO scholar_results (author_id, name, institution, data, updated_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (author_id)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    institution = EXCLUDED.institution,
                    data = EXCLUDED.data,
                    updated_at = NOW();
                """,
                (author_id, name, institution, json.dumps(data, ensure_ascii=False)),
            )


def load_all_scholar_results():
    """Return all scholar results as a list of dicts. Empty list if DB not available."""
    if not _db_available:
        return []
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT author_id, name, institution, data, created_at, updated_at FROM scholar_results ORDER BY updated_at DESC')
            rows = cur.fetchall()
    results = []
    for row in rows:
        entry = row['data'] if isinstance(row['data'], dict) else json.loads(row['data'])
        entry['_db_meta'] = {
            'author_id': row['author_id'],
            'created_at': row['created_at'].isoformat() if row['created_at'] else None,
            'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None,
        }
        results.append(entry)
    return results


def delete_scholar_result(author_id):
    """Delete a single scholar result by author_id."""
    if not _db_available:
        return False
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM scholar_results WHERE author_id = %s', (author_id,))
            return cur.rowcount > 0


def count_scholar_results():
    """Return the number of scholar results in the database."""
    if not _db_available:
        return 0
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM scholar_results')
            return cur.fetchone()[0]


def increment_visit_count():
    """Atomically increment the site visit counter. No-op if DB not available."""
    if not _db_available:
        return None
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'UPDATE site_visits SET visit_count = visit_count + 1, updated_at = NOW() WHERE id = 1'
                )
    except Exception:
        pass  # non-critical — don't break the page over analytics


def get_visit_count():
    """Return the current visit count, or None if DB not available."""
    if not _db_available:
        return None
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT visit_count FROM site_visits WHERE id = 1')
            row = cur.fetchone()
            return row[0] if row else 0

