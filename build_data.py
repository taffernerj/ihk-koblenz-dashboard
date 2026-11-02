"""Build Dries's 2020–2024 dashboard from current saved pipeline data.

Run with python3 build_data.py. No raw input or production output is modified.
"""
import csv
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[2]
PIPELINE = PROJECT / 'pipeline'
sys.path.insert(0, str(PIPELINE))
from src.step_09_calculate_growth_metrics import calculate_growth

YEARS = list(range(2020, 2025))
EMPLOYMENT_YEARS = list(range(2017, 2025))
METRICS = ['Scaler', 'HighGrowthFirm', 'ConsistentHighGrowthFirm',
           'VeryHighGrowthFirm', 'Gazelle', 'Mature', 'Scaleup', 'Superstar']
DISTRICTS = [
    ('Ahrweiler', 'Ahrweiler'), ('Altenkirchen', 'Altenkirchen (Ww)'),
    ('Bad Kreuznach', 'Bad Kreuznach'), ('Birkenfeld', 'Birkenfeld'),
    ('Cochem-Zell', 'Cochem-Zell'), ('Koblenz', 'Koblenz'),
    ('Mayen-Koblenz', 'Mayen-Koblenz'), ('Neuwied', 'Neuwied'),
    ('Rhein-Hunsrück-Kreis', 'Rhein-Hunsrück-Kreis'),
    ('Rhein-Lahn-Kreis', 'Rhein-Lahn-Kreis'), ('Westerwaldkreis', 'Westerwaldkreis')]
SCENARIOS = {
    'observed': 'Nur berichtet',
    'interpolated': 'Berichtet + interpoliert',
    'forecast': 'Berichtet + interpoliert + prognostiziert',
    'peer': 'Pipeline: Interpolation + Peer-Imputation',
}


def aggregate(frame, statuses, population):
    result = {'metrics': {}, 'coverage': [], 'population': int(population.sum())}
    for year in YEARS:
        counts = statuses.loc[population, year].value_counts()
        result['coverage'].append({str(k): int(v) for k, v in counts.items()})
    for metric in METRICS:
        series = {k: [] for k in ('share', 'count', 'obs', 'estimated', 'forecast')}
        for year in YEARS:
            flags = pd.to_numeric(frame[f'{metric} {year}'], errors='coerce')
            eligible = population & flags.notna()
            # Endpoint classes need endpoints; other classes also need annual history.
            window = [year - 3, year] if metric in METRICS[:2] else list(range(year - 3, year + 1))
            status_window = statuses[window]
            estimated = status_window.isin(['interpolated', 'forecast', 'peer_imputed', 'peer_imputed_recursive']).any(axis=1)
            forecast = status_window.eq('forecast').any(axis=1)
            denominator = int(eligible.sum())
            numerator = int(flags.loc[eligible].eq(1).sum())
            for key, value in {'share': numerator / denominator if denominator else None,
                               'count': numerator, 'obs': denominator,
                               'estimated': int((eligible & estimated).sum()),
                               'forecast': int((eligible & forecast).sum())}.items():
                series[key].append(value)
        result['metrics'][metric] = series
    return result


def main():
    source = PIPELINE / 'data/processed/09_orbis_rlp_employment_imputed.csv'
    source_metadata = PIPELINE / 'results/dashboard_final/metadata.json'
    manifest = PIPELINE / 'data/raw/20261019_ORBIS Export/manifest.yaml'
    data = pd.read_csv(source, dtype=str, keep_default_na=False)
    observed = pd.DataFrame({y: pd.to_numeric(data[f'Number of employees {y}'], errors='coerce') for y in EMPLOYMENT_YEARS})
    founded = pd.to_numeric(data['Founded Year'], errors='coerce')
    observed_status = pd.DataFrame({y: pd.Series('missing', index=data.index) for y in EMPLOYMENT_YEARS})
    for y in EMPLOYMENT_YEARS:
        observed_status.loc[founded.gt(y), y] = 'not_applicable'
        observed_status.loc[observed[y].notna(), y] = 'observed'
    interpolated = observed.copy()
    interpolation_status = observed_status.copy()
    peer = pd.DataFrame({y: pd.to_numeric(data[f'Employment value {y}'], errors='coerce') for y in EMPLOYMENT_YEARS})
    peer_status = pd.DataFrame({y: data[f'Employment value status {y}'] for y in EMPLOYMENT_YEARS})
    for y in EMPLOYMENT_YEARS:
        mask = peer_status[y].eq('interpolated')
        interpolated.loc[mask, y] = peer.loc[mask, y]
        interpolation_status.loc[mask, y] = 'interpolated'

    # Historical last-observation forecasts use only earlier REPORTED values.
    # Interpolations remain retrospective; do not call the combined series ex ante.
    forecast_values = interpolated.copy()
    forecast_status = interpolation_status.copy()
    last_report = pd.Series(float('nan'), index=data.index)
    last_year = pd.Series(float('nan'), index=data.index)
    forecast_rows = []
    for year in EMPLOYMENT_YEARS:
        eligible = forecast_values[year].isna() & last_report.notna() & ~founded.gt(year)
        forecast_values.loc[eligible, year] = last_report.loc[eligible]
        forecast_status.loc[eligible, year] = 'forecast'
        for index in data.index[eligible]:
            forecast_rows.append({
                'BvD ID number': data.at[index, 'BvD ID number'],
                'rlp_Landkreis': data.at[index, 'rlp_Landkreis'],
                'ihk_koblenz_status': data.at[index, 'ihk_koblenz_status'],
                'target_year': year, 'employment_value': float(last_report.at[index]),
                'status': 'forecast', 'method': 'last_observation',
                'anchor_year': int(last_year.at[index]),
                'horizon_years': year - int(last_year.at[index]),
            })
        reported = observed[year].notna()
        last_report.loc[reported] = observed.loc[reported, year]
        last_year.loc[reported] = year

    metadata = json.loads(source_metadata.read_text())
    import yaml
    raw_metadata = yaml.safe_load(manifest.read_text())
    generated = datetime.now(timezone.utc).isoformat()
    result = {'years': YEARS, 'metrics': METRICS, 'default_scenario': 'forecast', 'scenarios': {},
              'metadata': {'generated_at': generated,
                'pipeline_generated_at': metadata['generated_at'],
                'source_export_date': raw_metadata['source']['export_date'],
                'source_data_update': raw_metadata['source']['data_update'],
                'source_file': str(source.relative_to(PROJECT)),
                'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'population_counts': metadata['row_counts'],
                'forecast_method': 'last_observation',
                'forecast_note': 'Historische Sensitivitätsrechnung: letzter früher berichteter Wert; Prognosehorizont 1–7 Jahre. Keine rückwirkende Nutzung von 2025/2026. Mehrjahresprognosen sind nicht separat validiert. Interpolation nutzt spätere Anker und ist retrospektiv.',
                'share_note': 'Zähler: Unternehmen mit Merkmal. Nenner: Unternehmen mit auswertbarer Klassifikation; mindestens 10 Beschäftigte am Beginn des Dreijahresfensters. Nenner unterscheiden sich nach Jahr, Merkmal und Szenario.',
                'population_note': 'RLP umfasst alle geografisch zugeordneten Unternehmen im Export. Unternehmensdaten, keine Vollerhebung und keine Betriebsstättenstatistik. Gebietsvergleich: zehn Landkreise und Stadt Koblenz.',
              }}
    aggregate_rows = []
    for key, values, statuses in [('observed', observed, observed_status),
                                   ('interpolated', interpolated, interpolation_status),
                                   ('forecast', forecast_values, forecast_status),
                                   ('peer', peer, peer_status)]:
        active = data.copy()
        for year in EMPLOYMENT_YEARS:
            active[f'Dashboard employment {year}'] = values[year]
        active = calculate_growth(active, 'Dashboard employment ')
        all_rlp = pd.Series(True, index=data.index)
        benchmark = aggregate(active, statuses, all_rlp)
        districts = []
        for name, source_name in DISTRICTS:
            mask = data.rlp_Landkreis.eq(source_name) & data.ihk_koblenz_status.eq('yes')
            districts.append({'name': name, 'source_name': source_name, **aggregate(active, statuses, mask)})
        result['scenarios'][key] = {'label': SCENARIOS[key], 'benchmark': benchmark, 'districts': districts}
        for name, region in [('Rheinland-Pfalz', benchmark)] + [(d['name'], d) for d in districts]:
            for metric in METRICS:
                for i, year in enumerate(YEARS):
                    aggregate_rows.append({'scenario': key, 'region': name, 'metric': metric, 'year': year,
                        **{field: series[i] for field, series in region['metrics'][metric].items()}})
        print(f'{key}: {len(data)} RLP companies; 2024 Scaler {benchmark["metrics"]["Scaler"]["count"][-1]}/{benchmark["metrics"]["Scaler"]["obs"][-1]} eligible')

    (HERE / 'data.js').write_text('window.IHK_DATA = ' + json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + ';\n')
    (HERE / 'metadata.json').write_text(json.dumps(result['metadata'], ensure_ascii=False, indent=2) + '\n')
    for filename, rows in [('regional_metrics.csv', aggregate_rows), ('forecast_values.csv', forecast_rows)]:
        with (HERE / filename).open('w', newline='', encoding='utf-8-sig') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else ['BvD ID number', 'target_year', 'employment_value', 'status', 'method', 'anchor_year', 'horizon_years'])
            writer.writeheader()
            writer.writerows(rows)
    print(f'Wrote 4 scenarios, 11 districts, {len(aggregate_rows)} regional metric rows and {len(forecast_rows)} labelled forecast cells. Source: {source}')


if __name__ == '__main__':
    main()
