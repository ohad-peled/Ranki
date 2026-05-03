# Ranki

Author-level research impact scoring. Search by name, see where you rank among your peers.

## Why Ranki?
Academic impact is hard to measure fairly. Counting citations rewards popularity but ignores where those citations come from. Counting papers rewards prolixity. Ranki tries to balance both by penalizing venue shopping while acknowledging that research matures over time. 
You provide a name and the the system enriches it with metadata, cross-references journal rankings, and tells you how you compare within your field. The underlying assumption is simple: impact builds over time. A paper in a top-tier journal with 100 citations matters more than 10 papers in low-impact venues. But a researcher with 5 papers should not be compared directly to one with 50. We normalize by career years to level the playing field.

## How is Ranki computed?
The ranking combines publication quality, citation impact, and career productivity into a single normalized score.
All scores are field-specific.

## Per-paper score

```
paper_score = author_weight × (0.3 × citation_intensity + 0.7 × journal_prestige)
```

- **author_weight**: 1.0 if first author, 0.1 if co-author. First authorship indicates direct contribution.
- **citation_intensity**: citations ÷ paper age. A 2-year-old paper with 20 citations outranks a 10-year-old one.
- **journal_prestige**: SCImago Journal Rank (SJR)—normalized journal impact across fields. Weighted at 0.7 because venue choice signals research quality.

### Author score

```
author_score = sum(paper_scores) / active_years
```

- **active_years** = current year − PhD start year + 1
- Normalization ensures researchers are ranked fairly regardless of career length
- Log₁p compression reduces influence of extreme outliers

## Finding your Ranki

To be found on Ranki, you need a **Google Scholar profile**. Without one, the system cannot locate your publication record.

## Questions, suggestions, bugs?

For more details, feel free to reach out at [ohad.peled@mail.huji.ac.il](mailto:ohad.peled@mail.huji.ac.il) or on [LinkedIn](https://www.linkedin.com/in/ohad-peled-a99181176/)

