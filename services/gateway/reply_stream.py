"""Incrementally decode validated segments from a structured LLM reply."""

import json
import re

from .contracts import Reply, Segment

MAX_REPLY_CHARS = 128_000
_PREFIX = re.compile(r'^\s*\{\s*"segments"\s*:\s*\[')


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate reply key")
        result[key] = value
    return result


class ReplyStream:
    """Yield complete, validated array items, then verify the entire reply.

    A partial response is never accepted for persistence. Consumers must exhaust
    the stream successfully before saving the exchange.
    """

    def __init__(self):
        self._source = ""
        self._position: int | None = None
        self._closed = False
        self._finished = False
        self._segments: list[Segment] = []
        self._decoder = json.JSONDecoder(object_pairs_hook=_unique_object)

    def feed(self, chunk: str) -> list[Segment]:
        if self._finished:
            raise ValueError("Reply already finished")
        if len(self._source) + len(chunk) > MAX_REPLY_CHARS:
            raise ValueError("Provider reply too large")
        self._source += chunk
        if self._closed:
            return []
        if self._position is None:
            prefix = _PREFIX.match(self._source)
            if prefix is None:
                return []
            self._position = prefix.end()
        ready = []
        while self._position is not None:
            pos = self._position
            while pos < len(self._source) and self._source[pos] in " \t\r\n":
                pos += 1
            if pos == len(self._source):
                break
            if self._source[pos] == "]":
                self._closed = True
                break
            try:
                value, end = self._decoder.raw_decode(self._source, pos)
            except json.JSONDecodeError:
                # A JSON token may be split anywhere, including an escape.
                break
            while end < len(self._source) and self._source[end] in " \t\r\n":
                end += 1
            if end == len(self._source):
                break
            delimiter = self._source[end]
            if delimiter not in ",]":
                raise ValueError("Invalid reply segment delimiter")
            if len(self._segments) >= 4:
                raise ValueError("Too many reply segments")
            segment = Segment.model_validate(value, strict=True)
            self._segments.append(segment)
            ready.append(segment)
            self._position = end + 1
            if delimiter == "]":
                self._closed = True
                break
        return ready

    def finish(self) -> list[Segment]:
        if self._finished:
            raise ValueError("Reply already finished")
        self._finished = True
        reply = Reply.model_validate(
            json.loads(self._source, object_pairs_hook=_unique_object), strict=True
        )
        count = len(self._segments)
        if reply.segments[:count] != self._segments:
            raise ValueError("Streamed reply differs from final reply")
        return reply.segments[count:]
