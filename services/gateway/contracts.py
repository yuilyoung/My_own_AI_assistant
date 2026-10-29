from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Mode = Literal["assistant", "companion"]
Emotion = Literal["neutral", "happy", "concerned", "surprised"]
Gesture = Literal["idle", "nod", "greeting"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SessionCreate(StrictModel):
    mode: Mode
    character: Literal["default"] = "default"


class TurnInput(StrictModel):
    text: str = Field(min_length=1, max_length=2000)


class MemoryInput(StrictModel):
    text: str = Field(min_length=1, max_length=500)


class Segment(StrictModel):
    text: str = Field(min_length=1, max_length=400)
    emotion: Emotion = "neutral"
    gesture: Gesture = "idle"


class Reply(StrictModel):
    segments: list[Segment] = Field(min_length=1, max_length=4)
