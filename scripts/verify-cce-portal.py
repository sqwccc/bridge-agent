"""Reuse the existing isolated image checks through a real prefix-stripping Nginx."""
from pathlib import Path
import sys
import os

root = Path(__file__).resolve().parents[1]
script = root / 'scripts/verify-cce-image.py'
source = script.read_text(encoding='utf-8')
source = source.replace("calls = []", "calls = []\nportal = 'bridgemind-portal-' + suffix\nportal_started = False\nportal_config = ROOT / 'runtime' / (portal + '.conf')\nportal_config.write_text('server { listen 80; location /zntmh/ql/ { proxy_pass http://' + app + ':18089/; proxy_http_version 1.1; proxy_set_header Connection \"\"; proxy_buffering off; proxy_read_timeout 300s; } }', encoding='utf-8')")
source = source.replace("    port = docker('port', app, '18089/tcp').rsplit(':', 1)[1]", """    if not portal_started:
        docker('run', '-d', '--name', portal, '--network', network,
               '-p', '127.0.0.1::80', '-v', str(portal_config) + ':/etc/nginx/conf.d/default.conf:ro', 'nginx:latest')
        portal_started = True
    port = docker('port', portal, '80/tcp').rsplit(':', 1)[1]""")
source = source.replace("base = f'http://127.0.0.1:{port}'", "base = f'http://127.0.0.1:{port}/zntmh/ql'")
source = source.replace("    body = {'question': 'hello'", """    subprocess.run(['node', str(ROOT / 'scripts/verify-cce-portal-browser.cjs'), base], check=True)
    direct_port = docker('port', app, '18089/tcp').rsplit(':', 1)[1]
    direct_base = 'http://127.0.0.1:' + direct_port + '/zntmh/ql'
    subprocess.run(['node', str(ROOT / 'scripts/verify-cce-portal-browser.cjs'), direct_base], check=True)
    for check_path in ['/health/live', '/health/ready', '/api/v1/auth/config']:
        with client.open(direct_base + check_path, timeout=15) as response:
            assert response.status == 200
    with client.open(direct_base, timeout=15) as response:
        assert response.url == direct_base + '/'
    evidence['direct_access'] = 'prefixed SPA, assets, API, health, slash redirect and reload passed'
    body = {'question': 'hello'""")
report_dir = Path(os.environ.get('CCE_VERIFICATION_DIR', str(root / 'runtime' / 'cce-portal-verification'))).resolve()
report_dir.mkdir(parents=True, exist_ok=True)
os.environ['CCE_VERIFICATION_DIR'] = str(report_dir)
source = source.replace("(ROOT / 'runtime' / 'cce-image-verification.json')", "Path(" + repr(str(report_dir / 'verification.json')) + ")")
source = source.replace("finally:\n    docker('rm'", "finally:\n    docker('rm', '-f', portal, check=False)\n    portal_config.unlink(missing_ok=True)\n    docker('rm'")
if len(sys.argv) == 1:
    sys.argv.append('bridgemind:20261102-cce-p18089-portal-direct')
exec(compile(source, str(script), 'exec'), {'__name__': '__main__', '__file__': str(script)})
