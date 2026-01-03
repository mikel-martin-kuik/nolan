"""JSON RPC 2.0 server for transcript service."""
import sys
import json
from typing import Any, Optional

from .session_manager import SessionManager


class JsonRpcError(Exception):
    """JSON RPC error with code."""

    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class JsonRpcServer:
    """JSON RPC 2.0 server handling stdin/stdout communication."""

    # Error codes per JSON RPC 2.0 spec
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603

    # Custom error codes
    PYTHON_SERVICE_ERROR = 1
    SESSION_NOT_FOUND = 2
    CACHE_ERROR = 3
    FILE_NOT_FOUND = 4
    PATH_VALIDATION_ERROR = 5

    def __init__(self):
        """Initialize RPC server."""
        self.manager = SessionManager()
        self.methods = {
            "health_check": self._health_check,
            "get_sessions": self._get_sessions,
            "get_session_detail": self._get_session_detail,
            "export_html": self._export_html,
            "export_markdown": self._export_markdown,
        }

    def run(self):
        """Run server loop, reading from stdin and writing to stdout."""
        for line in sys.stdin:
            try:
                request = json.loads(line.strip())
                response = self._handle_request(request)
            except json.JSONDecodeError as e:
                response = self._error_response(
                    None, self.PARSE_ERROR, f"Invalid JSON: {e}"
                )
            except Exception as e:
                response = self._error_response(
                    None, self.INTERNAL_ERROR, f"Unexpected error: {e}"
                )

            print(json.dumps(response), flush=True)

    def _handle_request(self, request: dict) -> dict:
        """Handle single JSON RPC request.

        Args:
            request: JSON RPC request dict

        Returns:
            JSON RPC response dict
        """
        # Validate request format
        if not isinstance(request, dict):
            return self._error_response(
                None, self.INVALID_REQUEST, "Request must be object"
            )

        request_id = request.get("id")
        jsonrpc = request.get("jsonrpc")
        method = request.get("method")
        params = request.get("params", {})

        # Validate JSON RPC version
        if jsonrpc != "2.0":
            return self._error_response(
                request_id, self.INVALID_REQUEST, "jsonrpc must be '2.0'"
            )

        # Validate method
        if not method or not isinstance(method, str):
            return self._error_response(
                request_id, self.INVALID_REQUEST, "Invalid method"
            )

        # Find handler
        handler = self.methods.get(method)
        if not handler:
            return self._error_response(
                request_id, self.METHOD_NOT_FOUND, f"Method not found: {method}"
            )

        # Execute method
        try:
            result = handler(params)
            return self._success_response(request_id, result)
        except JsonRpcError as e:
            return self._error_response(request_id, e.code, e.message)
        except ValueError as e:
            return self._error_response(
                request_id, self.PATH_VALIDATION_ERROR, str(e)
            )
        except FileNotFoundError as e:
            return self._error_response(request_id, self.FILE_NOT_FOUND, str(e))
        except Exception as e:
            return self._error_response(
                request_id, self.PYTHON_SERVICE_ERROR, f"Service error: {e}"
            )

    def _success_response(self, request_id: Any, result: Any) -> dict:
        """Build success response."""
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    def _error_response(self, request_id: Any, code: int, message: str) -> dict:
        """Build error response."""
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": code, "message": message},
        }

    # RPC method handlers

    def _health_check(self, params: dict) -> dict:
        """Handle health_check RPC method."""
        return self.manager.health_check()

    def _get_sessions(self, params: dict) -> list:
        """Handle get_sessions RPC method."""
        project = params.get("project")
        from_date = params.get("from_date")
        to_date = params.get("to_date")

        sessions = self.manager.get_sessions(project, from_date, to_date)

        # Convert to JSON-serializable format
        return [
            {
                "session_id": s.session_id,
                "summary": s.summary,
                "first_timestamp": s.first_timestamp.isoformat(),
                "last_timestamp": s.last_timestamp.isoformat(),
                "message_count": s.message_count,
                "token_usage": {
                    "input_tokens": s.token_usage.input_tokens,
                    "output_tokens": s.token_usage.output_tokens,
                    "cache_creation_tokens": s.token_usage.cache_creation_tokens,
                    "cache_read_tokens": s.token_usage.cache_read_tokens,
                    "total_cost": s.token_usage.total_cost,
                },
                "cwd": s.cwd,
                "agents": s.agents,
            }
            for s in sessions
        ]

    def _get_session_detail(self, params: dict) -> dict:
        """Handle get_session_detail RPC method."""
        session_id = params.get("session_id")
        if not session_id:
            raise JsonRpcError(self.INVALID_PARAMS, "session_id required")

        detail = self.manager.get_session_detail(session_id)

        # Convert to JSON-serializable format
        return {
            "session": {
                "session_id": detail.session.session_id,
                "summary": detail.session.summary,
                "first_timestamp": detail.session.first_timestamp.isoformat(),
                "last_timestamp": detail.session.last_timestamp.isoformat(),
                "message_count": detail.session.message_count,
                "token_usage": {
                    "input_tokens": detail.session.token_usage.input_tokens,
                    "output_tokens": detail.session.token_usage.output_tokens,
                    "cache_creation_tokens": detail.session.token_usage.cache_creation_tokens,
                    "cache_read_tokens": detail.session.token_usage.cache_read_tokens,
                    "total_cost": detail.session.token_usage.total_cost,
                },
                "cwd": detail.session.cwd,
                "agents": detail.session.agents,
            },
            "messages": [
                {
                    "content": m.content,
                    "type": m.type,
                    "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                    "tokens": (
                        {
                            "input_tokens": m.tokens.input_tokens,
                            "output_tokens": m.tokens.output_tokens,
                            "cache_creation_tokens": m.tokens.cache_creation_tokens,
                            "cache_read_tokens": m.tokens.cache_read_tokens,
                            "total_cost": m.tokens.total_cost,
                        }
                        if m.tokens
                        else None
                    ),
                    "tool_name": m.tool_name,
                }
                for m in detail.messages
            ],
        }

    def _export_html(self, params: dict) -> dict:
        """Handle export_html RPC method."""
        session_id = params.get("session_id")
        output_path = params.get("output_path")

        if not session_id:
            raise JsonRpcError(self.INVALID_PARAMS, "session_id required")
        if not output_path:
            raise JsonRpcError(self.INVALID_PARAMS, "output_path required")

        return self.manager.export_html(session_id, output_path)

    def _export_markdown(self, params: dict) -> dict:
        """Handle export_markdown RPC method."""
        session_id = params.get("session_id")
        output_path = params.get("output_path")

        if not session_id:
            raise JsonRpcError(self.INVALID_PARAMS, "session_id required")
        if not output_path:
            raise JsonRpcError(self.INVALID_PARAMS, "output_path required")

        return self.manager.export_markdown(session_id, output_path)
