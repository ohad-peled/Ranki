/* ── Peled Index – app.js ── */

(function () {
  'use strict';

  /* ── Startup: log data sources to console ── */
  fetch('/api/startup-info')
    .then(function (res) { return res.json(); })
    .then(function (info) {
      console.log('[Peled Index] Data sources:');
      console.log('  Results JSON:', info.results_json);
      console.log('  Scimago CSV: ', info.scimago_csv);
    })
    .catch(function (err) {
      console.warn('[Peled Index] Could not load startup info:', err);
    });

	fetch('/api/visit', { method: 'POST' }).catch(function () {});

  const searchInput    = document.getElementById('search-input');
  const dropdown       = document.getElementById('dropdown');
  const dropdownStatus = document.getElementById('dropdown-status');
  const authorCard     = document.getElementById('author-card');
  const authorInfo     = document.getElementById('author-info');
  const plotsSection   = document.getElementById('plots-section');
  const papersSection  = document.getElementById('papers-section');

  let searchTimer = null;
  let currentAuthorId = null;
  let currentFields   = [];

    var ALL_FIELDS = [
    'Computer Science and Engineering',
    'Life Sciences',
    'Physics and Chemistry',
    'Social Sciences and Humanities'
  ];

  /* ── Utility ── */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Dropdown helpers ── */

  function showDropdown() {
    dropdown.classList.add('visible');
  }

  function hideDropdown() {
    dropdown.classList.remove('visible');
  }

  function setDropdownStatus(msg) {
    dropdownStatus.textContent = msg;
    dropdownStatus.style.display = msg ? 'block' : 'none';
  }

  function clearDropdownItems() {
    Array.from(dropdown.children).forEach(function (child) {
      if (child !== dropdownStatus) {
        dropdown.removeChild(child);
      }
    });
  }

  /* ── Scholar scrape UI ── */

function renderScholarPrompt() {
	clearDropdownItems();
	setDropdownStatus('');

	var wrapper = document.createElement('div');
	wrapper.id = 'scholar-prompt';
	wrapper.style.padding = '0.75rem 1rem';

	wrapper.innerHTML =
		'<div style="color:#94a3b8;font-size:0.85rem;margin-bottom:0.5rem;">' +
			'Author not found. Search Google Scholar by name:' +
		'</div>' +
		'<div style="display:flex;gap:0.5rem;">' +
			'<input id="scholar-name-input" type="text" placeholder="e.g. John Smith"' +
				' style="flex:1;padding:0.5rem 0.7rem;background:#0f172a;border:1px solid #334155;' +
				'border-radius:6px;color:#ffffff;font-size:0.9rem;outline:none;" />' +
			'<button id="scholar-name-btn"' +
				' style="padding:0.5rem 1rem;background:#0096ff;border:none;border-radius:6px;' +
				'color:#ffffff;font-size:0.85rem;font-weight:600;cursor:pointer;">Search</button>' +
		'</div>' +
		'<div id="scholar-search-status" style="margin-top:0.4rem;font-size:0.82rem;color:#94a3b8;"></div>' +
		'<div id="scholar-candidates"></div>' +
		'<div style="margin-top:0.6rem;">' +
			'<span id="scholar-id-toggle" style="color:#7a7d9a;font-size:0.78rem;cursor:pointer;">' +
				'Have a Scholar ID instead?' +
			'</span>' +
		'</div>' +
		'<div id="scholar-id-section" style="display:none;margin-top:0.5rem;">' +
			'<div style="display:flex;gap:0.5rem;">' +
				'<input id="scholar-id-input" type="text" placeholder="e.g. e.g. 2w2RgPkAAAAJ (id is listed in the URL on your scholar profile as user=id"' +
					' style="flex:1;padding:0.5rem 0.7rem;background:#0f172a;border:1px solid #334155;' +
					'border-radius:6px;color:#ffffff;font-size:0.9rem;outline:none;" />' +
				'<button id="scholar-scrape-btn"' +
					' style="padding:0.5rem 1rem;background:#0096ff;border:none;border-radius:6px;' +
					'color:#ffffff;font-size:0.85rem;font-weight:600;cursor:pointer;">Go</button>' +
			'</div>' +
			'<div id="scholar-scrape-status" style="margin-top:0.4rem;font-size:0.82rem;color:#94a3b8;"></div>' +
		'</div>';

	dropdown.appendChild(wrapper);

	var scholar_name_input = document.getElementById('scholar-name-input');
	var scholar_name_btn = document.getElementById('scholar-name-btn');
	var scholar_id_toggle = document.getElementById('scholar-id-toggle');
	var scholar_id_section = document.getElementById('scholar-id-section');

	scholar_name_btn.addEventListener('click', function () {
		var name = scholar_name_input.value.trim();
		if (name) runScholarNameSearch(name);
	});

	scholar_name_input.addEventListener('keydown', function (e) {
		if (e.key === 'Enter') {
			var name = scholar_name_input.value.trim();
			if (name) runScholarNameSearch(name);
		}
	});

	scholar_id_toggle.addEventListener('click', function () {
		var is_hidden = scholar_id_section.style.display === 'none';
		scholar_id_section.style.display = is_hidden ? 'block' : 'none';
		scholar_id_toggle.textContent = is_hidden
			? 'Search by name instead'
			: 'Have a Scholar ID instead?';
	});

	var scholar_id_input = document.getElementById('scholar-id-input');
	var scholar_scrape_btn = document.getElementById('scholar-scrape-btn');

	scholar_scrape_btn.addEventListener('click', function () {
		var scholar_id = scholar_id_input.value.trim();
		if (scholar_id) runScholarScrape(scholar_id);
	});

	scholar_id_input.addEventListener('keydown', function (e) {
		if (e.key === 'Enter') {
			var scholar_id = scholar_id_input.value.trim();
			if (scholar_id) runScholarScrape(scholar_id);
		}
	});
}

function runScholarNameSearch(author_name) {
	var status_element = document.getElementById('scholar-search-status');
	var candidates_element = document.getElementById('scholar-candidates');
	var name_btn = document.getElementById('scholar-name-btn');
	var name_input = document.getElementById('scholar-name-input');

	status_element.textContent = 'Searching Google Scholar...';
	status_element.style.color = '#94a3b8';
	candidates_element.innerHTML = '';
	name_btn.disabled = true;
	name_input.disabled = true;

	fetch('/api/authors/scholar/search?name=' + encodeURIComponent(author_name))
		.then(function (res) {
			if (!res.ok) {
				return res.json().then(function (body) {
					throw new Error(body.detail || 'Search failed (' + res.status + ')');
				}).catch(function (parse_error) {
					throw new Error('Search failed (' + res.status + ')');
				});
			}
			return res.json();
		})
		.then(function (candidates) {
			name_btn.disabled = false;
			name_input.disabled = false;
			if (candidates.length === 1) {
				status_element.textContent = 'Found profile. Scraping...';
				runScholarScrape(candidates[0].author_id);
				return;
			}
			status_element.textContent = 'Multiple profiles found. Select yours:';
			renderScholarCandidates(candidates, candidates_element);
		})
		.catch(function (err) {
			status_element.textContent = 'Error: ' + err.message;
			status_element.style.color = '#ff3366';
			name_btn.disabled = false;
			name_input.disabled = false;
		});
}

function renderScholarCandidates(candidates, container) {
	container.innerHTML = '';
	candidates.forEach(function (candidate) {
		var item = document.createElement('div');
		item.style.cssText =
			'padding:0.5rem 0.7rem;margin-top:0.35rem;background:#0f172a;border:1px solid #334155;' +
			'border-radius:6px;cursor:pointer;transition:background 0.15s;';

		var details = escapeHtml(candidate.affiliations || '');
		if (candidate.email) {
			details += (details ? ' · ' : '') + escapeHtml(candidate.email);
		}
		if (candidate.cited_by) {
			details += (details ? ' · ' : '') + 'Cited by ' + candidate.cited_by;
		}

		item.innerHTML =
			'<div style="color:#ffffff;font-size:0.88rem;font-weight:600;">' +
				escapeHtml(candidate.name) +
			'</div>' +
			'<div style="color:#64748b;font-size:0.76rem;margin-top:2px;">' +
				details +
			'</div>';

		item.addEventListener('mouseenter', function () {
			item.style.background = '#253352';
		});
		item.addEventListener('mouseleave', function () {
			item.style.background = '#0f172a';
		});
		item.addEventListener('click', function () {
			var status_element = document.getElementById('scholar-search-status');
			status_element.textContent = '';

			container.innerHTML =
				'<div style="padding:0.75rem 0.7rem;margin-top:0.35rem;background:#1e293b;' +
				'border:1px solid #0096ff;border-radius:6px;">' +
					'<div style="color:#ffffff;font-size:0.88rem;font-weight:600;">' +
						escapeHtml(candidate.name) +
					'</div>' +
					'<div style="color:#64748b;font-size:0.76rem;margin-top:2px;">' +
						escapeHtml(candidate.affiliations || '') +
					'</div>' +
					'<div style="color:#0096ff;font-size:0.8rem;margin-top:0.35rem;">' +
						'⏳ Scraping Scholar profile… This may take a moment.' +
					'</div>' +
				'</div>';

			runScholarScrape(candidate.author_id);
		});

		container.appendChild(item);
	});
}


function runScholarScrape(scholar_id) {
	var status_element = document.getElementById('scholar-search-status') ||
		document.getElementById('scholar-scrape-status') ||
		document.getElementById('author-scholar-status');

	if (status_element) {
		status_element.textContent = 'Scraping Scholar profile…';
		status_element.style.color = '#94a3b8';
	}

	fetch('/api/authors/scholar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ scholar_id: scholar_id }),
	})
		.then(function (res) {
			if (!res.ok) {
				return res.json().then(function (body) {
					throw new Error(body.detail || 'Scrape failed (' + res.status + ')');
				}).catch(function (err) {
					if (err.message) throw err;
					throw new Error('Scrape failed (' + res.status + ')');
				});
			}
			return res.json();
		})
		.then(function (author) {
			hideDropdown();
			searchInput.value = author.name || '';
			currentAuthorId = author.author_id;
			currentFields   = author.fields || [];
			renderAuthorCard(author);
			renderPlots(author.author_id, author.fields || []);
			papersSection.innerHTML = '';
			fetch('/api/authors/' + encodeURIComponent(author.author_id))
				.then(function (res) {
					if (!res.ok) throw new Error('Failed to load papers (' + res.status + ')');
					return res.json();
				})
				.then(function (full_author) {
					renderPaperCards(full_author.papers || []);
				});
		})
		.catch(function (err) {
			if (status_element) {
				status_element.textContent = 'Error: ' + err.message;
				status_element.style.color = '#ff3366';
			}
		});
}

  /* ── Search ── */

  function onSearchInput() {
    var query = searchInput.value.trim();

    clearTimeout(searchTimer);
    clearDropdownItems();
    hideDropdown();

    if (query.length < 2) {
      return;
    }

    searchTimer = setTimeout(function () {
      runSearch(query);
    }, 250);
  }

  function runSearch(query) {
    setDropdownStatus('Searching…');
    showDropdown();

    fetch('/api/authors/search?query=' + encodeURIComponent(query))
      .then(function (res) {
        if (!res.ok) {
          throw new Error('Search failed (' + res.status + ')');
        }
        return res.json();
      })
      .then(function (authors) {
        clearDropdownItems();

        if (authors.length === 0) {
          renderScholarPrompt();
          return;
        }

        setDropdownStatus('');

        authors.forEach(function (author) {
          var item = document.createElement('div');
          item.className = 'dropdown-item';

          var scoreRounded = (author.author_score || 0).toFixed(2);
          item.innerHTML =
            '<span class="item-score">' + escapeHtml(scoreRounded) + '</span>' +
            '<div class="item-name">' + escapeHtml(author.name) + '</div>' +
            '<div class="item-meta">' +
              escapeHtml(author.institution || '—') +
              ' &nbsp;·&nbsp; ' +
              escapeHtml(author.total_papers || 0) + ' papers' +
            '</div>';

          item.addEventListener('click', function () {
            selectAuthor(author);
          });

          dropdown.appendChild(item);
        });
      })
      .catch(function (err) {
        clearDropdownItems();
        setDropdownStatus('Error: ' + err.message);
      });
  }

  /* ── Author selection ── */

  function selectAuthor(author) {
    hideDropdown();
    searchInput.value   = author.name;
    currentAuthorId     = author.author_id;
    currentFields       = author.fields || [];

    renderAuthorCard(author);
    renderPlots(author.author_id, author.fields || []);
    papersSection.innerHTML = '';

    fetch('/api/authors/' + encodeURIComponent(author.author_id))
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load papers (' + res.status + ')');
        return res.json();
      })
      .then(function (full_author) {
        renderPaperCards(full_author.papers || []);
      });
  }



  function renderAuthorCard(author) {
    var total_citations = author.total_citations || 0;

    authorInfo.innerHTML =
      '<h2>' + escapeHtml(author.name) + '</h2>' +
      '<div class="institution">' + escapeHtml(author.institution || '—') + '</div>' +
      '<div class="stats-row">' +
        '<div class="stat-item">' +
          '<span class="stat-label">Total Citations</span>' +
          '<span class="stat-value">' + escapeHtml(total_citations) + '</span>' +
        '</div>' +
        '<div class="stat-item">' +
          '<span class="stat-label">Total Papers</span>' +
          '<span class="stat-value">' + escapeHtml(author.total_papers || 0) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="card-not-you-section">' +
        '<span class="card-not-you-toggle">Not you? use your scholar id instead</span>' +
        '<div id="author-scholar-id-section">' +
          '<div class="author-scholar-id-row">' +
            '<input id="author-scholar-id-input" type="text" placeholder="e.g. 2w2RgPkAAAAJ (id is listed in the URL on your scholar profile as user=id" />' +
            '<button id="author-scholar-go-btn">Go</button>' +
          '</div>' +
          '<div id="author-scholar-status"></div>' +
        '</div>' +
      '</div>';

    authorCard.classList.add('visible');
    attachCardNotYouListeners();
  }

  function attachCardNotYouListeners() {
    var card_toggle = authorInfo.querySelector('.card-not-you-toggle');
    var scholar_id_section = document.getElementById('author-scholar-id-section');
    var scholar_id_input = document.getElementById('author-scholar-id-input');
    var scholar_go_button = document.getElementById('author-scholar-go-btn');

    if (!card_toggle || !scholar_id_section || !scholar_id_input || !scholar_go_button) return;

    card_toggle.addEventListener('click', function () {
      scholar_id_section.classList.toggle('visible');
      if (scholar_id_section.classList.contains('visible')) scholar_id_input.focus();
    });

    scholar_go_button.addEventListener('click', function () {
      runCardScholarScrape(scholar_id_input.value.trim());
    });

    scholar_id_input.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      runCardScholarScrape(scholar_id_input.value.trim());
    });
  }

  function runCardScholarScrape(scholar_id) {
    if (!scholar_id) return;
    runScholarScrape(scholar_id);
  }


  function renderPaperCards(papers) {
  papersSection.innerHTML = '';
  if (!papers || papers.length === 0) return;

  var grid = document.createElement('div');
  grid.className = 'papers-grid';

  papers.forEach(function (paper) {
    var card = document.createElement('div');
    card.className = 'paper-card';

    var title_html = paper.paper_url
      ? '<div class="paper-card-title"><a href="' + escapeHtml(paper.paper_url) +
        '" target="_blank" rel="noopener noreferrer">' + escapeHtml(paper.title) + '</a></div>'
      : '<div class="paper-card-title-plain">' + escapeHtml(paper.title) + '</div>';

    var first_author_badge = paper.is_first_author
      ? '<span class="paper-card-first-author">1st author</span>'
      : '';

    var last_author_badge = paper.is_last_author
      ? '<span class="paper-card-first-author">last author</span>'
      : '';

    var year   = paper.year   != null ? String(paper.year)   : '—';
    var cites  = paper.citations != null ? String(paper.citations) : '0';

    card.innerHTML =
      title_html +
      '<div class="paper-card-venue">' + escapeHtml(paper.venue_raw || '—') + '</div>' +
      '<div class="paper-card-footer">' +
        '<div class="paper-card-citations">Citations: <span>' + escapeHtml(cites) + '</span></div>' +
        '<div class="paper-card-meta">' +
          '<span class="paper-card-year">' + escapeHtml(year) + '</span>' +
          first_author_badge +
          last_author_badge +
        '</div>' +
      '</div>';

    grid.appendChild(card);
  });

  papersSection.appendChild(grid);
}



  /* ── Plots ── */
  function renderPlots(author_id, fields) {
    plotsSection.innerHTML = '';

    if (!fields || fields.length === 0) {
      return;
    }

    var active_field = fields[0];
    var container = document.createElement('div');
    container.className = 'plot-container';

    container.innerHTML =
      '<div class="plot-meta">' +
        '<span class="plot-field-title">' + escapeHtml(active_field) + '</span>' +
      '</div>' +
      '<div class="plot-img-wrapper" id="plot-img">' +
        '<div class="plot-loading">Generating plot…</div>' +
      '</div>';

    plotsSection.appendChild(container);

    renderFieldSwitcher(container, author_id, ALL_FIELDS, active_field, function (chosen_field) {
      active_field = chosen_field;
    });

    fetchPlot(author_id);
  }


  function renderFieldSwitcher(container, author_id, fields, active_field, set_active_field) {
    var switcher = document.createElement('div');
    switcher.id = 'field-switcher';

    var toggle = document.createElement('span');
    toggle.className = 'field-switch-toggle';
    toggle.textContent = 'Not your field?';

    var alternatives = document.createElement('div');
    alternatives.className = 'field-switch-options';

    function rebuildAlternatives(current_active) {
      alternatives.innerHTML = '';
      fields.forEach(function (field) {
        var tag = document.createElement('span');
        tag.className = 'field-tag' + (field === current_active ? ' active' : '');
        tag.textContent = field;
	      if (field !== current_active) {
	        tag.addEventListener('click', function () {
	          set_active_field(field);
	          container.querySelector('.plot-field-title').textContent = field;
	          document.getElementById('plot-img').innerHTML = '<div class="plot-loading">Generating plot…</div>';
	          alternatives.classList.remove('visible');
	          rebuildAlternatives(field);
	          fetchPlot(author_id, field);
	        });
	      }
        alternatives.appendChild(tag);
      });
    }



    rebuildAlternatives(active_field);

    toggle.addEventListener('click', function () {
      alternatives.classList.toggle('visible');
    });

    switcher.appendChild(toggle);
    switcher.appendChild(alternatives);
    container.appendChild(switcher);
  }

  function fetchPlot(author_id, field) {
    var plot_url = '/api/authors/' + encodeURIComponent(author_id) + '/plot';
    if (field) {
      plot_url += '?field=' + encodeURIComponent(field);
    }

    fetch(plot_url)
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(body.detail || 'Request failed (' + res.status + ')');
          }).catch(function () {
            throw new Error('Request failed (' + res.status + ')');
          });
        }
        return res.json();
      })
      .then(function (data) {
        var img_wrapper = document.getElementById('plot-img');

        if (!img_wrapper) return;

        var img = document.createElement('img');
        img.src = 'data:image/png;base64,' + data.plot_base64;
        img.alt = 'score distribution';
        img_wrapper.innerHTML = '';
        img_wrapper.appendChild(img);
      })
      .catch(function (err) {
        var img_wrapper = document.getElementById('plot-img');
        if (img_wrapper) {
          img_wrapper.innerHTML = '<div class="plot-error">' + escapeHtml(err.message) + '</div>';
        }
      });
  }


  /* ── Event listeners ── */

  searchInput.addEventListener('input', onSearchInput);

  document.addEventListener('click', function (e) {
    var searchWrapper = searchInput.parentElement;
    if (!searchWrapper.contains(e.target)) {
      hideDropdown();
    }
  });

  searchInput.addEventListener('focus', function () {
    if (searchInput.value.trim().length >= 2 && dropdown.children.length > 1) {
      showDropdown();
    }
  });
}());
