from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Voice = Literal["hana", "seorin", "isol"]
Mode = Literal["assistant", "companion"]
Service = Literal["demo", "local", "cloud"]
Emotion = Literal["neutral", "happy", "concerned", "surprised", "curious", "thoughtful"]
Gesture = Literal["idle", "nod", "greeting", "tilt", "point"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SessionCreate(StrictModel):
    mode: Mode
    character: Literal["default"] = "default"
    service: Service | None = None
    request_id: UUID | None = None


class TurnInput(StrictModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: Voice = "seorin"


class MemoryInput(StrictModel):
    text: str = Field(min_length=1, max_length=500)


class Segment(StrictModel):
    text: str = Field(min_length=1, max_length=400)
    emotion: Emotion = "neutral"
    gesture: Gesture = "idle"


class Reply(StrictModel):
    segments: list[Segment] = Field(min_length=1, max_length=4)
