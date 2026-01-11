#!/usr/bin/env python3
"""
Generate agent directories from team YAML files and role templates.
Each agent gets its own directory with agent.json and CLAUDE.md.
"""

import os
import sys
import yaml
import json
from pathlib import Path

# Paths
NOLAN_ROOT = Path(__file__).parent.parent
TEAMS_DIR = NOLAN_ROOT / "teams"
ROLES_DIR = NOLAN_ROOT / "roles"
AGENTS_DIR = NOLAN_ROOT / "app" / "agents"
CLAUDE_DIR = NOLAN_ROOT / "app" / ".claude"

# Role to model mapping (opus for leads/architects, sonnet for others)
OPUS_ROLES = {
    'coordinator', 'tech-lead', 'solutions-architect', 'principal-architect',
    'devops-lead', 'platform-architect', 'security-architect',
    'qa-lead', 'qa-manager', 'automation-architect', 'appsec-lead',
    'sales-director', 'marketing-director', 'bd-director',
    'legal-counsel', 'executive-assistant'
}

def load_role_template(role_name: str) -> dict:
    """Load role template from YAML file."""
    # Check specialized roles first
    role_path = ROLES_DIR / "specialized" / f"{role_name}.yaml"
    if not role_path.exists():
        # Check core roles
        role_path = ROLES_DIR / f"{role_name}.yaml"

    if role_path.exists():
        with open(role_path) as f:
            data = yaml.safe_load(f)
            return data.get('role', {})
    return {}

def generate_claude_md(agent_name: str, role_name: str, team_name: str,
                       output_file: str, role_data: dict) -> str:
    """Generate CLAUDE.md content for an agent."""

    display_name = role_data.get('display_name', role_name.replace('-', ' ').title())
    description = role_data.get('description', '')
    capabilities = role_data.get('capabilities', [])
    permissions = role_data.get('permissions', {})
    file_access = permissions.get('file_access', 'restricted')
    output_reqs = role_data.get('output_requirements', {})
    required_sections = output_reqs.get('required_sections', [])

    # Determine if this is a coordinator
    is_coordinator = 'coordinator' in role_name.lower()

    # Build CLAUDE.md content
    content = f"""# {agent_name} - {display_name}

You are {agent_name}, a {display_name.lower()} agent.

## Role

{description}

"""

    if capabilities:
        content += "**Capabilities:**\n"
        for cap in capabilities:
            content += f"- {cap.replace('_', ' ').title()}\n"
        content += "\n"

    if is_coordinator:
        content += """## CRITICAL: Delegation Only

**You are a coordinator, NOT a worker.**

- **NEVER** research, analyze, or investigate problems yourself
- **NEVER** explore code or read files to understand issues
- **NEVER** create plans, solutions, or recommendations
- **NEVER** attempt to do work that should be delegated

Your ONLY job is to assign work to agents and track progress.

## Responsibilities

- Keep your respective $DOCS_PATH tracker file up to date
- Receive Handoffs from agents
- Update `## Current Assignment` for each handoff
- Verify prompt, context and phase files are aligned
- **Delegate new work immediately** - do not analyze it first

## Assignment Protocol

Use the assignment script for handoffs:

```bash
$NOLAN_ROOT/app/scripts/assign.sh <project-name> <agent> <phase> "<task>"
```

## Skills

**Primary:** `nolan:facilitator` - project management and communication

"""
    else:
        content += """## Input

**ALWAYS** read these files first:
- `$DOCS_PATH/prompt.md` - Original requirements
- Predecessor output files as specified in your assignment

"""

    content += f"""## Output

**ALWAYS** write output to `$DOCS_PATH/$OUTPUT_FILE`.

"""

    if required_sections:
        content += "**Required sections:**\n"
        for section in required_sections:
            content += f"- {section}\n"
        content += "\n"

    # Add style section
    content += """## Style

- Be thorough but concise
- Include verification steps when applicable
- Focus on actionable insights and recommendations

"""

    # Add file access info
    if file_access == 'permissive':
        content += """## File Access

You have **permissive** file access - you can read and write files as needed for your work.

"""
    elif file_access == 'restricted':
        content += """## File Access

You have **restricted** file access - you can only write to your designated output file.

"""

    if not is_coordinator:
        content += """## Completion

When your work is done:
1. Write your output to `$DOCS_PATH/$OUTPUT_FILE` with all required sections
2. Add `<!-- STATUS:COMPLETE:YYYY-MM-DD -->` marker at the end of your output
3. Stop - the system automatically creates a handoff for the coordinator
4. Do NOT run `/handoff` - that command is coordinator-only
5. Do NOT try to update NOTES.md or other files unless you have permissive access

## Task Instructions

When you receive a task assignment, your specific instructions are shown at session start.
The instruction file is at: `$PROJECTS_DIR/.state/$TEAM_NAME/instructions/_current/${AGENT_NAME}.yaml`
"""

    return content


def create_agent_directory(agent_name: str, role_name: str, team_name: str,
                          output_file: str, department: str = None):
    """Create agent directory with all required files."""

    agent_dir = AGENTS_DIR / agent_name

    # Skip if already exists
    if agent_dir.exists():
        print(f"  Skip: {agent_name} (already exists)")
        return False

    # Load role template
    role_data = load_role_template(role_name)

    # Determine model
    model = "opus" if role_name in OPUS_ROLES else "sonnet"

    # Create directory
    agent_dir.mkdir(parents=True, exist_ok=True)

    # Create agent.json
    agent_json = {
        "role": role_data.get('display_name', role_name.replace('-', ' ').title()),
        "model": model
    }
    if team_name:
        agent_json["team"] = team_name
    if role_name:
        agent_json["role_template"] = role_name
    if department:
        agent_json["department"] = department

    with open(agent_dir / "agent.json", 'w') as f:
        json.dump(agent_json, f, indent=2)

    # Create CLAUDE.md
    claude_md = generate_claude_md(agent_name, role_name, team_name, output_file, role_data)
    with open(agent_dir / "CLAUDE.md", 'w') as f:
        f.write(claude_md)

    # Create .claude symlink
    claude_symlink = agent_dir / ".claude"
    if not claude_symlink.exists():
        os.symlink(CLAUDE_DIR, claude_symlink)

    print(f"  Created: {agent_name} (role: {role_name}, model: {model})")
    return True


def process_team_file(team_path: Path, department: str = None):
    """Process a single team YAML file."""

    # Skip template files
    if team_path.name.startswith('_'):
        print(f"  Skip template: {team_path.name}")
        return 0

    with open(team_path) as f:
        data = yaml.safe_load(f)

    team_data = data.get('team', {})
    team_name = team_data.get('name', team_path.stem)
    agents = team_data.get('agents', [])

    created = 0
    for agent in agents:
        agent_name = agent.get('name', '')
        if not agent_name:
            continue

        # Determine role from agent name or explicit role field
        role_name = agent.get('role', '')
        if not role_name:
            # Try to infer role from agent name
            # e.g., "adm_fin_controller" -> "controller"
            parts = agent_name.split('_')
            if len(parts) >= 3:
                role_name = parts[-1]  # Last part is usually the role
            else:
                role_name = 'coordinator' if 'coordinator' in agent_name else 'implementer'

        output_file = agent.get('output_file', 'output.md')

        if create_agent_directory(agent_name, role_name, team_name, output_file, department):
            created += 1

    return created


def main():
    """Main entry point."""

    print("Generating agent directories from team configurations...")
    print(f"Teams dir: {TEAMS_DIR}")
    print(f"Agents dir: {AGENTS_DIR}")
    print()

    total_created = 0

    # Process root-level team files (e.g., default.yaml)
    print("Processing root teams...")
    for team_file in TEAMS_DIR.glob("*.yaml"):
        if team_file.name == "departments.yaml":
            continue
        print(f"\nTeam: {team_file.stem}")
        total_created += process_team_file(team_file)

    # Process department subdirectories
    for dept_dir in TEAMS_DIR.iterdir():
        if not dept_dir.is_dir():
            continue

        # Extract department name from directory
        dept_name = dept_dir.name.split('_', 1)[-1] if '_' in dept_dir.name else dept_dir.name
        print(f"\nDepartment: {dept_name}")

        for team_file in dept_dir.glob("*.yaml"):
            print(f"  Team: {team_file.stem}")
            total_created += process_team_file(team_file, dept_name)

    print(f"\n{'='*50}")
    print(f"Total agents created: {total_created}")
    print(f"Agent directories: {AGENTS_DIR}")


if __name__ == "__main__":
    main()
