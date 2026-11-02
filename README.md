# IHK Koblenz Regional Entrepreneurship Intelligence

Dries's dashboard, refreshed on 22 October 2026 from the current pipeline company data. It retains the original design, eleven IHK Koblenz territories (ten Landkreise and Stadt Koblenz), the Rheinland-Pfalz benchmark, eight growth classifications, and **2020–2024 only**, as requested.

## Open locally

From this directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [the dashboard](http://127.0.0.1:8000). The bundled `data.js` works without rebuilding. Select a data scenario, classification and comparison year; the district selector controls the detail chart and value-status panel.

## Sources and regeneration

The builder reads `pipeline/data/processed/09_orbis_rlp_employment_imputed.csv`, the saved final-dashboard metadata, and the selected October source manifest. It imports the existing production `calculate_growth` function to retain its exact classification rules. No ingestion, paid retrieval, model training, raw-file changes or production-data changes occur. Python needs the pipeline's pandas and PyYAML dependencies.

From this folder run:

```sh
python3 build_data.py
```

This replaces `data.js`, `metadata.json`, `regional_metrics.csv` and `forecast_values.csv`. The original prototype is preserved in the sibling `../archive/20261022T074004Z/` directory. The old aggregation workbook is no longer a dependency.

The selected source is the **19 October 2026 ORBIS export**, with provider update **16 October** and pipeline generation **21 October**. It contains 55,406 source companies, 53,703 geographically matched RLP companies and 21,118 IHK Koblenz companies. The 1,703 unresolved geography records stay outside regional denominators. Read generated `metadata.json` for exact generation timestamps and the input CSV checksum. The source export is a company sample, not a census or establishment-employment dataset.

## Scenarios

- **Nur berichtet:** original reported employment only.
- **Berichtet + interpoliert:** reported values plus the saved pipeline's bounded interpolation values, for internal gaps up to three years.
- **Berichtet + interpoliert + prognostiziert** (default): retain those reported and interpolated values; fill remaining gaps with the company's last earlier **reported** employment. This is a historical last-observation forecast sensitivity scenario. Forecasts never use an interpolated or peer-imputed anchor, never use an observation dated after their target year, never fill a known pre-founding year, and never replace a reported value. Without an earlier reported anchor, values remain missing. Horizons range from one to seven years over the 2017–2024 employment inputs; multi-year forecasts have not been separately validated. Every generated forecast has BvD ID, target year, anchor year, horizon and method in `forecast_values.csv`.
- **Pipeline: Interpolation + Peer-Imputation:** the saved current production sensitivity values, including direct and recursive same-year peer growth estimates. These are contemporaneous estimates and are not relabelled as forecasts.

Interpolation can use a later observed anchor, so combined interpolation/forecast results are retrospective sensitivity results, not an ex-ante forecast backtest. No 2025 or 2026 values are used. More complete coverage does not establish forecast accuracy. The last-observation baseline is intentionally simple and may flatten growth over long missing tails. It does not deploy a trained prediction model or supply prediction intervals.

## Denominators and interpretation

Each share is the number classified positively divided by companies with a nonblank classification for that metric, year, region and scenario. Growth requires at least ten employees at the start of the three-year window and available endpoints. Annual-history classes additionally require all relevant annual growth rates; age-based classes require a known founding year. Ineligible is not negative, and a zero denominator stays unavailable. The district-difference KPI is an unweighted average across comparable territories.

The transparency panel reports employment-value status in the selected district/year and how many eligible companies depend on estimates or forecasts in the classification's relevant growth window. Scaler/HighGrowthFirm depend on the endpoints; other classes depend on the full four-year employment window. Scenario eligibility can change, so differences in shares do not isolate effects on a fixed eligible cohort. The trend chart uses the selected scenario and shows district and RLP lines; it does not imply that every underlying company value is observed.

`regional_metrics.csv` contains all scenarios, territories, years and classifications, with positive counts (`count`), eligibility denominators (`obs`), fractional shares, and estimated/forecast-dependent eligible-company counts. `obs` is retained as a compatibility field name and means eligible companies, not necessarily observed-only companies.
