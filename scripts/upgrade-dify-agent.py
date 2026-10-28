"""Configure separate classifier and answer apps. No database tools or credentials in Dify."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import io
import zipfile
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('configure_dify', ROOT / 'scripts/configure-dify.py')
configurer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configurer)


def main():
    state = configurer.login()
    current = configurer.call('/apps/' + state['app_id'])
    config = current.get('model_config')
    if not config:
        raise RuntimeError('Existing Dify model configuration unavailable')
    # Keep a local rollback copy, never print model credentials or app keys.
    backup = ROOT / 'runtime/dify-before-stream-upgrade.json'
    if not backup.exists():
        backup.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    base = {key: copy.deepcopy(config[key]) for key in ('model',) if key in config}
    base.update({
        'prompt_type': 'simple',
        'user_input_form': [{'paragraph': {'label': '后端上下文', 'variable': 'bridge_context', 'required': True, 'max_length': 60000}}],
        'opening_statement': '查询系统接入桥梁资料，所有业务数据由后端受控提供。',
        'suggested_questions': [], 'suggested_questions_after_answer': {'enabled': False},
        'speech_to_text': {'enabled': False}, 'text_to_speech': {'enabled': False},
        'retriever_resource': {'enabled': False}, 'more_like_this': {'enabled': False},
        'sensitive_word_avoidance': {'enabled': False}, 'external_data_tools': [],
        'agent_mode': {'enabled': False, 'tools': []}, 'dataset_configs': {'datasets': {'datasets': []}},
    })
    for role, prompt_file in [('classifier', 'dify-classifier-prompt.txt'), ('answer', 'dify-answer-prompt.txt')]:
        if role == 'classifier' and not state.get('classifier_app_id'):
            app = configurer.call('/apps', {'name': 'BridgeMind 问题分类', 'description': '仅分类和解析查询条件，不接数据库', 'mode': 'chat', 'icon_type': 'emoji', 'icon': '🌉', 'icon_background': '#D5F5F6'})
            state['classifier_app_id'] = app['id']
            configurer.save(state)
        app_id = state['classifier_app_id'] if role == 'classifier' else state['app_id']
        model_config = copy.deepcopy(base)
        model_config['pre_prompt'] = (ROOT / 'docs' / prompt_file).read_text(encoding='utf-8-sig')
        model_config['model']['completion_params'].update({'temperature': 0.1, 'max_tokens': 1200 if role == 'classifier' else 3000, 'thinking': False})
        configurer.call('/apps/' + app_id + '/model-config', model_config)
        key_name = 'classifier_api_key' if role == 'classifier' else 'app_api_key'
        if not state.get(key_name):
            state[key_name] = configurer.call('/apps/' + app_id + '/api-keys', {})['token']
            configurer.save(state)
        (ROOT / 'runtime' / ('dify-' + role + '-config.json')).write_text(json.dumps(model_config, ensure_ascii=False, indent=2), encoding='utf-8')
        headers = {'X-CSRF-Token': urllib.parse.unquote(cookie.value) for cookie in configurer.jar if 'csrf' in cookie.name}
        request = urllib.request.Request(configurer.BASE + '/apps/' + app_id + '/export?include_secret=false', headers=headers)
        with configurer.local.open(request, timeout=30) as response:
            exported = response.read()
        if zipfile.is_zipfile(io.BytesIO(exported)):
            with zipfile.ZipFile(io.BytesIO(exported)) as archive:
                dsl = archive.read('app.yaml').decode('utf-8')
        else:
            dsl = json.loads(exported)['data']
        filename = 'dify-classifier-app.yml' if role == 'classifier' else 'dify-bridge-app.yml'
        (ROOT / 'docs' / filename).write_text(dsl, encoding='utf-8')
    configurer.update_env({'DIFY_CLASSIFIER_API_KEY': state['classifier_api_key']})
    print('Classifier and streaming answer apps configured. Database tools disabled. Existing data mode preserved. Restart backend.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Dify upgrade failed: ' + type(error).__name__ + '. Check local service and configuration.', file=sys.stderr)
        sys.exit(1)
