use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use crate::utils::paths::get_projects_dir;

/// Project status derived from NOTES.md
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Complete,
    InProgress,
    Pending,
}

/// Expected workflow files for scaffolding
const EXPECTED_FILES: &[&str] = &[
    "NOTES.md",
    "context.md",
    "research.md",
    "plan.md",
    "qa-review.md",
    "progress.md",
];

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
/// CRITICAL: Must align with validation hooks (validate-phase-complete.py, session-context.sh)
///
/// Complete patterns (from session-context.sh:36 and actual NOTES.md):
/// - `**Status:** Complete` (exact, from hooks)
/// - `**Status:** ✅ Complete`
/// - `**Status:** ✅ COMPLETE - DEPLOYED`
/// - `**Phase**: ✅ COMPLETE - PRODUCTION`
/// - `## Project Status: CLOSED`
/// - `## Status: APPROVED - Implementation Phase` → Complete when has deployment indicators
///
/// In Progress patterns (from validate-phase-complete.py:121 and actual NOTES.md):
/// - `STATUS: IN_PROGRESS` (uppercase, from hooks)
/// - `Status: IN_PROGRESS` (from hooks)
/// - `**Status**: In Progress`
/// - `## Status: APPROVED - Implementation Phase`
/// - `**Assigned:** Ana/Bill/Carl/Enzo`
///
/// Pending:
/// - No status section or no NOTES.md
fn parse_project_status(notes_content: &str) -> (ProjectStatus, Option<String>) {
    // Pattern 1: Check for uppercase STATUS: IN_PROGRESS (from validate-phase-complete.py:121)
    for line in notes_content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('|') {
            continue; // Skip table rows
        }

        // Exact hook pattern: STATUS: IN_PROGRESS or Status: IN_PROGRESS
        if trimmed.contains("STATUS: IN_PROGRESS") || trimmed.contains("Status: IN_PROGRESS") {
            return (ProjectStatus::InProgress, Some(trimmed.to_string()));
        }
    }

    // Pattern 2: Check for "## Project Status: CLOSED" header (explicit complete)
    for line in notes_content.lines() {
        let line_lower = line.to_lowercase();
        if line_lower.starts_with("## project status:") && line_lower.contains("closed") {
            return (ProjectStatus::Complete, Some(line.trim().to_string()));
        }
    }

    // Pattern 3: Check **Status:** lines (not in tables)
    // This matches session-context.sh:36 pattern: **Status:** Complete
    for line in notes_content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('|') {
            continue; // Skip table rows
        }

        let line_lower = trimmed.to_lowercase();

        // Check for **Status:** / **Status**: / **PROJECT STATUS:** field
        if line_lower.contains("**status:**") || line_lower.contains("**status**:")
            || line_lower.contains("**project status:**") || line_lower.contains("**project status**:") {

            // COMPLETE: Check for complete indicators
            if line_lower.contains("complete") {
                // Complete with deployment/production indicators
                if line_lower.contains("deployed")
                    || line_lower.contains("production")
                    || line_lower.contains("closed")
                    || line_lower.contains("deployment ready")
                    || line_lower.contains("production ready")
                    || line_lower.contains("full refactor")
                    || trimmed.ends_with("Complete") // Exact hook pattern
                    || trimmed.ends_with("✓")
                    || (line_lower.contains("✅") && line_lower.contains("complete"))
                {
                    return (ProjectStatus::Complete, Some(trimmed.to_string()));
                }
            }

            // Also check for deployed/production without "complete"
            if line_lower.contains("deployed to production")
                || (line_lower.contains("✅") && line_lower.contains("deployed"))
            {
                return (ProjectStatus::Complete, Some(trimmed.to_string()));
            }

            // IN PROGRESS: Generic "In Progress" or specific phase indicators
            // Only match "APPROVED - [Phase]" pattern, not "All phases approved"
            if line_lower.contains("in progress")
                || line_lower.contains("implementation phase")
                || line_lower.contains("research phase")
                || line_lower.contains("planning phase")
                || line_lower.contains("qa phase")
                || line_lower.contains("enhancement phase")
                || line_lower.contains("approved - implementation phase")
                || line_lower.contains("approved - research phase")
                || line_lower.contains("approved - planning phase")
            {
                return (ProjectStatus::InProgress, Some(trimmed.to_string()));
            }
        }

        // Check for **Phase:** or **Current Phase:** field
        if line_lower.contains("**phase**:") || line_lower.contains("**current phase:**") {
            // COMPLETE: Phase with checkmark + complete/enhanced indicators
            if (line_lower.contains("✅") && line_lower.contains("feature enhanced"))
                || (line_lower.contains("✅") && line_lower.contains("complete"))
                || ((line_lower.contains("complete") || line_lower.contains("feature enhanced")) &&
                    (line_lower.contains("deployed")
                     || line_lower.contains("production")
                     || line_lower.contains("closed")
                     || line_lower.contains("refactor")
                     || line_lower.contains("approved")
                     || line_lower.contains("project complete")))
            {
                return (ProjectStatus::Complete, Some(trimmed.to_string()));
            }

            // IN PROGRESS: Active phase names
            if line_lower.contains("research")
                || line_lower.contains("planning")
                || line_lower.contains("implementation")
                || line_lower.contains("qa")
                || line_lower.contains("enhancement")
            {
                return (ProjectStatus::InProgress, Some(trimmed.to_string()));
            }
        }
    }

    // Pattern 4: Check for table rows with Final QA PASS or Closure APPROVED
    for line in notes_content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('|') && (
            (trimmed.contains("Final QA") && trimmed.contains("PASS"))
            || (trimmed.contains("Closure") && trimmed.contains("PO") && trimmed.contains("APPROVED"))
            || (trimmed.contains("Final Approval") && trimmed.contains("COMPLETE"))
        ) {
            return (ProjectStatus::Complete, Some(trimmed.to_string()));
        }
    }

    // Pattern 4: Check for **Assigned:** line (indicates in progress)
    for line in notes_content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('|') {
            continue;
        }
        let line_lower = trimmed.to_lowercase();
        if (line_lower.contains("**assigned:**") || line_lower.contains("**assigned**:"))
            && (line_lower.contains("ana")
                || line_lower.contains("bill")
                || line_lower.contains("carl")
                || line_lower.contains("enzo")
                || line_lower.contains("ralph"))
        {
            return (ProjectStatus::InProgress, Some(trimmed.to_string()));
        }
    }

    // Pattern 5: Check ## Status: header
    for line in notes_content.lines() {
        let line_lower = line.to_lowercase();
        if line_lower.starts_with("## status:") {
            if line_lower.contains("closed")
                || (line_lower.contains("complete") && !line_lower.contains("phase"))
            {
                return (ProjectStatus::Complete, Some(line.trim().to_string()));
            }
            if line_lower.contains("approved")
                || line_lower.contains("phase")
                || line_lower.contains("progress")
                || line_lower.contains("in progress")
            {
                return (ProjectStatus::InProgress, Some(line.trim().to_string()));
            }
        }
    }

    // Default to pending (no clear status found)
    (ProjectStatus::Pending, None)
}

/// Determine which expected files exist and which are missing
fn get_file_scaffolding(project_path: &PathBuf) -> (Vec<String>, Vec<String>) {
    let mut existing = Vec::new();
    let mut missing = Vec::new();

    for file in EXPECTED_FILES {
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

        // Skip hidden directories
        if name.starts_with('.') {
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

        // Get file scaffolding info
        let (existing_files, missing_files) = get_file_scaffolding(&path);

        projects.push(ProjectInfo {
            name,
            path: path.to_string_lossy().to_string(),
            file_count,
            last_modified,
            status,
            status_detail,
            existing_files,
            missing_files,
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

    let mut files = Vec::new();
    let mut existing_names: std::collections::HashSet<String> = std::collections::HashSet::new();

    collect_md_files(&canonical_path, &canonical_path, &mut files, &mut existing_names)?;

    // Add placeholder files for missing expected files
    for expected in EXPECTED_FILES {
        if !existing_names.contains(*expected) {
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

    // Sort: NOTES.md first, context.md second, placeholders last, then alphabetically
    files.sort_by(|a, b| {
        // Placeholders go last
        if a.is_placeholder && !b.is_placeholder {
            return std::cmp::Ordering::Greater;
        }
        if !a.is_placeholder && b.is_placeholder {
            return std::cmp::Ordering::Less;
        }

        if a.name == "NOTES.md" {
            std::cmp::Ordering::Less
        } else if b.name == "NOTES.md" {
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

    // Canonicalize to resolve symlinks and verify
    let canonical_path = full_path
        .canonicalize()
        .map_err(|e| format!("File not found: {}", e))?;

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
