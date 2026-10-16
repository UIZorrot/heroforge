"""Structured forge requests with a narrow compatibility fallback for gateways."""
import logging
from types import SimpleNamespace

from openai import BadRequestError


class OpenAICompatibleModel:
    def __init__(self, client, model_name, provider):
        self._client = client
        self._model_name = model_name
        self.provider = provider
        self._supports_schema = True

    def generate_content(self, contents, *, response_schema=None, schema_name='forge', **_kwargs):
        messages = self._to_messages(contents)
        structured = response_schema is not None and self._supports_schema
        response_format = {'type': 'json_schema', 'json_schema': {'name': schema_name, 'strict': True, 'schema': response_schema}} if structured else {'type': 'json_object'}
        try:
            response = self._client.chat.completions.create(model=self._model_name, messages=messages, response_format=response_format)
        except BadRequestError as error:
            # A schema capability rejection may fall back once; authentication,
            # quota, transport errors and invalid schemas must not be hidden.
            body = error.body if isinstance(error.body, dict) else {}
            body = body.get('error', body)
            message = str(body.get('message', '')).lower() if isinstance(body, dict) else ''
            unsupported = 'json_schema' in message and any(word in message for word in ('unsupported', 'not supported', 'not support')) and 'invalid schema' not in message
            if not structured or not unsupported:
                raise
            self._supports_schema = False
            logging.info('Forge gateway does not support json_schema; JSON mode with server validation remains enabled')
            response = self._client.chat.completions.create(model=self._model_name, messages=messages, response_format={'type': 'json_object'})
        choice = response.choices[0] if response.choices else None
        if not choice or choice.finish_reason != 'stop' or getattr(choice.message, 'refusal', None):
            raise ValueError('The forge model did not return a complete structured result.')
        return SimpleNamespace(text=choice.message.content or '')

    @staticmethod
    def _to_messages(contents):
        if isinstance(contents, str):
            return [{'role': 'user', 'content': contents}]
        if not isinstance(contents, (list, tuple)):
            raise TypeError('Unsupported forge content type.')
        parts = []
        for item in contents:
            if isinstance(item, str):
                parts.append({'type': 'text', 'text': item})
            elif isinstance(item, dict) and item.get('type') == 'image_png_base64':
                parts.append({'type': 'image_url', 'image_url': {'url': f"data:image/png;base64,{item['data']}"}})
            else:
                raise TypeError('Unsupported forge content part.')
        return [{'role': 'user', 'content': parts}]
