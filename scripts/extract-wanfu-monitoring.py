import json, hashlib
from pathlib import Path
import openpyxl
p = Path('C:/Users/sqw/Desktop/扬州万福大桥监测数据.xlsx')
w = openpyxl.load_workbook(p, read_only=True, data_only=True)
data = {'source': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'sheets': []}
for s in w:
    rows = iter(s.values)
    headers = next(rows)
    data['sheets'].append({'name': s.title, 'rows': [dict(zip(headers, r)) for r in rows if any(v is not None for v in r)]})
Path('runtime/wanfu-source.json').write_text(json.dumps(data, ensure_ascii=False, default=str), encoding='utf-8')
print([(s['name'], len(s['rows'])) for s in data['sheets']])
