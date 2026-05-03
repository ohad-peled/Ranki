from datetime import datetime
from math import log1p
from concurrent.futures import ThreadPoolExecutor, as_completed
from helpers import (
	deduplicate_papers,
	find_crossref_match,
	find_journal_fields,
	find_journal_sjr,
	load_author_list,
	load_scimago_data_by_issn,
	rank_fields_by_paper_count,
	save_results_json,
)


from concurrent.futures import ThreadPoolExecutor


def build_papers_from_titles(titles, author_name, scimago_sjr_by_issn, scimago_fields_by_issn, max_workers=8):
	'Fetch and enrich all papers for one author from Crossref and SCImago.'
	def process_title(title):
		paper_url, journal_issns, is_first_author, is_last_author, is_preprint, year, venue, citations = find_crossref_match(title, author_name)
		return {
			'title': title,
			'year': year,
			'venue_raw': venue,
			'citations': citations,
			'paper_url': paper_url,
			'journal_sjr': find_journal_sjr(journal_issns, scimago_sjr_by_issn),
			'journal_issns': journal_issns,
			'is_first_author': is_first_author,
			'is_last_author': is_last_author,
			'is_preprint': is_preprint,
		}
	with ThreadPoolExecutor(max_workers=max_workers) as executor:
		papers = list(executor.map(process_title, titles))
	return deduplicate_papers(papers)


def parse_year(year_value):
	'Parse a paper year to int.'
	try:
		return int(year_value)
	except (TypeError, ValueError):
		return None


def parse_int(value):
	'Parse a numeric value to int.'
	try:
		return int(value)
	except (TypeError, ValueError):
		return 0


def parse_float(value):
	'Parse a numeric value to float.'
	try:
		return float(value)
	except (TypeError, ValueError):
		return None


def compute_paper_score(paper, current_year, non_first_author_weight):
	'Compute the score contribution of a single paper.'
	paper_year = parse_year(paper.get('year'))
	if paper_year is None:
		return None
	is_preprint = paper.get('is_preprint')
	if is_preprint is True or is_preprint == 'True':
		return None
	paper_age = current_year - paper_year + 1
	if paper_age <= 0:
		return None
	citations = parse_int(paper.get('citations'))
	citations_per_year = citations / paper_age
	journal_sjr = parse_float(paper.get('journal_sjr'))
	is_first_author = paper.get('is_first_author')
	is_last_author = paper.get('is_last_author')
	authorship_weight = 1.0 if (is_first_author is True or is_first_author == 'True' or is_last_author is True or is_last_author == 'True') else non_first_author_weight
	if journal_sjr is not None:
		return authorship_weight * ((0.3 * citations_per_year) + (0.7 * journal_sjr))
	return authorship_weight * citations_per_year


def infer_start_year_from_papers(papers):
	'Infer career start from earliest publication year.'
	paper_years = [parse_year(p.get('year')) for p in papers]
	paper_years = [y for y in paper_years if y is not None]
	if not paper_years:
		return None
	return min(paper_years)


def compute_author_score(papers, current_year, start_year, infer_start_year, non_first_author_weight=0.1):
	'Compute the author score normalised by career length.'
	paper_scores = [
		compute_paper_score(paper, current_year, non_first_author_weight)
		for paper in papers
	]
	paper_scores = [score for score in paper_scores if score is not None]
	if not paper_scores:
		return 0.0
	if infer_start_year:
		start_year = infer_start_year_from_papers(papers)
	if start_year is None:
		return 0.0
	active_years = current_year - start_year + 1
	if active_years <= 0:
		return 0.0
	return round(sum(paper_scores) / active_years, 6)


def compute_compressed_author_score(author_score):
	'Apply monotonic compression to reduce tail influence.'
	if author_score <= 0:
		return 0.0
	return round(log1p(author_score), 6)


def score_author(author_entry, scimago_sjr_by_issn, scimago_fields_by_issn, current_year, infer_start_year):
	'Build and score one author entry from the input JSON.'
	author_name = author_entry['name']
	start_year = parse_year(author_entry.get('start_year'))
	papers = build_papers_from_titles(author_entry['publications'], author_name, scimago_sjr_by_issn, scimago_fields_by_issn)
	if infer_start_year:
		start_year = infer_start_year_from_papers(papers)
	author_score = compute_author_score(papers, current_year, start_year, infer_start_year)
	compressed_author_score = compute_compressed_author_score(author_score)
	author_fields = rank_fields_by_paper_count(papers, scimago_fields_by_issn)
	for paper in papers:
		paper.pop('journal_issns', None)
	return {
		'name': author_name,
		'institution': author_entry.get('institution', ''),
		'start_year': start_year,
		'author_score': author_score,
		'author_score_log1p': compressed_author_score,
		'total_papers': len(papers),
		'fields': author_fields,
		'papers': papers,
	}


def run_pipeline(input_json_path, output_json_path, scimago_file_path, infer_start_year=True):
	'Run the Crossref and SCImago pipeline for all authors in the input file.'
	scimago_sjr_by_issn, scimago_fields_by_issn = load_scimago_data_by_issn(scimago_file_path)
	author_list = load_author_list(input_json_path)
	current_year = datetime.now().year
	results = []
	for author_index, author_entry in enumerate(author_list, start=1):
		print(f'Processing author {author_index}: {author_entry["name"]}')
		results.append(score_author(author_entry, scimago_sjr_by_issn, scimago_fields_by_issn, current_year, infer_start_year))
	save_results_json(output_json_path, results)
