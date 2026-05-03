from typing import Dict, List, Optional

from core.plots import (
    filter_eligible_authors_by_field,
    extract_author_scores,
    compute_percentile,
    plot_score_distribution_for_field,
)
from core.pipeline import score_author_from_scholar
from web.utils import make_author_id
from web.db import upsert_scholar_result
from core.scholar import fetch_all_scholar_papers, search_scholar_by_name


def search_scholar_profiles(author_name, serpapi_key):
    '''Search Google Scholar for author profiles matching a name.'''
    return search_scholar_by_name(serpapi_key, author_name)


def sum_paper_citations(papers):
	'''Return the total citation count across a list of paper dicts.'''
	return sum((paper.get('citations') or 0) for paper in papers)


def search_authors(query, index):
    """Return authors whose name contains the query string (case-insensitive)."""
    query_lower = query.lower()
    matches = []
    for entry in index.values():
        if query_lower in entry['name'].lower():
            matches.append({
                'author_id': make_author_id(entry['name'], entry.get('institution', '')),
                'name': entry['name'],
                'institution': entry.get('institution', ''),
                'author_score': entry.get('author_score', 0),
                'total_papers': entry.get('total_papers', 0),
                'total_citations': sum_paper_citations(entry.get('papers', [])),
                'fields': entry.get('fields', []),
            })
    return matches


def get_author(author_id, index):
    """Return the full author entry for the given author ID, or None if not found."""
    return index.get(author_id)


def scrape_and_score_scholar_author(
    scholar_id,
    serpapi_key,
    scimago_sjr_by_issn,
    scimago_fields_by_issn,
    current_year,
    results,
    index,
):
    """Scrape a Google Scholar profile, score the author, persist to DB, and add to the in-memory index."""
    author_name, institution, titles = fetch_all_scholar_papers(serpapi_key, scholar_id)
    if not titles:
        return None
    author_id = make_author_id(author_name, institution)
    if author_id in index:
        return {'author_id': author_id, 'total_citations': sum_paper_citations(index[author_id].get('papers', [])), **index[author_id]}
    entry = score_author_from_scholar(
        author_name,
        institution,
        titles,
        scimago_sjr_by_issn,
        scimago_fields_by_issn,
        current_year,
    )
    # Add to in-memory state
    results.append(entry)
    index[author_id] = entry
    # Persist to database
    upsert_scholar_result(author_id, author_name, institution, entry)
    return {'author_id': author_id, 'total_citations': sum_paper_citations(entry.get('papers', [])), **entry}


def generate_plot(
    author_id,
    results,
    index,
    field=None,
):
    """Generate a Base64-encoded plot for the given author in a specific field."""
    entry = index.get(author_id)
    if entry is None:
        return None
    candidate_score = entry.get('author_score', 0)
    candidate_fields = entry.get('fields', [])
    if candidate_score == 0:
        return {'error': f"{entry['name']} has a score of 0."}
    if not candidate_fields:
        return {'error': f"{entry['name']} has no fields."}
    if field is None:
        field = candidate_fields[0]
    eligible = filter_eligible_authors_by_field(results, field)
    scores = extract_author_scores(eligible)
    if not scores:
        return {'error': f"No eligible authors found for field '{field}'."}
    percentile = compute_percentile(scores, candidate_score)
    plot_base64 = plot_score_distribution_for_field(
        scores,
        candidate_score,
        entry['name'],
        percentile,
        field,
    )
    return {
        'plot_base64': plot_base64,
        'percentile': percentile,
        'comparison_group_size': len(scores),
    }
