"""Live local SSE smoke checks; saves compact timings and evidence counts, never keys."""
import json
import time
from pathlib import Path
import urllib.request
import http.cookiejar

ROOT = Path(__file__).resolve().parents[1]
session = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
base = 'http://127.0.0.1:8088/api/v1/'


def ask(question, scope='network', bridge_id=None, conversation_id=None):
    with session.open(base + 'auth/csrf', timeout=10) as r:
        csrf = json.load(r)['data']
    started = time.monotonic()
    payload = {'question': question, 'scope': scope, 'pageFilters': {}}
    if bridge_id:
        payload['bridgeId'] = bridge_id
    if conversation_id:
        payload['conversationId'] = conversation_id
    response = session.open(urllib.request.Request(base + 'agent/ask', data=json.dumps(payload).encode(), headers={csrf['headerName']: csrf['token'], 'Content-Type': 'application/json'}), timeout=190)
    event = ''
    result = {'question': question, 'events': [], 'chunks': 0, 'answer': ''}
    for raw_line in response:
        line = raw_line.decode('utf-8').strip()
        if line.startswith('event:'):
            event = line[6:].strip()
        elif line.startswith('data:'):
            data = json.loads(line[5:])
            result['events'].append(event)
            if event == 'meta':
                result['conversationId'] = data['conversationId']
            if event == 'plan':
                result['plan'] = data
            if event == 'evidence':
                result['evidence'] = data
            if event in ('delta', 'replace'):
                result.setdefault('firstTokenSeconds', round(time.monotonic() - started, 2))
                result['chunks'] += 1
                result['answer'] = ('' if event == 'replace' else result['answer']) + data['text']
            if event == 'error':
                result['error'] = data
    result['elapsedSeconds'] = round(time.monotonic() - started, 2)
    print(json.dumps({k: v for k, v in result.items() if k not in ('evidence', 'answer', 'events', 'conversationId')}, ensure_ascii=False), flush=True)
    assert 'done' in result['events'] and 'error' not in result, result.get('error')
    return result


if __name__ == '__main__':
    results = []
    try:
        results.append(ask('推荐一部电影'))
        assert results[-1]['plan']['route'] == 'out_of_scope'
        assert 'evidence' not in results[-1]
        results.append(ask('系统当前接入多少座桥梁？各地市分别多少？'))
        assert results[-1]['chunks'] > 1
        assert results[-1]['evidence']['data']['总体统计']['total'] == 131
        results.append(ask('其中扬州呢？', conversation_id=results[-1]['conversationId']))
        assert results[-1]['evidence']['data']['总体统计']['total'] == 43
        results.append(ask('汇总这座桥全部历史病害的数量、部位和处理状态', 'bridge', '15032610123365813067'))
        assert results[-1]['plan']['topic'] == 'defects'
    finally:
        (ROOT / 'runtime/agent-stream-live.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
