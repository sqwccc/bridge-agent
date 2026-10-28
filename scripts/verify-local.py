"""已启动本地系统的联调验收：只读核对来源、测试会话和接口边界，不修改源数据。"""
import http.cookiejar
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
import psycopg

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('VERIFY_API_URL', 'http://localhost:8088/api/v1/')


def main():
    account = json.loads((ROOT / 'runtime/local-account.json').read_text(encoding='utf-8-sig'))
    session = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    passed = []

    def call(path, body=None, csrf=None, expected=200):
        headers = {'Content-Type': 'application/json'}
        if csrf:
            headers[csrf['headerName']] = csrf['token']
        req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        try:
            response = session.open(req, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        assert response.status == expected, (path, response.status, expected, response.read().decode())
        data = json.load(response)
        return data.get('data')

    call('bridges', expected=401)
    call('auth/login', account, expected=403)
    csrf = call('auth/csrf')
    call('auth/login', {'username': account['username'], 'password': 'incorrect'}, csrf, 401)
    call('auth/login', account, csrf)
    assert call('auth/me')['username'] == account['username']
    passed.append('未登录401、缺少CSRF403、错误密码401、正确登录与当前账号')

    source = psycopg.connect(host='localhost', dbname='bridgemind_source', user='bridgemind_reader',
                            password=os.environ.get('SOURCE_DB_PASSWORD', 'bridgemind_dev_reader'), autocommit=True)
    with source:
        total = source.execute("SELECT count(DISTINCT qlid) FROM qiaoliang.dwd_ql_js_ql_inc WHERE coalesce(sczt,0)=0 AND nullif(trim(qlid),'') IS NOT NULL AND sscsdm LIKE '32%'").fetchone()[0]
        summary = call('dashboard')
        assert summary['total'] == total
        assert sum(g['count'] for g in summary['cities']) == total
        assert len(summary['points']) == summary['located']
        assert len({p['id'] for p in summary['points']}) == summary['located']
        for group in summary['cities']:
            data = call('bridges?city=' + group['code'] + '&size=1')
            assert data['total'] == group['count']
        first = call('bridges?size=3')
        second = call('bridges?size=3&page=2')
        assert not ({b['id'] for b in first['items']} & {b['id'] for b in second['items']})
        assert call('bridges?q=' + urllib.parse.quote("' OR 1=1 --"))['total'] == 0
        call('bridges?page=0', expected=400)
        call('bridges/not-a-real-id', expected=404)
        passed.append('全省及13市底数核对、点位去重、分页、字面量检索和参数边界')

        # 即使关闭会话只读标志，角色本身也没有写权限；WHERE false 保证无数据变更。
        source.execute('SET default_transaction_read_only=off')
        try:
            source.execute('UPDATE qiaoliang.dwd_ql_js_ql_inc SET qlmc=qlmc WHERE false')
            raise AssertionError('来源账号不应有 UPDATE 权限')
        except psycopg.errors.InsufficientPrivilege:
            pass
        assert not source.execute("SELECT 1 FROM information_schema.tables WHERE table_name='flyway_schema_history'").fetchone()
        passed.append('来源角色无写权限，来源库没有业务迁移表')

    points = call('bridges/10020200311/monitoring/points')
    assert points
    point = points[0]
    query = urllib.parse.urlencode({'point': point['pointId'], 'device': point['deviceId'], 'metric': point['metric'] or '', 'from':'2026-10-01T00:00:00','to':'2026-10-02T00:00:00'})
    assert call('bridges/10020200311/monitoring/samples?' + query)['items'] == []
    call('bridges/32010001144800221/monitoring/samples?' + query, expected=400)
    call('alarms?from=2026-10-02T00:00:00&to=2026-10-01T00:00:00', expected=400)
    call('alarms?from=2026-01-01T00:00:00&to=2026-10-01T00:00:00', expected=400)
    alarms = call('alarms?from=2025-11-01T00:00:00&to=2025-11-30T23:59:00')
    assert alarms['total'] > 0
    assert all(a['time'] >= b['time'] for a, b in zip(alarms['items'], alarms['items'][1:]))
    reports = call('bridges/32010001144800221/reports')
    assert reports and reports[0]['status'] == 'SOURCE_NOT_CONFIGURED'
    call('bridges/32010001144800221/reports/' + urllib.parse.quote(reports[0]['id']) + '/file', expected=404)
    passed.append('测点归属、缺测、历史报警排序、日期边界、报告未配置附件')
    call('auth/logout', {}, call('auth/csrf'))
    call('auth/me', expected=401)
    passed.append('退出销毁会话')
    (ROOT / 'runtime/verification.json').write_text(json.dumps({'passed': passed, 'total': total, 'located': summary['located']},ensure_ascii=False,indent=2),encoding='utf-8')
    for item in passed:
        print('PASS:', item)


if __name__ == '__main__':
    main()
