//! File system browsing commands
//! Provides directory listing, file reading, and file search capabilities
//! for the File Browser panel.

use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use crate::utils::paths::{get_nolan_data_root, get_projects_dir};

/// A single entry in a directory listing (file or subdirectory)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemEntry {
    /// File or directory name
    pub name: String,
    /// Full path to the entry
    pub path: String,
    /// Whether this is a directory
    pub is_directory: bool,
    /// File size in bytes (0 for directories)
    pub size: u64,
    /// Last modified time as ISO 8601 string
    pub last_modified: String,
    /// Human-readable time ago string
    pub last_modified_ago: Option<String>,
    /// Whether this is a hidden file (starts with .)
    pub is_hidden: bool,
    /// File extension (empty for directories)
    pub extension: String,
}

/// Result of browsing a directory
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryContents {
    /// Current path being browsed
    pub current_path: String,
    /// Parent directory path (None if at root)
    pub parent: Option<String>,
    /// Directory name
    pub name: String,
    /// List of entries (files and subdirectories)
    pub entries: Vec<FileSystemEntry>,
    /// Total number of entries
    pub total_count: usize,
}

/// File content result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    /// Full path to the file
    pub path: String,
    /// File content as string (for text files)
    pub content: String,
    /// File size in bytes
    pub size: u64,
    /// MIME type hint based on extension
    pub mime_type: String,
    /// Whether file is editable (text-based)
    pub is_editable: bool,
}

/// Search result entry
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    /// File/directory name
    pub name: String,
    /// Full path
    pub path: String,
    /// Whether this is a directory
    pub is_directory: bool,
    /// Relative path from search root
    pub relative_path: String,
}

/// Calculate human-readable time ago string
fn time_ago(modified_time: std::time::SystemTime) -> String {
    let now = std::time::SystemTime::now();
    let duration = now.duration_since(modified_time).unwrap_or_default();
    let secs = duration.as_secs();

    if secs < 60 {
        "just now".to_string()
    } else if secs < 3600 {
        format!("{}m ago", secs / 60)
    } else if secs < 86400 {
        format!("{}h ago", secs / 3600)
    } else if secs < 604800 {
        format!("{}d ago", secs / 86400)
    } else {
        format!("{}w ago", secs / 604800)
    }
}

/// Get MIME type based on file extension
fn get_mime_type(extension: &str) -> String {
    match extension.to_lowercase().as_str() {
        "md" | "markdown" => "text/markdown",
        "txt" => "text/plain",
        "json" => "application/json",
        "yaml" | "yml" => "text/yaml",
        "toml" => "text/toml",
        "rs" => "text/x-rust",
        "ts" | "tsx" => "text/typescript",
        "js" | "jsx" => "text/javascript",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "py" => "text/x-python",
        "sh" | "bash" => "text/x-shellscript",
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }.to_string()
}

/// Check if a file is editable (text-based)
fn is_editable(extension: &str, mime_type: &str) -> bool {
    // .md, .txt, and .yaml/.yml are editable
    matches!(extension.to_lowercase().as_str(), "md" | "txt" | "yaml" | "yml")
        || mime_type.starts_with("text/markdown")
        || mime_type == "text/plain"
        || mime_type == "text/yaml"
}

/// Validate path is within allowed root directories
/// Returns canonicalized path if valid
fn validate_path(path: &str) -> Result<PathBuf, String> {
    // Security: No path traversal allowed
    if path.contains("..") {
        return Err("Invalid path: path traversal not allowed".to_string());
    }

    let path_buf = PathBuf::from(path);

    // Path must be absolute
    if !path_buf.is_absolute() {
        return Err("Invalid path: must be absolute".to_string());
    }

    // Canonicalize to resolve symlinks
    let canonical = path_buf
        .canonicalize()
        .map_err(|e| format!("Path not found: {}", e))?;

    // Security: Path must be within allowed roots
    // Allowed: home directory, nolan data root, and /tmp for testing
    let home_dir = std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "HOME not set")?;

    let nolan_root = get_nolan_data_root()?;

    let allowed_roots = vec![
        home_dir.clone(),
        nolan_root,
        PathBuf::from("/tmp"),
    ];

    let is_allowed = allowed_roots.iter().any(|root| {
        canonical.starts_with(root)
    });

    if !is_allowed {
        return Err("Access denied: path outside allowed directories".to_string());
    }

    // Security: Block sensitive files
    let path_str = canonical.to_string_lossy().to_lowercase();
    if path_str.contains(".env")
        || path_str.contains("/secrets/")
        || path_str.ends_with(".key")
        || path_str.ends_with(".pem")
        || path_str.contains("/.ssh/")
        || path_str.contains("/.gnupg/")
    {
        return Err("Access denied: sensitive file".to_string());
    }

    Ok(canonical)
}

/// List contents of a directory
#[tauri::command(rename_all = "snake_case")]
pub async fn browse_directory(path: String, show_hidden: Option<bool>) -> Result<DirectoryContents, String> {
    let canonical = validate_path(&path)?;
    let show_hidden = show_hidden.unwrap_or(false);

    if !canonical.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let entries_iter = fs::read_dir(&canonical)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut entries: Vec<FileSystemEntry> = Vec::new();

    for entry in entries_iter {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();

        let name = entry_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // Skip hidden files unless requested
        let is_hidden = name.starts_with('.');
        if is_hidden && !show_hidden {
            continue;
        }

        let metadata = entry_path.metadata().ok();
        let is_directory = entry_path.is_dir();

        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

        let modified_time = metadata.as_ref().and_then(|m| m.modified().ok());
        let last_modified = modified_time
            .and_then(|time| {
                time.duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|d| {
                        chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                            .map(|dt| dt.to_rfc3339())
                            .unwrap_or_default()
                    })
            })
            .unwrap_or_default();

        let last_modified_ago = modified_time.map(time_ago);

        let extension = if is_directory {
            String::new()
        } else {
            entry_path
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default()
        };

        entries.push(FileSystemEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory,
            size,
            last_modified,
            last_modified_ago,
            is_hidden,
            extension,
        });
    }

    // Sort: directories first, then alphabetically (case-insensitive)
    entries.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    let total_count = entries.len();
    let parent = canonical.parent().map(|p| p.to_string_lossy().to_string());
    let name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    Ok(DirectoryContents {
        current_path: canonical.to_string_lossy().to_string(),
        parent,
        name,
        entries,
        total_count,
    })
}

/// Read file content
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<FileContent, String> {
    let canonical = validate_path(&path)?;

    if !canonical.is_file() {
        return Err("Path is not a file".to_string());
    }

    let metadata = fs::metadata(&canonical)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    let size = metadata.len();

    // Limit file size to prevent memory issues (10 MB)
    if size > 10 * 1024 * 1024 {
        return Err("File too large (max 10 MB)".to_string());
    }

    let extension = canonical
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();

    let mime_type = get_mime_type(&extension);

    // For non-text files, return empty content but with metadata
    let is_text = mime_type.starts_with("text/") || mime_type.starts_with("application/json");

    let content = if is_text {
        fs::read_to_string(&canonical)
            .map_err(|e| format!("Failed to read file: {}", e))?
    } else {
        // For binary files, just indicate it's not displayable as text
        String::new()
    };

    let is_editable = is_editable(&extension, &mime_type);

    Ok(FileContent {
        path: canonical.to_string_lossy().to_string(),
        content,
        size,
        mime_type,
        is_editable,
    })
}

/// Write file content (only for editable files)
#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    let canonical = validate_path(&path)?;

    if !canonical.is_file() {
        return Err("Path is not a file".to_string());
    }

    // Check if file is editable
    let extension = canonical
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();

    let mime_type = get_mime_type(&extension);

    if !is_editable(&extension, &mime_type) {
        return Err("File is not editable (only .md, .txt, and .yaml files can be edited)".to_string());
    }

    fs::write(&canonical, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

/// Search for files/directories matching a pattern
#[tauri::command(rename_all = "snake_case")]
pub async fn search_files(
    root_path: String,
    pattern: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let canonical = validate_path(&root_path)?;
    let max_results = max_results.unwrap_or(100);

    if !canonical.is_dir() {
        return Err("Root path is not a directory".to_string());
    }

    let pattern_lower = pattern.to_lowercase();
    let mut results = Vec::new();

    fn search_recursive(
        dir: &PathBuf,
        root: &PathBuf,
        pattern: &str,
        results: &mut Vec<SearchResult>,
        max_results: usize,
        depth: usize,
    ) -> Result<(), String> {
        // Limit recursion depth to prevent infinite loops
        if depth > 20 || results.len() >= max_results {
            return Ok(());
        }

        let entries = fs::read_dir(dir)
            .map_err(|_| "Failed to read directory")?;

        for entry in entries.flatten() {
            if results.len() >= max_results {
                break;
            }

            let path = entry.path();
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Skip hidden directories in search
            if name.starts_with('.') {
                continue;
            }

            // Check if name matches pattern
            if name.to_lowercase().contains(pattern) {
                let relative_path = path
                    .strip_prefix(root)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| path.to_string_lossy().to_string());

                results.push(SearchResult {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_directory: path.is_dir(),
                    relative_path,
                });
            }

            // Recurse into subdirectories
            if path.is_dir() {
                let _ = search_recursive(&path, root, pattern, results, max_results, depth + 1);
            }
        }

        Ok(())
    }

    search_recursive(&canonical, &canonical, &pattern_lower, &mut results, max_results, 0)?;

    // Sort by relevance: exact matches first, then by path length
    results.sort_by(|a, b| {
        let a_exact = a.name.to_lowercase() == pattern_lower;
        let b_exact = b.name.to_lowercase() == pattern_lower;

        match (a_exact, b_exact) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.relative_path.len().cmp(&b.relative_path.len()),
        }
    });

    Ok(results)
}

/// Get file/directory metadata
#[tauri::command]
pub async fn get_file_metadata(path: String) -> Result<FileSystemEntry, String> {
    let canonical = validate_path(&path)?;

    let metadata = fs::metadata(&canonical)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;

    let name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let is_directory = canonical.is_dir();
    let size = metadata.len();

    let modified_time = metadata.modified().ok();
    let last_modified = modified_time
        .and_then(|time| {
            time.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| {
                    chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                        .map(|dt| dt.to_rfc3339())
                        .unwrap_or_default()
                })
        })
        .unwrap_or_default();

    let last_modified_ago = modified_time.map(time_ago);

    let extension = if is_directory {
        String::new()
    } else {
        canonical
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default()
    };

    let is_hidden = name.starts_with('.');

    Ok(FileSystemEntry {
        name,
        path: canonical.to_string_lossy().to_string(),
        is_directory,
        size,
        last_modified,
        last_modified_ago,
        is_hidden,
        extension,
    })
}

/// Get default path for file browser (projects directory)
#[tauri::command]
pub async fn get_file_browser_default_path() -> Result<String, String> {
    let projects_dir = get_projects_dir()?;
    Ok(projects_dir.to_string_lossy().to_string())
}

/// Create a new file
#[tauri::command]
pub async fn create_file(path: String) -> Result<FileSystemEntry, String> {
    let canonical_parent = validate_path(
        &PathBuf::from(&path)
            .parent()
            .ok_or("Invalid path: no parent directory")?
            .to_string_lossy()
    )?;

    let file_path = canonical_parent.join(
        PathBuf::from(&path)
            .file_name()
            .ok_or("Invalid path: no filename")?
    );

    // Check if file already exists
    if file_path.exists() {
        return Err("File already exists".to_string());
    }

    // Create empty file
    fs::write(&file_path, "")
        .map_err(|e| format!("Failed to create file: {}", e))?;

    // Return file metadata
    get_file_metadata(file_path.to_string_lossy().to_string()).await
}

/// Create a new directory
#[tauri::command]
pub async fn create_directory(path: String) -> Result<FileSystemEntry, String> {
    let canonical_parent = validate_path(
        &PathBuf::from(&path)
            .parent()
            .ok_or("Invalid path: no parent directory")?
            .to_string_lossy()
    )?;

    let dir_path = canonical_parent.join(
        PathBuf::from(&path)
            .file_name()
            .ok_or("Invalid path: no directory name")?
    );

    // Check if directory already exists
    if dir_path.exists() {
        return Err("Directory already exists".to_string());
    }

    // Create directory
    fs::create_dir(&dir_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Return directory metadata
    get_file_metadata(dir_path.to_string_lossy().to_string()).await
}

/// Delete a file
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let canonical = validate_path(&path)?;

    if !canonical.is_file() {
        return Err("Path is not a file".to_string());
    }

    fs::remove_file(&canonical)
        .map_err(|e| format!("Failed to delete file: {}", e))?;

    Ok(())
}

/// Delete a directory (must be empty)
#[tauri::command]
pub async fn delete_directory(path: String, recursive: Option<bool>) -> Result<(), String> {
    let canonical = validate_path(&path)?;

    if !canonical.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    if recursive.unwrap_or(false) {
        fs::remove_dir_all(&canonical)
            .map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        fs::remove_dir(&canonical)
            .map_err(|e| format!("Failed to delete directory (not empty?): {}", e))?;
    }

    Ok(())
}

/// Rename/move a file or directory
#[tauri::command(rename_all = "snake_case")]
pub async fn rename_file(old_path: String, new_path: String) -> Result<FileSystemEntry, String> {
    let canonical_old = validate_path(&old_path)?;

    // Validate the new path's parent directory
    let new_parent = PathBuf::from(&new_path)
        .parent()
        .ok_or("Invalid new path: no parent directory")?
        .to_string_lossy()
        .to_string();

    let canonical_parent = validate_path(&new_parent)?;

    let new_file_path = canonical_parent.join(
        PathBuf::from(&new_path)
            .file_name()
            .ok_or("Invalid new path: no filename")?
    );

    // Check if new path already exists
    if new_file_path.exists() {
        return Err("Destination already exists".to_string());
    }

    // Rename/move
    fs::rename(&canonical_old, &new_file_path)
        .map_err(|e| format!("Failed to rename: {}", e))?;

    // Return new file metadata
    get_file_metadata(new_file_path.to_string_lossy().to_string()).await
}
