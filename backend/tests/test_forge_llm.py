from types import SimpleNamespace

import httpx
import pytest
from openai import BadRequestError

from forge_contract import ANALYSIS_SCHEMA
from forge_llm import OpenAICompatibleModel


def response(reason='stop', refusal=None):
    return SimpleNamespace(choices=[SimpleNamespace(finish_reason=reason, message=SimpleNamespace(content='{}', refusal=refusal))])


def model(results):
    calls = []
    def create(**kwargs):
        calls.append(kwargs)
        value = results.pop(0)
        if isinstance(value, Exception): raise value
        return value
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return OpenAICompatibleModel(client, 'test-model', 'test'), calls


def bad_request(message):
    body = {'message': message, 'param': 'response_format'}
    return BadRequestError(message, response=httpx.Response(400, request=httpx.Request('POST', 'https://example.test')), body=body)


def test_requests_strict_schema_and_preserves_the_actual_uploaded_image():
    adapter, calls = model([response()])
    adapter.generate_content(['Judge this JSON', {'type': 'image_png_base64', 'data': 'test-image'}], response_schema=ANALYSIS_SCHEMA)
    assert calls[0]['response_format']['type'] == 'json_schema'
    assert calls[0]['response_format']['json_schema']['strict'] is True
    assert calls[0]['messages'][0]['content'][1]['image_url']['url'] == 'data:image/png;base64,test-image'


def test_schema_unsupported_gateway_falls_back_once_and_remembers_capability():
    adapter, calls = model([bad_request('json_schema is not supported by this model'), response(), response()])
    adapter.generate_content('Return JSON', response_schema=ANALYSIS_SCHEMA)
    adapter.generate_content('Return JSON again', response_schema=ANALYSIS_SCHEMA)
    assert [call['response_format']['type'] for call in calls] == ['json_schema', 'json_object', 'json_object']


def test_invalid_schema_error_does_not_silently_downgrade():
    adapter, calls = model([bad_request('Invalid schema for json_schema: unsupported schema keyword')])
    with pytest.raises(BadRequestError):
        adapter.generate_content('Return JSON', response_schema=ANALYSIS_SCHEMA)
    assert len(calls) == 1


@pytest.mark.parametrize('reason,refusal', [('length', None), ('content_filter', None), ('stop', 'Refused')])
def test_incomplete_and_refused_outputs_never_get_parsed_as_successful_cards(reason, refusal):
    adapter, _ = model([response(reason, refusal)])
    with pytest.raises(ValueError, match='complete structured result'):
        adapter.generate_content('Return JSON', response_schema=ANALYSIS_SCHEMA)
