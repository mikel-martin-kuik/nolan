use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use regex::Regex;
use crate::config::{TeamConfig, load_project_team};
use crate::utils::paths::get_projects_dir;

/// Project status derived from coordinator's output file
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Complete,
    InProgress,
    Pending,
}

/// Get expected workflow files from team config
/// Returns: (all_expected_files, workflow_files_with_handoff_tracking)
/// Requires team config - no fallback
fn get_expected_files_from_config(config: &TeamConfig) -> (Vec<String>, Vec<String>) {
    let mut expected = Vec::new();
    let mut workflow = Vec::new();

    // Always include prompt.md and context.md
    expected.push("prompt.md".to_string());
    expected.push("context.md".to_string());
    workflow.push("context.md".to_string());

    // Add phase outputs from workflow
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

    // Add coordinator's output file
    let coordinator_file = config.coordinator_output_file();
    let coordinator_file = if coordinator_file.ends_with(".md") {
        coordinator_file
    } else {
        format!("{}.md", coordinator_file)
    };
    if !expected.contains(&coordinator_file) {
        expected.push(coordinator_file);
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
/// - `<!-- PROJECT:STATUS:CLOSED:date -->` → Complete
/// - `<!-- PROJECT:STATUS:ARCHIVED:date -->` → Complete
/// - `<!-- PROJECT:STATUS:INPROGRESS:date -->` → InProgress
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
        if trimmed.contains("<!-- PROJECT:STATUS:ARCHIVED") {
            return (ProjectStatus::Complete, Some(trimmed.to_string()));
        }

        // In Progress marker
        if trimmed.contains("<!-- PROJECT:STATUS:INPROGRESS") {
            return (ProjectStatus::InProgress, Some(trimmed.to_string()));
        }
    }

    // No marker = pending (explicit marking required)
    (ProjectStatus::Pending, None)
}

/// Parse HANDOFF marker from file content
/// Format: <!-- HANDOFF:YYYY-MM-DD HH:MM:agent:COMPLETE -->
fn parse_handoff_marker(content: &str) -> Option<(String, String)> {
    // Match the most recent HANDOFF marker (last one in file)
    let re = Regex::new(r"<!-- HANDOFF:(\d{4}-\d{2}-\d{2} \d{2}:\d{2}):(\w+):COMPLETE -->")
        .ok()?;

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
/// workflow_files: List of files to check for HANDOFF markers (from team config)
fn get_file_completions(project_path: &PathBuf, workflow_files: &[String]) -> Vec<FileCompletion> {
    let mut completions = Vec::new();

    // Check workflow files first
    for file in workflow_files {
        let file_path = project_path.join(file);
        let exists = file_path.exists();

        let (completed, completed_by, completed_at) = if exists {
            // Read file and check for HANDOFF marker
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

    // Check prompt.md separately (special file with different requirements)
    let prompt_path = project_path.join("prompt.md");
    let prompt_exists = prompt_path.exists();

    let (prompt_completed, prompt_completed_by, prompt_completed_at) = if prompt_exists {
        // Read file and check for HANDOFF marker
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

        // Read team from .team file (required)
        let team_file = path.join(".team");
        let team = match fs::read_to_string(&team_file) {
            Ok(s) => s.trim().to_string(),
            Err(_) => {
                // Skip projects without .team file
                continue;
            }
        };

        // Load team config (required)
        let team_config = match load_project_team(&path) {
            Ok(config) => config,
            Err(_) => {
                // Skip projects with invalid team config
                continue;
            }
        };

        // Parse status from coordinator's output file
        let coordinator_file = team_config.coordinator_output_file();
        let coordinator_path = path.join(&coordinator_file);
        let (status, status_detail) = if coordinator_path.exists() {
            match fs::read_to_string(&coordinator_path) {
                Ok(content) => parse_project_status(&content),
                Err(_) => (ProjectStatus::Pending, None),
            }
        } else {
            (ProjectStatus::Pending, None)
        };

        // Get expected files from team config
        let (expected_files, workflow_files) = get_expected_files_from_config(&team_config);

        // Get file scaffolding info using team-specific expected files
        let (existing_files, missing_files) = get_file_scaffolding(&path, &expected_files);

        // Get workflow file completion status using team-specific workflow files
        let file_completions = get_file_completions(&path, &workflow_files);

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
    let coordinator_file = team_config.coordinator_output_file();

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

    // Sort: coordinator file first, context.md second, placeholders last, then alphabetically
    files.sort_by(|a, b| {
        // Placeholders go last
        if a.is_placeholder && !b.is_placeholder {
            return std::cmp::Ordering::Greater;
        }
        if !a.is_placeholder && b.is_placeholder {
            return std::cmp::Ordering::Less;
        }

        if a.name == coordinator_file {
            std::cmp::Ordering::Less
        } else if b.name == coordinator_file {
            std::cmp::Ordering::Greater
        } else if a.name == "context.md" {
            std::cmp::Ordering::Less
        } else if b.name == "context.md" {
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

/// Read the roadmap.md file from the projects directory
#[tauri::command]
pub async fn read_roadmap() -> Result<String, String> {
    let projects_dir = get_projects_dir()?;
    let roadmap_path = projects_dir.join("roadmap.md");

    // Check if roadmap exists
    if !roadmap_path.exists() {
        return Err("Roadmap file not found. Create roadmap.md in the projects directory.".to_string());
    }

    // Read roadmap content
    let content = fs::read_to_string(&roadmap_path)
        .map_err(|e| format!("Failed to read roadmap: {}", e))?;

    Ok(content)
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

/// Create a new project directory with initial coordinator file and .team file
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

    // Load team config first to get coordinator's output file
    let team = team_name.unwrap_or_else(|| "default".to_string());
    let team_config = TeamConfig::load(&team)
        .map_err(|e| format!("Failed to load team config '{}': {}", team, e))?;
    let coordinator_file = team_config.coordinator_output_file();
    let coordinator_name = team_config.coordinator();

    let projects_dir = get_projects_dir()?;
    let project_path = projects_dir.join(&project_name);

    // Check if project already exists
    if project_path.exists() {
        return Err(format!("Project '{}' already exists", project_name));
    }

    // Create project directory
    fs::create_dir_all(&project_path)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    // Create .team file with team assignment
    let team_file = project_path.join(".team");
    fs::write(&team_file, &team)
        .map_err(|e| format!("Failed to create .team file: {}", e))?;

    // Create initial coordinator file with IN_PROGRESS marker
    let now = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let coordinator_content = format!(
        r#"# {}

<!-- PROJECT:STATUS:INPROGRESS:{} -->

## Current Status

**Phase**: Initializing
**Assigned**: {}

## Notes

Project created via Nolan Dashboard.
"#,
        project_name, now, coordinator_name
    );

    let coordinator_path = project_path.join(&coordinator_file);
    fs::write(&coordinator_path, coordinator_content)
        .map_err(|e| format!("Failed to create {}: {}", coordinator_file, e))?;

    Ok(project_path.to_string_lossy().to_string())
}
