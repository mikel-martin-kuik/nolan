"""Pydantic models for transcript service."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TokenUsage(BaseModel):
    """Token usage tracking for Claude API calls."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0

    @property
    def total_cost(self) -> float:
        """Calculate total cost using Anthropic Sonnet 4.5 pricing.

        Pricing (per 1000 tokens):
        - Input: $0.003
        - Output: $0.015
        - Cache creation: $0.00375
        - Cache read: $0.0003
        """
        return (
            self.input_tokens * 0.003 / 1000 +
            self.output_tokens * 0.015 / 1000 +
            self.cache_creation_tokens * 0.00375 / 1000 +
            self.cache_read_tokens * 0.0003 / 1000
        )


class Session(BaseModel):
    """Session summary information."""

    session_id: str
    summary: str
    first_timestamp: datetime
    last_timestamp: datetime
    message_count: int
    token_usage: TokenUsage
    cwd: Optional[str] = None
    agents: List[str] = Field(default_factory=list)


class MessageContent(BaseModel):
    """Message content with metadata."""

    content: str
    type: str  # user, assistant, tool_use, tool_result, system
    timestamp: Optional[datetime] = None
    tokens: Optional[TokenUsage] = None
    tool_name: Optional[str] = None


class SessionDetail(BaseModel):
    """Complete session with all messages."""

    session: Session
    messages: List[MessageContent]
