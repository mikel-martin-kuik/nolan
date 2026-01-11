use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use regex::Regex;
use once_cell::sync::Lazy;
use crate::config::{TeamConfig, load_project_team};
use crate::utils::paths::{get_projects_dir, get_handoffs_dir, get_roadmaps_dir};

// Cached regex pattern for HANDOFF markers (compiled once at startup)
// Supports both formats:
//   Old: <!-- HANDOFF:YYYY-MM-DD HH:MM:agent:COMPLETE -->
//   New: <!-- HANDOFF:YYYY-MM-DD HH:MM:agent:COMPLETE:handoff_id -->
static RE_HANDOFF: Lazy<Option<Regex>> = Lazy::new(|| {
    Regex::new(r"<!-- HANDOFF:(\d{4}-\d{2}-\d{2} \d{2}:\d{2}):(\w+):COMPLETE(?::[a-f0-9]+)? -->").ok()
});

// Cached regex pattern for PROJECT:STATUS markers
// Matches both old format (no date) and new format (with date)
static RE_PROJECT_STATUS: Lazy<Option<Regex>> = Lazy::new(|| {
    Regex::new(r"<!-- PROJECT:STATUS:[A-Z]+(?::\d{4}-\d{2}-\d{2})? -->").ok()
});

/// Project status derived from NOTES.md
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Complete,
    InProgress,
    Pending,
    Delegated,
    Archived,
}

/// Valid status values for update_project_status
const VALID_STATUSES: &[&str] = &["COMPLETE", "INPROGRESS", "PENDING", "DELEGATED", "ARCHIVED"];

/// Get expected workflow files from team config
/// Returns: (all_expected_files, workflow_files_with_handoff_tracking)
/// Requires team config - no fallback
/// Note: Only includes files defined in team workflow phases, not hardcoded files
fn get_expected_files_from_config(config: &TeamConfig) -> (Vec<String>, Vec<String>) {
    let mut expected = Vec::new();
    let mut workflow = Vec::new();

    // Always include prompt.md (user input)
    expected.push("prompt.md".to_string());

    // Add phase outputs from workflow (team defines its own files)
    for phase in &config.team.workflow.phases {
        let output = if phase.output.ends_with(".md") {
            phase.output.clone()
        } else {
            format!("{}.md", phase.output)
        };
        if !expected.contains(&output) {
            expected.push(output.clone());
            workflow.push(output);
        }
    }

    // Add note-taker's output file (NOTES.md)
    let notes_file = "NOTES.md".to_string();
    if !expected.contains(&notes_file) {
        expected.push(notes_file);
    }

    (expected, workflow)
}

/// Completion status for a workflow file
#[derive(Debug, Clone, Serialize)]
pub struct FileCompletion {
    pub file: String,
    pub exists: bool,
    pub completed: bool,
    pub completed_by: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub file_count: usize,
    pub last_modified: String,
    pub status: ProjectStatus,
    pub status_detail: Option<String>,
    pub existing_files: Vec<String>,
    pub missing_files: Vec<String>,
    pub file_completions: Vec<FileCompletion>,
    pub team: String,  // Team that owns this project (from .team file)
    pub workflow_files: Vec<String>,  // Workflow phase outputs stored at project creation
}

/// Project team file structure (stored in .team as YAML)
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct ProjectTeamFile {
    pub team: String,
    #[serde(default)]
    pub workflow_files: Vec<String>,
}

impl ProjectTeamFile {
    /// Read from .team file, handling both old (plain text) and new (YAML) formats
    pub fn read(project_path: &std::path::Path) -> Result<Self, String> {
        let team_file = project_path.join(".team");
        let content = fs::read_to_string(&team_file)
            .map_err(|e| format!("Failed to read .team file: {}", e))?;

        // Try parsing as YAML first
        if let Ok(parsed) = serde_yaml::from_str::<ProjectTeamFile>(&content) {
            return Ok(parsed);
        }

        // Fall back to old format (plain team name)
        let team = content.trim().to_string();
        Ok(ProjectTeamFile {
            team,
            workflow_files: Vec::new(), // Will be populated from team config
        })
    }

    /// Write to .team file as YAML
    pub fn write(&self, project_path: &std::path::Path) -> Result<(), String> {
        let team_file = project_path.join(".team");
        let content = serde_yaml::to_string(self)
            .map_err(|e| format!("Failed to serialize .team file: {}", e))?;
        fs::write(&team_file, content)
            .map_err(|e| format!("Failed to write .team file: {}", e))?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectFile {
    pub name: String,
    pub relative_path: String,
    pub file_type: String,
    pub size: u64,
    pub last_modified: String,
    pub is_placeholder: bool,
    pub last_modified_ago: Option<String>,
    pub is_recent: bool,
}

/// Parse project status from NOTES.md content
/// MARKER-ONLY: Single source of truth via structured markers
/// No heuristics, no legacy pattern matching
///
/// Markers:
/// - `<!-- PROJECT:STATUS:COMPLETE:date -->` → Complete
/// - `<!-- PROJECT:STATUS:CLOSED:date -->` → Complete (alias)
/// - `<!-- PROJECT:STATUS:ARCHIVED:date -->` → Archived
/// - `<!-- PROJECT:STATUS:INPROGRESS:date -->` → InProgress
/// - `<!-- PROJECT:STATUS:DELEGATED:date -->` → Delegated
/// - `<!-- PROJECT:STATUS:PENDING:date -->` → Pending
/// - No marker → Pending
fn parse_project_status(notes_content: &str) -> (ProjectStatus, Option<String>) {
    for line in notes_content.lines() {
        let trimmed = line.trim();

        // Complete markers
        if trimmed.contains("<!-- PROJECT:STATUS:COMPLETE") {
            return (ProjectStatus::Complete, Some(trimmed.to_string()));
        }
        if trimmed.contains("<!-- PROJECT:STATUS:CLOSED") {
            return (ProjectStatus::Complete, Some(trimmed.to_string()));
        }

        // Archived marker (distinct from Complete)
        if trimmed.contains("<!-- PROJECT:STATUS:ARCHIVED") {
            return (ProjectStatus::Archived, Some(trimmed.to_string()));
        }

        // In Progress marker
        if trimmed.contains("<!-- PROJECT:STATUS:INPROGRESS") {
            return (ProjectStatus::InProgress, Some(trimmed.to_string()));
        }

        // Delegated marker
        if trimmed.contains("<!-- PROJECT:STATUS:DELEGATED") {
            return (ProjectStatus::Delegated, Some(trimmed.to_string()));
        }

        // Pending marker (explicit)
        if trimmed.contains("<!-- PROJECT:STATUS:PENDING") {
            return (ProjectStatus::Pending, Some(trimmed.to_string()));
        }
    }

    // No marker = pending (explicit marking required)
    (ProjectStatus::Pending, None)
}

/// Check .state/handoffs/processed/ directory for completed handoffs
/// Returns map of agent_name -> (timestamp, handoff_id) for a specific project
/// This is the primary source of truth for completion status
fn get_processed_handoffs(project_name: &str) -> std::collections::HashMap<String, (String, String)> {
    let mut handoffs = std::collections::HashMap::new();
    let processed_dir = match get_handoffs_dir() {
        Ok(dir) => dir.join("processed"),
        Err(_) => return handoffs,
    };

    if !processed_dir.exists() {
        return handoffs;
    }

    // Read all .handoff files in processed directory
    if let Ok(entries) = fs::read_dir(&processed_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "handoff") {
                if let Ok(content) = fs::read_to_string(&path) {
                    // Parse YAML content to check project name
                    // Format: project: <name>, from_agent: <agent>, timestamp: <time>, id: <id>
                    let mut agent: Option<String> = None;
                    let mut project: Option<String> = None;
                    let mut timestamp: Option<String> = None;
                    let mut handoff_id: Option<String> = None;

                    for line in content.lines() {
                        let line = line.trim();
                        if line.starts_with("from_agent:") {
                            agent = line.strip_prefix("from_agent:").map(|s| s.trim().to_string());
                        } else if line.starts_with("project:") {
                            project = line.strip_prefix("project:").map(|s| s.trim().to_string());
                        } else if line.starts_with("timestamp:") {
                            // Format: '2026-01-10T12:50:33' -> '2026-01-10 12:50'
                            if let Some(ts) = line.strip_prefix("timestamp:") {
                                let ts = ts.trim().trim_matches('\'').trim_matches('"');
                                // Convert ISO format to display format
                                timestamp = Some(ts.replace('T', " ").chars().take(16).collect());
                            }
                        } else if line.starts_with("id:") {
                            handoff_id = line.strip_prefix("id:").map(|s| s.trim().to_string());
                        }
                    }

                    // Only include if this handoff is for the requested project
                    if let (Some(ag), Some(proj), Some(ts)) = (agent, project, timestamp) {
                        if proj == project_name {
                            let id = handoff_id.unwrap_or_default();
                            handoffs.insert(ag, (ts, id));
                        }
                    }
                }
            }
        }
    }

    handoffs
}

/// Get the agent that produces a specific file (from team config)
fn get_file_producer(config: &TeamConfig, file: &str) -> Option<String> {
    // Check workflow phases
    for phase in &config.team.workflow.phases {
        let output = if phase.output.ends_with(".md") {
            phase.output.clone()
        } else {
            format!("{}.md", phase.output)
        };
        if output == file || phase.output == file {
            return Some(phase.owner.clone());
        }
    }

    // Check agent output files
    for agent in &config.team.agents {
        if let Some(ref output_file) = agent.output_file {
            let output = if output_file.ends_with(".md") {
                output_file.clone()
            } else {
                format!("{}.md", output_file)
            };
            if output == file || output_file == file {
                return Some(agent.name.clone());
            }
        }
    }

    None
}

/// Parse HANDOFF marker from file content (legacy fallback)
/// Formats supported:
///   <!-- HANDOFF:YYYY-MM-DD HH:MM:agent:COMPLETE -->
///   <!-- HANDOFF:YYYY-MM-DD HH:MM:agent:COMPLETE:handoff_id -->
fn parse_handoff_marker(content: &str) -> Option<(String, String)> {
    // Use cached regex pattern (compiled once at startup)
    let re = RE_HANDOFF.as_ref()?;

    // Find all matches and take the last one (most recent)
    let mut last_match: Option<(String, String)> = None;
    for cap in re.captures_iter(content) {
        if let (Some(timestamp), Some(agent)) = (cap.get(1), cap.get(2)) {
            last_match = Some((timestamp.as_str().to_string(), agent.as_str().to_string()));
        }
    }

    last_match
}

/// Get completion status for workflow files (and prompt.md)
/// Primary source of truth: .state/handoffs/processed/ directory
/// Fallback: HANDOFF markers in files (for legacy compatibility)
fn get_file_completions(
    project_path: &PathBuf,
    workflow_files: &[String],
    project_name: &str,
    config: Option<&TeamConfig>,
) -> Vec<FileCompletion> {
    let mut completions = Vec::new();

    // Get processed handoffs from .state/handoffs/ directory (primary source of truth)
    let processed_handoffs = get_processed_handoffs(project_name);

    // Check workflow files
    for file in workflow_files {
        let file_path = project_path.join(file);
        let exists = file_path.exists();

        // First: Check .state/handoffs/processed/ directory (primary source of truth)
        let handoff_completion = if let Some(cfg) = config {
            if let Some(agent) = get_file_producer(cfg, file) {
                if let Some((timestamp, _id)) = processed_handoffs.get(&agent) {
                    Some((timestamp.clone(), agent))
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        let (completed, completed_by, completed_at) = if let Some((ts, ag)) = handoff_completion {
            // Completion found in .state/handoffs/processed/
            (true, Some(ag), Some(ts))
        } else if exists {
            // Fallback: Check for HANDOFF marker in file (legacy compatibility)
            match fs::read_to_string(&file_path) {
                Ok(content) => {
                    if let Some((timestamp, agent)) = parse_handoff_marker(&content) {
                        (true, Some(agent), Some(timestamp))
                    } else {
                        (false, None, None)
                    }
                }
                Err(_) => (false, None, None),
            }
        } else {
            (false, None, None)
        };

        completions.push(FileCompletion {
            file: file.to_string(),
            exists,
            completed,
            completed_by,
            completed_at,
        });
    }

    // Check prompt.md separately (special file - always uses file marker)
    let prompt_path = project_path.join("prompt.md");
    let prompt_exists = prompt_path.exists();

    let (prompt_completed, prompt_completed_by, prompt_completed_at) = if prompt_exists {
        // prompt.md always uses file marker (it's user-generated, not agent handoff)
        match fs::read_to_string(&prompt_path) {
            Ok(content) => {
                if let Some((timestamp, agent)) = parse_handoff_marker(&content) {
                    (true, Some(agent), Some(timestamp))
                } else {
                    (false, None, None)
                }
            }
            Err(_) => (false, None, None),
        }
    } else {
        (false, None, None)
    };

    completions.push(FileCompletion {
        file: "prompt.md".to_string(),
        exists: prompt_exists,
        completed: prompt_completed,
        completed_by: prompt_completed_by,
        completed_at: prompt_completed_at,
    });

    completions
}

/// Determine which expected files exist and which are missing
/// expected_files: List of expected files from team config
fn get_file_scaffolding(project_path: &PathBuf, expected_files: &[String]) -> (Vec<String>, Vec<String>) {
    let mut existing = Vec::new();
    let mut missing = Vec::new();

    for file in expected_files {
        let file_path = project_path.join(file);
        if file_path.exists() {
            existing.push(file.to_string());
        } else {
            missing.push(file.to_string());
        }
    }

    (existing, missing)
}

/// List all projects in the projects directory
#[tauri::command]
pub async fn list_projects() -> Result<Vec<ProjectInfo>, String> {
    let projects_dir = get_projects_dir()?;

    if !projects_dir.exists() {
        return Ok(Vec::new());
    }

    let mut projects = Vec::new();

    let entries = fs::read_dir(&projects_dir)
        .map_err(|e| format!("Failed to read projects directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Only process directories
        if !path.is_dir() {
            continue;
        }

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Skip hidden directories (.legacy, .state) and templates (_*)
        if name.starts_with('.') || name.starts_with('_') {
            continue;
        }

        // Count .md files recursively
        let file_count = count_md_files(&path);

        // Get last modified time
        let metadata = fs::metadata(&path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        let last_modified = metadata
            .modified()
            .ok()
            .and_then(|time| {
                time.duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|d| {
                        let secs = d.as_secs();
                        chrono::DateTime::from_timestamp(secs as i64, 0)
                            .map(|dt| dt.to_rfc3339())
                            .unwrap_or_default()
                    })
            })
            .unwrap_or_default();

        // Read .team file (required) - supports both old plain text and new YAML format
        let project_team_file = match ProjectTeamFile::read(&path) {
            Ok(ptf) => ptf,
            Err(_) => {
                // Skip projects without valid .team file
                continue;
            }
        };
        let team = project_team_file.team.clone();

        // Load team config (required for fallback workflow files)
        let team_config = match load_project_team(&path) {
            Ok(config) => config,
            Err(_) => {
                // Skip projects with invalid team config
                continue;
            }
        };

        // Parse status from NOTES.md
        let notes_path = path.join("NOTES.md");
        let (status, status_detail) = if notes_path.exists() {
            match fs::read_to_string(&notes_path) {
                Ok(content) => parse_project_status(&content),
                Err(_) => (ProjectStatus::Pending, None),
            }
        } else {
            (ProjectStatus::Pending, None)
        };

        // Get expected files from team config
        let (expected_files, config_workflow_files) = get_expected_files_from_config(&team_config);

        // Use workflow files from .team if stored, otherwise fall back to team config
        // This preserves the workflow at project creation time even if team changes
        let workflow_files = if project_team_file.workflow_files.is_empty() {
            config_workflow_files
        } else {
            project_team_file.workflow_files.clone()
        };

        // Get file scaffolding info using team-specific expected files
        let (existing_files, missing_files) = get_file_scaffolding(&path, &expected_files);

        // Get workflow file completion status using stored or team-config workflow files
        // Primary source: .state/handoffs/processed/ directory
        // Fallback: HANDOFF markers in files (legacy compatibility)
        let file_completions = get_file_completions(
            &path,
            &workflow_files,
            &name,
            Some(&team_config),
        );

        projects.push(ProjectInfo {
            name,
            path: path.to_string_lossy().to_string(),
            file_count,
            last_modified,
            status,
            status_detail,
            existing_files,
            missing_files,
            file_completions,
            team,
            workflow_files,
        });
    }

    // Sort by name
    projects.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(projects)
}

/// Count markdown files recursively in a directory
fn count_md_files(dir: &PathBuf) -> usize {
    let mut count = 0;

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                count += 1;
            } else if path.is_dir() {
                count += count_md_files(&path);
            }
        }
    }

    count
}

/// Calculate human-readable time ago string
fn time_ago(modified_time: std::time::SystemTime) -> (String, bool) {
    let now = std::time::SystemTime::now();
    let duration = now.duration_since(modified_time).unwrap_or_default();
    let secs = duration.as_secs();

    let is_recent = secs < 300; // 5 minutes

    let ago = if secs < 60 {
        "just now".to_string()
    } else if secs < 3600 {
        format!("{}m ago", secs / 60)
    } else if secs < 86400 {
        format!("{}h ago", secs / 3600)
    } else if secs < 604800 {
        format!("{}d ago", secs / 86400)
    } else {
        format!("{}w ago", secs / 604800)
    };

    (ago, is_recent)
}

/// List all markdown files in a specific project (with placeholders for missing expected files)
#[tauri::command]
pub async fn list_project_files(project_name: String) -> Result<Vec<ProjectFile>, String> {
    // Validate project_name - no path traversal allowed
    if project_name.contains("..") || project_name.contains('/') || project_name.contains('\\') {
        return Err("Invalid project name: path traversal not allowed".to_string());
    }

    let projects_dir = get_projects_dir()?;
    let project_path = projects_dir.join(&project_name);

    // Canonicalize to resolve any symlinks and verify path
    let canonical_path = project_path
        .canonicalize()
        .map_err(|e| format!("Project not found: {}", e))?;

    // CRITICAL: Ensure canonical path is within projects directory
    if !canonical_path.starts_with(&projects_dir) {
        return Err("Security violation: path traversal detected".to_string());
    }

    if !canonical_path.is_dir() {
        return Err("Project is not a directory".to_string());
    }

    // Load team config for this project (required)
    let team_config = load_project_team(&canonical_path)
        .map_err(|e| format!("Failed to load team config: {}", e))?;
    let (expected_files, _) = get_expected_files_from_config(&team_config);
    let notes_file = "NOTES.md".to_string();

    let mut files = Vec::new();
    let mut existing_names: std::collections::HashSet<String> = std::collections::HashSet::new();

    collect_md_files(&canonical_path, &canonical_path, &mut files, &mut existing_names)?;

    // Add placeholder files for missing expected files (from team config)
    for expected in &expected_files {
        if !existing_names.contains(expected) {
            let file_type = expected.strip_suffix(".md").unwrap_or(expected).to_string();
            files.push(ProjectFile {
                name: expected.to_string(),
                relative_path: expected.to_string(),
                file_type,
                size: 0,
                last_modified: String::new(),
                is_placeholder: true,
                last_modified_ago: None,
                is_recent: false,
            });
        }
    }

    // Sort: NOTES.md first, placeholders last, then alphabetically
    files.sort_by(|a, b| {
        // Placeholders go last
        if a.is_placeholder && !b.is_placeholder {
            return std::cmp::Ordering::Greater;
        }
        if !a.is_placeholder && b.is_placeholder {
            return std::cmp::Ordering::Less;
        }

        if a.name == notes_file {
            std::cmp::Ordering::Less
        } else if b.name == notes_file {
            std::cmp::Ordering::Greater
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(files)
}

/// Recursively collect markdown files
fn collect_md_files(
    base_path: &PathBuf,
    current_path: &PathBuf,
    files: &mut Vec<ProjectFile>,
    existing_names: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    let entries = fs::read_dir(current_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_file() {
            // Check if it's a markdown file
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                // Track existing file names (for root-level expected files only)
                if current_path == base_path {
                    existing_names.insert(name.clone());
                }

                // Get relative path from project root
                let relative_path = path
                    .strip_prefix(base_path)
                    .map_err(|e| format!("Failed to get relative path: {}", e))?
                    .to_string_lossy()
                    .to_string();

                // Extract file type from name (e.g., "plan.md" -> "plan")
                let file_type = name
                    .strip_suffix(".md")
                    .unwrap_or(&name)
                    .to_string();

                // Get file metadata
                let metadata = fs::metadata(&path)
                    .map_err(|e| format!("Failed to read file metadata: {}", e))?;

                let size = metadata.len();
                let modified_time = metadata.modified().ok();

                let last_modified = modified_time
                    .and_then(|time| {
                        time.duration_since(std::time::UNIX_EPOCH)
                            .ok()
                            .map(|d| {
                                let secs = d.as_secs();
                                chrono::DateTime::from_timestamp(secs as i64, 0)
                                    .map(|dt| dt.to_rfc3339())
                                    .unwrap_or_default()
                            })
                    })
                    .unwrap_or_default();

                // Calculate time ago and recency
                let (last_modified_ago, is_recent) = modified_time
                    .map(|t| time_ago(t))
                    .unwrap_or(("unknown".to_string(), false));

                files.push(ProjectFile {
                    name,
                    relative_path,
                    file_type,
                    size,
                    last_modified,
                    is_placeholder: false,
                    last_modified_ago: Some(last_modified_ago),
                    is_recent,
                });
            }
        } else if path.is_dir() {
            // Recursively process subdirectories
            collect_md_files(base_path, &path, files, existing_names)?;
        }
    }

    Ok(())
}

/// Read the content of a specific project file
#[tauri::command]
pub async fn read_project_file(
    project_name: String,
    file_path: String,
) -> Result<String, String> {
    // CRITICAL SECURITY: Validate inputs

    // Validate project_name - no path traversal
    if project_name.contains("..") || project_name.contains('/') || project_name.contains('\\') {
        return Err("Invalid project name: path traversal not allowed".to_string());
    }

    // Validate file_path - must end in .md and no absolute paths
    if !file_path.ends_with(".md") {
        return Err("Invalid file: only markdown files allowed".to_string());
    }
    if file_path.starts_with('/') || file_path.starts_with('\\') {
        return Err("Invalid file path: absolute paths not allowed".to_string());
    }
    if file_path.contains("..") {
        return Err("Invalid file path: path traversal not allowed".to_string());
    }

    // Build full path
    let projects_dir = get_projects_dir()?;
    let full_path = projects_dir.join(&project_name).join(&file_path);

    // Check if file exists first (avoid hanging on canonicalize for non-existent files)
    if !full_path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    // Canonicalize to resolve symlinks and verify
    let canonical_path = full_path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve file path: {}", e))?;

    // CRITICAL: Ensure canonical path is within projects directory
    let canonical_projects_dir = projects_dir
        .canonicalize()
        .map_err(|e| format!("Projects directory error: {}", e))?;

    if !canonical_path.starts_with(&canonical_projects_dir) {
        return Err("Security violation: path traversal detected".to_string());
    }

    // Ensure it's a file, not a directory
    if !canonical_path.is_file() {
        return Err("Path is not a file".to_string());
    }

    // Read file content
    let content = fs::read_to_string(&canonical_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    Ok(content)
}

/// Read a roadmap file from the docs/roadmaps directory
/// Supports: roadmap.md, business_roadmap.md, product_roadmap.md
#[tauri::command]
pub async fn read_roadmap(filename: Option<String>) -> Result<String, String> {
    let roadmaps_dir = get_roadmaps_dir()?;

    // Validate and sanitize filename - only allow specific roadmap files
    let valid_files = ["roadmap.md", "business_roadmap.md", "product_roadmap.md"];
    let file = filename.unwrap_or_else(|| "roadmap.md".to_string());

    if !valid_files.contains(&file.as_str()) {
        return Err(format!("Invalid roadmap file. Valid options: {:?}", valid_files));
    }

    let roadmap_path = roadmaps_dir.join(&file);

    // Check if roadmap exists
    if !roadmap_path.exists() {
        return Err(format!("Roadmap file '{}' not found in docs/roadmaps directory.", file));
    }

    // Read roadmap content
    let content = fs::read_to_string(&roadmap_path)
        .map_err(|e| format!("Failed to read roadmap: {}", e))?;

    Ok(content)
}

/// List available roadmap files in the docs/roadmaps directory
#[tauri::command]
pub async fn list_roadmap_files() -> Result<Vec<String>, String> {
    let roadmaps_dir = get_roadmaps_dir()?;
    let valid_files = ["roadmap.md", "business_roadmap.md", "product_roadmap.md"];

    let mut available = Vec::new();
    for file in valid_files {
        if roadmaps_dir.join(file).exists() {
            available.push(file.to_string());
        }
    }

    Ok(available)
}

/// Write content to a project file
#[tauri::command]
pub async fn write_project_file(
    project_name: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    // CRITICAL SECURITY: Validate inputs

    // Validate project_name - no path traversal
    if project_name.contains("..") || project_name.contains('/') || project_name.contains('\\') {
        return Err("Invalid project name: path traversal not allowed".to_string());
    }

    // Validate file_path - must end in .md and no absolute paths
    if !file_path.ends_with(".md") {
        return Err("Invalid file: only markdown files allowed".to_string());
    }
    if file_path.starts_with('/') || file_path.starts_with('\\') {
        return Err("Invalid file path: absolute paths not allowed".to_string());
    }
    if file_path.contains("..") {
        return Err("Invalid file path: path traversal not allowed".to_string());
    }

    // Build full path
    let projects_dir = get_projects_dir()?;
    let project_path = projects_dir.join(&project_name);
    let full_path = project_path.join(&file_path);

    // Verify project directory exists
    if !project_path.exists() {
        return Err(format!("Project '{}' not found", project_name));
    }

    // Canonicalize project directory to verify it's within projects
    let canonical_projects_dir = projects_dir
        .canonicalize()
        .map_err(|e| format!("Projects directory error: {}", e))?;

    let canonical_project_dir = project_path
        .canonicalize()
        .map_err(|e| format!("Project directory error: {}", e))?;

    if !canonical_project_dir.starts_with(&canonical_projects_dir) {
        return Err("Security violation: path traversal detected".to_string());
    }

    // Ensure parent directories exist for nested files
    if let Some(parent) = full_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    // Write file content
    fs::write(&full_path, &content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

/// Create a new project directory with initial NOTES.md file and .team file
#[tauri::command]
pub async fn create_project(project_name: String, team_name: Option<String>) -> Result<String, String> {
    // Validate project name: only lowercase letters, numbers, and hyphens
    if project_name.is_empty() {
        return Err("Project name cannot be empty".to_string());
    }

    // Check for invalid characters
    if !project_name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Project name can only contain lowercase letters, numbers, and hyphens".to_string());
    }

    // No leading/trailing hyphens
    if project_name.starts_with('-') || project_name.ends_with('-') {
        return Err("Project name cannot start or end with a hyphen".to_string());
    }

    // No double hyphens
    if project_name.contains("--") {
        return Err("Project name cannot contain consecutive hyphens".to_string());
    }

    // Load team config first to get note-taker's output file and workflow phases
    let team = team_name.unwrap_or_else(|| "default".to_string());
    let team_config = TeamConfig::load(&team)
        .map_err(|e| format!("Failed to load team config '{}': {}", team, e))?;

    // Get note-taker name
    let note_taker_name = team_config.note_taker()
        .unwrap_or("dan");

    // Get note-taker's output file (defaults to NOTES.md)
    let note_taker_file = team_config.team.agents.iter()
        .find(|a| a.name == note_taker_name)
        .and_then(|a| a.output_file.as_ref())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "NOTES.md".to_string());

    // Get workflow files from team config to store in .team
    let (_, workflow_files) = get_expected_files_from_config(&team_config);

    let projects_dir = get_projects_dir()?;
    let project_path = projects_dir.join(&project_name);

    // Check if project already exists
    if project_path.exists() {
        return Err(format!("Project '{}' already exists", project_name));
    }

    // Create project directory
    fs::create_dir_all(&project_path)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    // Create .team file with team assignment and workflow files (YAML format)
    let project_team_file = ProjectTeamFile {
        team: team.clone(),
        workflow_files,
    };
    project_team_file.write(&project_path)?;

    // Create initial NOTES.md file with IN_PROGRESS marker
    let now = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let notes_content = format!(
        r#"# {}

<!-- PROJECT:STATUS:INPROGRESS:{} -->

## Current Status

**Phase**: Initializing
**Assigned**: {}

## Notes

Project created via Nolan Dashboard.
"#,
        project_name, now, note_taker_name
    );

    let notes_path = project_path.join(&note_taker_file);
    fs::write(&notes_path, notes_content)
        .map_err(|e| format!("Failed to create {}: {}", note_taker_file, e))?;

    Ok(project_path.to_string_lossy().to_string())
}

/// Update project status marker in NOTES.md
/// Replaces existing PROJECT:STATUS marker or appends at end of file
#[tauri::command]
pub async fn update_project_status(project_name: String, status: String) -> Result<(), String> {
    // Validate project_name - no path traversal
    if project_name.contains("..") || project_name.contains('/') || project_name.contains('\\') {
        return Err("Invalid project name: path traversal not allowed".to_string());
    }

    // Validate status
    let status_upper = status.to_uppercase();
    if !VALID_STATUSES.contains(&status_upper.as_str()) {
        return Err(format!(
            "Invalid status '{}'. Valid values: {}",
            status,
            VALID_STATUSES.join(", ")
        ));
    }

    let projects_dir = get_projects_dir()?;
    let project_path = projects_dir.join(&project_name);

    if !project_path.exists() {
        return Err(format!("Project '{}' not found", project_name));
    }

    let notes_path = project_path.join("NOTES.md");

    // Read existing content or create new
    let content = if notes_path.exists() {
        fs::read_to_string(&notes_path)
            .map_err(|e| format!("Failed to read NOTES.md: {}", e))?
    } else {
        String::new()
    };

    // Build new marker
    let now = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let new_marker = format!("<!-- PROJECT:STATUS:{}:{} -->", status_upper, now);

    // Remove all existing markers, then append the new one
    let new_content = if let Some(re) = RE_PROJECT_STATUS.as_ref() {
        // Remove all existing status markers
        let without_markers = re.replace_all(&content, "").to_string();
        // Clean up extra blank lines and append new marker
        let cleaned = without_markers
            .lines()
            .collect::<Vec<_>>()
            .join("\n");
        format!("{}\n\n{}\n", cleaned.trim_end(), new_marker)
    } else {
        // Regex failed to compile, just append
        format!("{}\n\n{}\n", content.trim_end(), new_marker)
    };

    fs::write(&notes_path, new_content)
        .map_err(|e| format!("Failed to write NOTES.md: {}", e))?;

    Ok(())
}

/// Update HANDOFF marker in a workflow file
/// Adds or removes the HANDOFF marker based on `completed` flag
#[tauri::command]
pub async fn update_file_marker(
    project_name: String,
    file_path: String,
    completed: bool,
    agent_name: Option<String>,
) -> Result<(), String> {
    // Validate inputs
    if project_name.contains("..") || project_name.contains('/') || project_name.contains('\\') {
        return Err("Invalid project name: path traversal not allowed".to_string());
    }
    if !file_path.ends_with(".md") {
        return Err("Invalid file: only markdown files allowed".to_string());
    }
    if file_path.contains("..") {
        return Err("Invalid file path: path traversal not allowed".to_string());
    }

    let projects_dir = get_projects_dir()?;
    let project_path = projects_dir.join(&project_name);
    let full_path = project_path.join(&file_path);

    if !project_path.exists() {
        return Err(format!("Project '{}' not found", project_name));
    }

    // Read file content (file must exist to toggle marker)
    if !full_path.exists() {
        return Err(format!("File '{}' not found", file_path));
    }

    let content = fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let agent = agent_name.unwrap_or_else(|| "user".to_string());

    // Build HANDOFF marker
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M").to_string();
    let new_marker = format!("<!-- HANDOFF:{}:{}:COMPLETE -->", now, agent);

    let new_content = if completed {
        // Add marker if not present, or replace existing
        if let Some(re) = RE_HANDOFF.as_ref() {
            if re.is_match(&content) {
                re.replace(&content, new_marker.as_str()).to_string()
            } else {
                // Append at end of file
                format!("{}\n\n{}\n", content.trim_end(), new_marker)
            }
        } else {
            // Regex failed, just append
            format!("{}\n\n{}\n", content.trim_end(), new_marker)
        }
    } else {
        // Remove marker(s)
        if let Some(re) = RE_HANDOFF.as_ref() {
            let without_marker = re.replace_all(&content, "").to_string();
            // Clean up extra newlines left behind
            let cleaned = without_marker
                .lines()
                .collect::<Vec<_>>()
                .join("\n");
            format!("{}\n", cleaned.trim_end())
        } else {
            content
        }
    };

    fs::write(&full_path, new_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}
