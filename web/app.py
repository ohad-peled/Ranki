import json
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Header, HTTPException, Request

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.helpers import load_scimago_data_by_issn
from web.api.routes import router
from web.db import init_db, load_all_scholar_results, count_scholar_results, increment_visit_count, get_visit_count
from web.utils import make_author_id

RESULTS_JSON_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'phd_isr_res_filtered.json')
SCIMAGO_CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'scimagojr2024.csv')
STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')


def _build_index(results):
    """Build an in-memory lookup dict keyed by author ID."""
    index = {}
    for entry in results:
        author_id = make_author_id(entry['name'], entry.get('institution', ''))
        index[author_id] = entry
    return index


def _load_json_file(path):
    """Load a JSON array from disk, returning empty list if file missing or invalid."""
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def _merge_results(precomputed, scholar):
    """Merge precomputed and scholar results. Scholar entries override on collision."""
    index = _build_index(precomputed)
    for entry in scholar:
        clean = {k: v for k, v in entry.items() if k != '_db_meta'}
        author_id = make_author_id(clean['name'], clean.get('institution', ''))
        index[author_id] = clean
    return list(index.values())


def load_results_into_state(app):
    """Load precomputed results from disk and scholar results from DB into app state."""
    precomputed = _load_json_file(RESULTS_JSON_PATH)
    scholar = load_all_scholar_results()
    merged = _merge_results(precomputed, scholar)
    app.state.results = merged
    app.state.index = _build_index(merged)
    return len(merged)


@asynccontextmanager
async def lifespan(app):
    init_db()
    load_results_into_state(app)
    app.state.scimago_sjr_by_issn, app.state.scimago_fields_by_issn = load_scimago_data_by_issn(SCIMAGO_CSV_PATH)
    app.state.current_year = datetime.now().year
    app.state.serpapi_key = os.environ.get('SERPAPI_KEY', '')
    yield


app = FastAPI(title='Peled Index API', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(router, prefix='/api')


@app.get('/api/startup-info')
def startup_info():
    return {
        'results_json': os.path.basename(RESULTS_JSON_PATH),
        'scimago_csv': os.path.basename(SCIMAGO_CSV_PATH),
        'precomputed_authors': len(_load_json_file(RESULTS_JSON_PATH)),
        'scholar_authors_in_db': count_scholar_results(),
        'total_authors_loaded': len(app.state.results),
    }


@app.post('/api/admin/reload')
def admin_reload(x_admin_key: str = Header(...)):
    """Re-read precomputed JSON and scholar DB into app state."""
    admin_key = os.environ.get('ADMIN_KEY', '')
    if not admin_key or x_admin_key != admin_key:
        raise HTTPException(status_code=403, detail='Invalid admin key')
    author_count = load_results_into_state(app)
    return {'reloaded': True, 'authors_loaded': author_count}


@app.post('/api/admin/upload-results')
async def admin_upload_results(request: Request, x_admin_key: str = Header(...)):
    """Replace the precomputed results JSON with the uploaded body, then reload state."""
    admin_key = os.environ.get('ADMIN_KEY', '')
    if not admin_key or x_admin_key != admin_key:
        raise HTTPException(status_code=403, detail='Invalid admin key')

    tmp_path = RESULTS_JSON_PATH + '.tmp'
    bytes_written = 0
    with open(tmp_path, 'wb') as f:
        async for chunk in request.stream():
            f.write(chunk)
            bytes_written += len(chunk)

    os.replace(tmp_path, RESULTS_JSON_PATH)
    author_count = load_results_into_state(app)
    return {'uploaded': True, 'bytes': bytes_written, 'authors_loaded': author_count}


@app.get('/api/admin/scholar-results')
def admin_scholar_results(x_admin_key: str = Header(...)):
    """Return all scholar-scraped results from the database."""
    admin_key = os.environ.get('ADMIN_KEY', '')
    if not admin_key or x_admin_key != admin_key:
        raise HTTPException(status_code=403, detail='Invalid admin key')
    data = load_all_scholar_results()
    return {'count': len(data), 'results': data}


@app.post('/api/visit')
def record_visit():
    """Increment the site visit counter. Called by the frontend on page load."""
    increment_visit_count()
    return {'ok': True}

@app.get('/api/admin/visit-count')
def admin_visit_count(x_admin_key: str = Header(...)):
    """Return the current visit count. Protected by ADMIN_KEY."""
    admin_key = os.environ.get('ADMIN_KEY', '')
    if not admin_key or x_admin_key != admin_key:
        raise HTTPException(status_code=403, detail='Invalid admin key')
    return {'visit_count': get_visit_count()}


app.mount('/', StaticFiles(directory=STATIC_DIR, html=True), name='static')
