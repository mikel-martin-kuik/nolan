#!/usr/bin/env python3
"""
Team Config Validator

Validates team configuration YAML files for semantic correctness.
Checks structure, references, dependencies, and semantic rules.

Usage:
    python3 scripts/validate-team-config.py teams/default.yaml
"""

import sys
import re
import yaml
from pathlib import Path
from typing import Dict, List, Set

def validate_team_config(config: Dict) -> List[str]:
    """Validate team configuration and return list of errors"""
    errors = []

    # Validate structure
    if 'team' not in config:
        return ["Missing 'team' root key"]

    team = config['team']

    # Check required team fields
    for field in ['name', 'agents', 'workflow']:
        if field not in team:
            errors.append(f"Missing required field: team.{field}")

    if errors:
        return errors  # Can't continue without basic structure

    agents = {a['name']: a for a in team.get('agents', [])}
    agent_names = set(agents.keys())

    # Validate agent names unique and valid format
    seen_names = set()
    for agent in team['agents']:
        name = agent.get('name', '')

        if not name:
            errors.append("Agent with missing name field")
            continue

        if name in seen_names:
            errors.append(f"Duplicate agent name: {name}")
        seen_names.add(name)

        if not re.match(r'^[a-z][a-z0-9-]*$', name):
            errors.append(f"Invalid agent name '{name}': must match ^[a-z][a-z0-9-]*$")

        # Validate required agent fields
        for field in ['file_permissions', 'workflow_participant']:
            if field not in agent:
                errors.append(f"Agent '{name}': missing required field '{field}'")

        # Validate file_permissions
        if agent.get('file_permissions') not in ['restricted', 'permissive', 'no_projects']:
            errors.append(f"Agent '{name}': file_permissions must be restricted|permissive|no_projects")

    # Validate workflow references
    workflow = team.get('workflow', {})

    if 'coordinator' not in workflow:
        errors.append("Missing workflow.coordinator")
    elif workflow['coordinator'] not in agent_names:
        errors.append(f"Invalid coordinator '{workflow['coordinator']}': agent not found")

    # Validate phases
    if 'phases' not in workflow:
        errors.append("Missing workflow.phases")
    else:
        # Validate phase dependencies (topological sort)
        output_files = set()
        output_files.add('context.md')  # context.md is always available

        for phase in workflow['phases']:
            phase_name = phase.get('name', '<unnamed>')

            # Check required phase fields
            for field in ['name', 'owner', 'output']:
                if field not in phase:
                    errors.append(f"Phase '{phase_name}': missing required field '{field}'")

            # Validate owner exists
            if phase.get('owner') and phase['owner'] not in agent_names:
                errors.append(f"Phase '{phase_name}': owner '{phase['owner']}' not found in agents")

            # Check dependencies are satisfied
            for req in phase.get('requires', []):
                if req not in output_files:
                    errors.append(f"Phase '{phase_name}' requires '{req}' before it's produced")

            # Add this phase's output for future phases
            if phase.get('output'):
                output_files.add(phase['output'])

    # Extended semantic validation

    # Check for duplicate output files
    output_file_list = [a['output_file'] for a in agents.values() if a.get('output_file')]
    duplicates = {f for f in output_file_list if output_file_list.count(f) > 1}
    if duplicates:
        errors.append(f"Duplicate output files: {duplicates}")

    # Check restricted permissions have output_file
    for agent in agents.values():
        if agent.get('file_permissions') == 'restricted' and not agent.get('output_file'):
            errors.append(f"Agent '{agent['name']}': restricted permissions but no output_file")

    # Check no_projects agents have null output_file
    for agent in agents.values():
        if agent.get('file_permissions') == 'no_projects' and agent.get('output_file') is not None:
            errors.append(f"Agent '{agent['name']}': no_projects permissions must have output_file: null")

    # Check coordinator has workflow_participant: false
    coordinator_name = workflow.get('coordinator')
    if coordinator_name and coordinator_name in agents:
        coord_agent = agents[coordinator_name]
        if coord_agent.get('workflow_participant') is True:
            errors.append(f"Coordinator '{coordinator_name}' should have workflow_participant: false")

    # Check multi-instance fields consistency
    for agent in agents.values():
        if agent.get('multi_instance'):
            if 'max_instances' not in agent:
                errors.append(f"Agent '{agent['name']}': multi_instance requires max_instances")
            if 'instance_names' not in agent:
                errors.append(f"Agent '{agent['name']}': multi_instance requires instance_names")
            elif len(agent['instance_names']) < agent.get('max_instances', 0):
                errors.append(f"Agent '{agent['name']}': instance_names has {len(agent['instance_names'])} names but max_instances is {agent['max_instances']}")

    return errors


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/validate-team-config.py teams/default.yaml", file=sys.stderr)
        sys.exit(1)

    config_path = Path(sys.argv[1])

    if not config_path.exists():
        print(f"Error: Config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    # Check file size (1MB max)
    if config_path.stat().st_size > 1_048_576:
        print(f"Error: Config file too large: {config_path.stat().st_size} bytes (max 1MB)", file=sys.stderr)
        sys.exit(1)

    # Load and validate
    try:
        with open(config_path) as f:
            config = yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f"Error: Invalid YAML: {e}", file=sys.stderr)
        sys.exit(1)

    # Check depth
    def get_depth(obj, current=0):
        if not isinstance(obj, (dict, list)):
            return current
        if isinstance(obj, dict):
            return max((get_depth(v, current + 1) for v in obj.values()), default=current)
        return max((get_depth(item, current + 1) for item in obj), default=current)

    depth = get_depth(config)
    if depth > 10:
        print(f"Error: Config too deeply nested: {depth} levels (max 10)", file=sys.stderr)
        sys.exit(1)

    # Validate
    errors = validate_team_config(config)

    if errors:
        print(f"Validation failed for {config_path}:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"✓ {config_path} is valid")
        sys.exit(0)


if __name__ == '__main__':
    main()
