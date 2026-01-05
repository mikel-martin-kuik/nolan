"""Session management using claude-code-log library."""
import sys
from typing import Optional, List
from datetime import datetime
from pathlib import Path
import html
import re
from cachetools import LRUCache
from threading import Lock

from .models import Session, SessionDetail, MessageContent, TokenUsage, SearchMatch, SearchResults, HistoryEntry
from .security import validate_export_path

# claude-code-log imports
from claude_code_log.cache import CacheManager, get_library_version
from claude_code_log.converter import (
    ensure_fresh_cache,
    load_directory_transcripts,
)
from claude_code_log.parser import extract_text_content
from claude_code_log.models import (
    TranscriptEntry,
    UserTranscriptEntry,
    AssistantTranscriptEntry,
    SystemTranscriptEntry,
)


class SessionManager:
    """Manages Claude Code sessions using claude-code-log.

    Phase 2: Fully integrated with claude-code-log library.
    """

    def __init__(self, max_cache_managers=10):
        """Initialize session manager with claude-code-log integration.

        Args:
            max_cache_managers: Maximum number of project cache managers to keep in memory (LRU eviction)
        """
        self.projects_dir = Path.home() / ".claude" / "projects"
        self.cache_managers = LRUCache(maxsize=max_cache_managers)  # LRU cache for project managers
        self.cache_lock = Lock()  # Thread-safe access to cache

    def health_check(self) -> dict:
        """Verify service is running and return version info.

        Returns:
            Dict with status, version, and python_version
        """
        return {
            "status": "ok",
            "version": "0.9.0",
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        }

    def _get_cache_manager(self, project_path: Path) -> CacheManager:
        """Get or create cache manager for a project (thread-safe with LRU eviction).

        Args:
            project_path: Path to the project directory

        Returns:
            CacheManager instance for the project
        """
        cache_key = str(project_path)
        with self.cache_lock:
            if cache_key not in self.cache_managers:
                self.cache_managers[cache_key] = CacheManager(
                    project_path, get_library_version()
                )
            return self.cache_managers[cache_key]

    def get_sessions(
        self,
        project: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> List[Session]:
        """Get list of sessions with optional filters.

        Args:
            project: Filter by project name
            from_date: ISO 8601 date string (inclusive)
            to_date: ISO 8601 date string (inclusive)

        Returns:
            List of Session objects
        """
        sessions = []

        # Get project directories to search
        if project:
            project_path = self.projects_dir / project
            project_paths = [project_path] if project_path.exists() else []
        else:
            # Get all project directories
            if not self.projects_dir.exists():
                return []
            project_paths = [
                d
                for d in self.projects_dir.iterdir()
                if d.is_dir() and list(d.glob("*.jsonl"))
            ]

        # Load sessions from each project
        for project_path in project_paths:
            cache_manager = self._get_cache_manager(project_path)

            # Ensure cache is fresh
            ensure_fresh_cache(
                project_path, cache_manager, from_date, to_date, silent=True
            )

            # Get cached project data
            project_cache = cache_manager.get_cached_project_data()
            if not project_cache or not project_cache.sessions:
                continue

            # Convert SessionCacheData to our Session model
            for session_id, session_cache in project_cache.sessions.items():
                # Apply date filtering
                if from_date or to_date:
                    from datetime import datetime as dt
                    import dateparser

                    session_dt = dt.fromisoformat(session_cache.first_timestamp)

                    if from_date:
                        from_dt = dateparser.parse(from_date)
                        if from_dt and session_dt < from_dt.replace(tzinfo=None):
                            continue

                    if to_date:
                        to_dt = dateparser.parse(to_date)
                        if to_dt and session_dt > to_dt.replace(tzinfo=None):
                            continue

                session = Session(
                    session_id=session_cache.session_id,
                    summary=session_cache.summary or session_cache.first_user_message,
                    first_timestamp=datetime.fromisoformat(
                        session_cache.first_timestamp.replace("Z", "+00:00")
                    ),
                    last_timestamp=datetime.fromisoformat(
                        session_cache.last_timestamp.replace("Z", "+00:00")
                    ),
                    message_count=session_cache.message_count,
                    token_usage=TokenUsage(
                        input_tokens=session_cache.total_input_tokens,
                        output_tokens=session_cache.total_output_tokens,
                        cache_creation_tokens=session_cache.total_cache_creation_tokens,
                        cache_read_tokens=session_cache.total_cache_read_tokens,
                    ),
                    cwd=session_cache.cwd,
                    agents=[],  # Will be populated from messages if needed
                )
                sessions.append(session)

        # Sort by timestamp (most recent first)
        sessions.sort(key=lambda s: s.first_timestamp, reverse=True)
        return sessions

    def _extract_content(self, entry: TranscriptEntry) -> str:
        """Extract text content from a transcript entry."""
        if isinstance(entry, (UserTranscriptEntry, AssistantTranscriptEntry)):
            if hasattr(entry, "message") and entry.message:
                return extract_text_content(entry.message.content)
        elif isinstance(entry, SystemTranscriptEntry):
            if hasattr(entry, "message"):
                return str(entry.message)
        return ""

    def _extract_tokens(self, entry: TranscriptEntry) -> Optional[TokenUsage]:
        """Extract token usage from a transcript entry."""
        if isinstance(entry, AssistantTranscriptEntry):
            if hasattr(entry, "message") and entry.message:
                message = entry.message
                if hasattr(message, "usage") and message.usage:
                    usage = message.usage
                    return TokenUsage(
                        input_tokens=getattr(usage, "input_tokens", 0),
                        output_tokens=getattr(usage, "output_tokens", 0),
                        cache_creation_tokens=getattr(
                            usage, "cache_creation_input_tokens", 0
                        ),
                        cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0),
                    )
        return None

    def _get_message_type(self, entry: TranscriptEntry) -> str:
        """Get message type for display."""
        entry_type = entry.type
        if entry_type in ["user", "assistant", "system"]:
            return entry_type

        # Check if it's a tool use or result
        if isinstance(entry, UserTranscriptEntry) and hasattr(entry, "message"):
            message = entry.message
            if hasattr(message, "content") and isinstance(message.content, list):
                for item in message.content:
                    if isinstance(item, dict):
                        if item.get("type") == "tool_use":
                            return "tool_use"
                        elif item.get("type") == "tool_result":
                            return "tool_result"

        return entry_type

    def _get_tool_name(self, entry: TranscriptEntry) -> Optional[str]:
        """Extract tool name if this is a tool use/result."""
        if isinstance(entry, UserTranscriptEntry) and hasattr(entry, "message"):
            message = entry.message
            if hasattr(message, "content") and isinstance(message.content, list):
                for item in message.content:
                    if isinstance(item, dict) and item.get("type") in [
                        "tool_use",
                        "tool_result",
                    ]:
                        return item.get("name")
        return None

    def get_session_detail(self, session_id: str) -> SessionDetail:
        """Get detailed session information including all messages.

        Args:
            session_id: Session identifier

        Returns:
            SessionDetail object with messages

        Raises:
            ValueError: If session_id not found
        """
        # Find the project containing this session
        session_found = False
        all_messages = []
        session_info = None

        # Search all project directories
        if not self.projects_dir.exists():
            raise ValueError(f"Projects directory not found: {self.projects_dir}")

        project_paths = [
            d
            for d in self.projects_dir.iterdir()
            if d.is_dir() and list(d.glob("*.jsonl"))
        ]

        for project_path in project_paths:
            cache_manager = self._get_cache_manager(project_path)
            ensure_fresh_cache(project_path, cache_manager, silent=True)

            project_cache = cache_manager.get_cached_project_data()
            if not project_cache or session_id not in project_cache.sessions:
                continue

            # Found the session!
            session_found = True
            session_cache = project_cache.sessions[session_id]

            # Load all transcript entries for this project
            entries = load_directory_transcripts(project_path, cache_manager, silent=True)

            # Filter to messages in this session only
            session_messages = [
                entry
                for entry in entries
                if hasattr(entry, "sessionId") and entry.sessionId == session_id
            ]

            # Convert to our MessageContent model
            for entry in session_messages:
                content = self._extract_content(entry)
                if not content:
                    continue  # Skip empty messages

                timestamp_str = getattr(entry, "timestamp", None)
                timestamp = None
                if timestamp_str:
                    try:
                        timestamp = datetime.fromisoformat(
                            timestamp_str.replace("Z", "+00:00")
                        )
                    except (ValueError, AttributeError):
                        pass

                message = MessageContent(
                    content=content,
                    type=self._get_message_type(entry),
                    timestamp=timestamp,
                    tokens=self._extract_tokens(entry),
                    tool_name=self._get_tool_name(entry),
                )
                all_messages.append(message)

            # Create session summary
            session_info = Session(
                session_id=session_cache.session_id,
                summary=session_cache.summary or session_cache.first_user_message,
                first_timestamp=datetime.fromisoformat(
                    session_cache.first_timestamp.replace("Z", "+00:00")
                ),
                last_timestamp=datetime.fromisoformat(
                    session_cache.last_timestamp.replace("Z", "+00:00")
                ),
                message_count=len(all_messages),
                token_usage=TokenUsage(
                    input_tokens=session_cache.total_input_tokens,
                    output_tokens=session_cache.total_output_tokens,
                    cache_creation_tokens=session_cache.total_cache_creation_tokens,
                    cache_read_tokens=session_cache.total_cache_read_tokens,
                ),
                cwd=session_cache.cwd,
                agents=[],
            )
            break

        if not session_found:
            raise ValueError(f"Session not found: {session_id}")

        return SessionDetail(session=session_info, messages=all_messages)

    def export_html(self, session_id: str, output_path: str) -> dict:
        """Export session to HTML format.

        Args:
            session_id: Session to export
            output_path: Absolute path for output file

        Returns:
            Dict with path and size

        Raises:
            ValueError: If session not found or path invalid
        """
        validated_path = validate_export_path(output_path)

        # Phase 1: Basic implementation
        # Phase 3 will use claude-code-log renderers
        session_detail = self.get_session_detail(session_id)

        html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>Session: {session_detail.session.summary}</title>
    <style>
        body {{ font-family: sans-serif; margin: 2rem; }}
        .message {{ margin: 1rem 0; padding: 1rem; border-left: 3px solid #ccc; }}
        .user {{ border-color: #3b82f6; }}
        .assistant {{ border-color: #8b5cf6; }}
        .tool {{ border-color: #10b981; }}
    </style>
</head>
<body>
    <h1>{session_detail.session.summary}</h1>
    <p>Session ID: {session_detail.session.session_id}</p>
    <p>Messages: {session_detail.session.message_count}</p>
    <hr>
"""

        for msg in session_detail.messages:
            escaped_content = html.escape(msg.content)
            escaped_type = html.escape(msg.type)
            html_content += f"""
    <div class="message {escaped_type}">
        <strong>{escaped_type.upper()}</strong>
        <p>{escaped_content}</p>
    </div>
"""

        html_content += """
</body>
</html>
"""

        validated_path.write_text(html_content)
        size = validated_path.stat().st_size

        return {"path": str(validated_path), "size": size}

    def export_markdown(self, session_id: str, output_path: str) -> dict:
        """Export session to Markdown format.

        Args:
            session_id: Session to export
            output_path: Absolute path for output file

        Returns:
            Dict with path and size

        Raises:
            ValueError: If session not found or path invalid
        """
        validated_path = validate_export_path(output_path)

        # Phase 1: Basic implementation
        # Phase 3 will use claude-code-log renderers
        session_detail = self.get_session_detail(session_id)

        md_content = f"""# {session_detail.session.summary}

**Session ID:** {session_detail.session.session_id}
**Messages:** {session_detail.session.message_count}
**Time:** {session_detail.session.first_timestamp} - {session_detail.session.last_timestamp}

---

"""

        for msg in session_detail.messages:
            md_content += f"""## {msg.type.upper()}

{msg.content}

---

"""

        validated_path.write_text(md_content)
        size = validated_path.stat().st_size

        return {"path": str(validated_path), "size": size}

    def search_messages(
        self,
        query: str,
        project: Optional[str] = None,
        case_sensitive: bool = False,
        max_results: int = 100,
    ) -> SearchResults:
        """Search for messages containing the query text.

        Args:
            query: Search query string
            project: Optional project filter
            case_sensitive: Whether search is case sensitive
            max_results: Maximum number of results to return

        Returns:
            SearchResults with matches and excerpts
        """
        matches = []
        excerpt_length = 150  # Characters to show around match

        # Compile regex pattern for searching
        flags = 0 if case_sensitive else re.IGNORECASE
        try:
            pattern = re.compile(re.escape(query), flags)
        except re.error:
            # If query has regex special chars that cause issues, just use literal
            pattern = re.compile(re.escape(query), flags)

        # Optimized search - load transcripts once per project, not per session
        # Get project directories to search
        if project:
            project_path = self.projects_dir / project
            project_paths = [project_path] if project_path.exists() else []
        else:
            project_paths = [
                d
                for d in self.projects_dir.iterdir()
                if d.is_dir() and list(d.glob("*.jsonl"))
            ]

        # Search through projects efficiently
        for project_path in project_paths:
            if len(matches) >= max_results:
                break

            try:
                # Get cache manager once per project
                cache_manager = self._get_cache_manager(project_path)
                ensure_fresh_cache(project_path, cache_manager, silent=True)
                project_cache = cache_manager.get_cached_project_data()

                if not project_cache:
                    continue

                # Load transcript entries once per project (not per session!)
                entries = load_directory_transcripts(project_path, cache_manager, silent=True)

                # Search through sessions in this project
                for session_id, session_cache in project_cache.sessions.items():
                    if len(matches) >= max_results:
                        break

                    # Filter entries for this session
                    session_messages = [
                        entry for entry in entries
                        if hasattr(entry, "sessionId") and entry.sessionId == session_id
                    ]

                    # Search each message
                    for idx, entry in enumerate(session_messages):
                        if len(matches) >= max_results:
                            break

                        # Extract content once
                        content = self._extract_content(entry)
                        if not content:
                            continue

                        # Search in message content
                        match = pattern.search(content)
                        if match:
                            # Extract excerpt with context
                            match_pos = match.start()
                            start = max(0, match_pos - excerpt_length // 2)
                            end = min(len(content), match_pos + excerpt_length // 2)

                            excerpt = content[start:end]

                            # Add ellipsis if truncated
                            if start > 0:
                                excerpt = "..." + excerpt
                            if end < len(content):
                                excerpt = excerpt + "..."

                            # Extract message type and timestamp from entry
                            message_type = self._get_message_type(entry)
                            timestamp_str = getattr(entry, "timestamp", None)
                            timestamp = None
                            if timestamp_str:
                                try:
                                    timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                                except (ValueError, AttributeError):
                                    pass

                            search_match = SearchMatch(
                                session_id=session_id,
                                session_summary=session_cache.summary or session_cache.first_user_message,
                                message_index=idx,
                                message_type=message_type,
                                excerpt=excerpt,
                                match_position=match_pos,
                                timestamp=timestamp,
                            )
                            matches.append(search_match)

            except Exception as e:
                # Skip sessions that can't be loaded
                continue

        return SearchResults(
            query=query,
            total_matches=len(matches),
            matches=matches,
        )

    def get_history_entries(
        self,
        project: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[HistoryEntry]:
        """Get all messages as HistoryEntry format using cached data.

        This is optimized for fast loading by using claude-code-log cache,
        unlike the Rust history streaming which parses raw JSONL files.

        Args:
            project: Filter by project name
            from_date: ISO 8601 date string (inclusive)
            to_date: ISO 8601 date string (inclusive)
            limit: Maximum number of entries to return

        Returns:
            List of HistoryEntry objects sorted by timestamp
        """
        history_entries = []

        # Get project directories to search
        if project:
            project_path = self.projects_dir / project
            project_paths = [project_path] if project_path.exists() else []
        else:
            # Get all project directories
            if not self.projects_dir.exists():
                return []
            project_paths = [
                d
                for d in self.projects_dir.iterdir()
                if d.is_dir() and list(d.glob("*.jsonl"))
            ]

        # Load entries from each project using cache
        for project_path in project_paths:
            try:
                cache_manager = self._get_cache_manager(project_path)

                # Ensure cache is fresh
                ensure_fresh_cache(
                    project_path, cache_manager, from_date, to_date, silent=True
                )

                # Get cached project data
                project_cache = cache_manager.get_cached_project_data()
                if not project_cache or not project_cache.sessions:
                    continue

                # Load all transcript entries for this project (from cache)
                entries = load_directory_transcripts(project_path, cache_manager, silent=True)

                project_name = project_path.name

                # Convert each entry to HistoryEntry format
                print(f"Processing {len(entries)} entries from project: {project_name}", file=sys.stderr)
                for entry in entries:
                    # Extract session ID
                    session_id = getattr(entry, "sessionId", None)

                    # Skip if session not in cache (shouldn't happen, but safety check)
                    if session_id and session_id not in project_cache.sessions:
                        continue

                    # Apply date filtering if specified
                    if from_date or to_date:
                        from datetime import datetime as dt
                        import dateparser

                        timestamp_str = getattr(entry, "timestamp", None)
                        if timestamp_str:
                            try:
                                entry_dt = dt.fromisoformat(timestamp_str.replace("Z", "+00:00"))

                                if from_date:
                                    from_dt = dateparser.parse(from_date)
                                    if from_dt and entry_dt < from_dt.replace(tzinfo=None):
                                        continue

                                if to_date:
                                    to_dt = dateparser.parse(to_date)
                                    if to_dt and entry_dt > to_dt.replace(tzinfo=None):
                                        continue
                            except (ValueError, AttributeError):
                                continue

                    # Extract message content
                    content = self._extract_content(entry)
                    if not content:
                        continue  # Skip empty messages

                    # Get timestamp
                    timestamp_str = getattr(entry, "timestamp", None)
                    timestamp = None
                    if timestamp_str:
                        try:
                            timestamp = datetime.fromisoformat(
                                timestamp_str.replace("Z", "+00:00")
                            )
                        except (ValueError, AttributeError):
                            pass

                    if not timestamp:
                        continue  # Skip entries without valid timestamp

                    # Extract UUID
                    uuid = getattr(entry, "uuid", None)

                    # Extract cwd and derive agent
                    cwd = getattr(entry, "cwd", None)
                    agent = None
                    if cwd:
                        # Try to extract agent from path (look for /agents/<agent_name>)
                        cwd_str = str(cwd)
                        if "/agents/" in cwd_str:
                            try:
                                # Split on /agents/ and get the next path component
                                after_agents = cwd_str.split("/agents/")[1]
                                agent_name = after_agents.split("/")[0]
                                if agent_name:  # Make sure it's not empty
                                    agent = agent_name
                            except (IndexError, AttributeError):
                                pass

                    # If we still don't have an agent, try extracting from project name
                    if not agent and project_name:
                        # Some projects might be named after the agent
                        # e.g., "nolan-dan", "nolan-bill", etc.
                        if "-" in project_name:
                            potential_agent = project_name.split("-")[-1]
                            # Only use if it looks like an agent name (short, lowercase)
                            if len(potential_agent) <= 10 and potential_agent.islower():
                                agent = potential_agent

                    # Debug: Log first few entries to see agent extraction
                    if len(history_entries) < 5:
                        print(f"Entry agent extraction - cwd: {cwd}, agent: {agent}, project: {project_name}", file=sys.stderr)

                    # Get entry type
                    entry_type = self._get_message_type(entry)

                    # Get tool name if applicable
                    tool_name = self._get_tool_name(entry)

                    # Get tokens
                    tokens = self._extract_tokens(entry)

                    # Create preview (truncated message)
                    preview = content[:200] + "..." if len(content) > 200 else content

                    history_entry = HistoryEntry(
                        uuid=uuid,
                        timestamp=timestamp,
                        agent=agent,
                        tmux_session=None,  # Will be populated by Rust if needed
                        message=content,
                        preview=preview,
                        entry_type=entry_type,
                        session_id=session_id,
                        project=project_name,
                        tool_name=tool_name,
                        tokens=tokens,
                    )

                    history_entries.append(history_entry)

            except Exception as e:
                # Skip projects that can't be loaded
                print(f"Warning: Failed to load project {project_path}: {e}", file=sys.stderr)
                continue

        # Sort by timestamp (chronological order)
        history_entries.sort(key=lambda e: e.timestamp)

        # Apply limit if specified
        if limit and limit > 0:
            history_entries = history_entries[-limit:]  # Get most recent N entries

        return history_entries
