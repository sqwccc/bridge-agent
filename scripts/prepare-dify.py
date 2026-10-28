"""Prepare the isolated WSL Dify installation. Never prints secrets."""
from pathlib import Path
import re
import secrets

root = Path('/opt/bridgemind-dify-1.18.0')
target = root / '.env'
if not target.exists():
    text = (root / '.env.example').read_text()
    settings = {key: secrets.token_hex(32) for key in (
        'SECRET_KEY', 'DB_PASSWORD', 'REDIS_PASSWORD', 'PLUGIN_DAEMON_KEY',
        'PLUGIN_DIFY_INNER_API_KEY', 'DIFY_AGENT_API_TOKEN',
        'DIFY_AGENT_SERVER_SECRET_KEY', 'DIFY_AGENT_LOCAL_SANDBOX_AUTH_TOKEN')}
    settings.update(COMPOSE_PROFILES='weaviate,postgresql',
                    ENABLE_COLLABORATION_MODE='false',
                    EXPOSE_NGINX_PORT='127.0.0.1:8090',
                    EXPOSE_NGINX_SSL_PORT='127.0.0.1:8443',
                    EXPOSE_PLUGIN_DEBUGGING_PORT='5003',
                    CELERY_WORKER_AMOUNT='2',
                    PLUGIN_PYTHON_ENV_INIT_TIMEOUT='600')
    for key, value in settings.items():
        text, count = re.subn(r'^' + key + r'=.*$', key + '=' + value, text, flags=re.M)
        if not count:
            text += '\n' + key + '=' + value + '\n'
    target.write_text(text)
    target.chmod(0o600)
    print('Created isolated Dify configuration.')
else:
    text = target.read_text().replace('EXPOSE_PLUGIN_DEBUGGING_PORT=127.0.0.1:5003', 'EXPOSE_PLUGIN_DEBUGGING_PORT=5003')
    target.write_text(text)
    print('Existing configuration preserved.')
