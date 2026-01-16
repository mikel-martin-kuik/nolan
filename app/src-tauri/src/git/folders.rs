//! Git folders management for external repository handling
//!
//! This module handles cloning, tracking, and managing external git repositories
//! that Nolan agents can be deployed to work on.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use ts_rs::TS;
use uuid::Uuid;

use crate::utils::paths::{get_git_folders_dir, get_git_folders_manifest_path, get_worktrees_dir};

/// Information about a managed git folder (cloned repository)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/git/")]
pub struct GitFolder {
    /// Unique identifier for this git folder
    pub id: String,
    /// Display name for the repository
    pub name: String,
    /// Git origin URL (remote origin)
    pub origin_url: String,
    /// Local path where the repository is cloned
    pub local_path: String,
    /// Current branch name
    pub current_branch: String,
    /// Optional tags for categorization
    #[serde(default)]
    pub tags: Vec<String>,
    /// When the repository was added
    pub created_at: DateTime<Utc>,
    /// Last sync/fetch timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_synced_at: Option<DateTime<Utc>>,
    /// Status of the git folder
    pub status: GitFolderStatus,
}

/// Status of a git folder
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/git/")]
#[serde(rename_all = "snake_case")]
pub enum GitFolderStatus {
    /// Repository is ready for use
    Ready,
    /// Repository is being cloned
    Cloning,
    /// Clone failed
    CloneFailed,
    /// Repository has been removed
    Removed,
}

/// Result of a git clone operation
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/git/")]
pub struct CloneResult {
    /// Whether the clone was successful
    pub success: bool,
    /// The created git folder (if successful)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<GitFolder>,
    /// Error message (if failed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Git folder with associated worktree information
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/git/")]
pub struct GitFolderWithWorktrees {
    /// The git folder info
    #[serde(flatten)]
    pub folder: GitFolder,
    /// List of active worktrees for this folder
    pub worktrees: Vec<GitFolderWorktree>,
}

/// Worktree associated with a git folder
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/git/")]
pub struct GitFolderWorktree {
    /// Path to the worktree
    pub path: String,
    /// Branch name
    pub branch: String,
    /// Current HEAD commit
    pub commit: String,
}

// =============================================================================
// Manifest Functions
// =============================================================================

/// Read all git folders from the manifest file
pub fn read_manifest() -> Result<Vec<GitFolder>, String> {
    let path = get_git_folders_manifest_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = File::open(&path).map_err(|e| format!("Failed to open git folders manifest: {}", e))?;
    let reader = BufReader::new(file);

    let mut folders = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read manifest line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }
        let folder: GitFolder = serde_json::from_str(&line)
            .map_err(|e| format!("Failed to parse git folder entry: {}", e))?;
        // Skip removed folders
        if folder.status != GitFolderStatus::Removed {
            folders.push(folder);
        }
    }

    Ok(folders)
}

/// Append a git folder to the manifest file
fn append_to_manifest(folder: &GitFolder) -> Result<(), String> {
    let path = get_git_folders_manifest_path()?;

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create manifest directory: {}", e))?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open manifest for append: {}", e))?;

    let json = serde_json::to_string(folder)
        .map_err(|e| format!("Failed to serialize git folder: {}", e))?;
    writeln!(file, "{}", json)
        .map_err(|e| format!("Failed to write git folder to manifest: {}", e))?;

    Ok(())
}

/// Rewrite the entire manifest with updated folders
fn rewrite_manifest(folders: &[GitFolder]) -> Result<(), String> {
    let path = get_git_folders_manifest_path()?;

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create manifest directory: {}", e))?;
    }

    let file = File::create(&path).map_err(|e| format!("Failed to recreate manifest: {}", e))?;
    let mut writer = std::io::BufWriter::new(file);

    for folder in folders {
        let json = serde_json::to_string(folder)
            .map_err(|e| format!("Failed to serialize git folder: {}", e))?;
        writeln!(writer, "{}", json)
            .map_err(|e| format!("Failed to write git folder: {}", e))?;
    }

    Ok(())
}

// =============================================================================
// Git Operations
// =============================================================================

/// Clone a git repository into the git folders directory
pub fn clone_repository(url: &str, name: Option<&str>) -> Result<GitFolder, String> {
    let git_folders_dir = get_git_folders_dir()?;

    // Ensure git folders directory exists
    fs::create_dir_all(&git_folders_dir)
        .map_err(|e| format!("Failed to create git folders directory: {}", e))?;

    // Generate folder ID and determine name
    let folder_id = format!("gf_{}", &Uuid::new_v4().to_string()[..8]);
    let folder_name = name
        .map(|n| n.to_string())
        .unwrap_or_else(|| extract_repo_name(url));

    // Create local path: git_folders/{id}-{name}
    let local_path = git_folders_dir.join(format!("{}-{}", folder_id, sanitize_name(&folder_name)));

    // Check if path already exists
    if local_path.exists() {
        return Err(format!("Path already exists: {}", local_path.display()));
    }

    // Create initial folder entry with Cloning status
    let mut folder = GitFolder {
        id: folder_id,
        name: folder_name,
        origin_url: url.to_string(),
        local_path: local_path.to_string_lossy().to_string(),
        current_branch: String::new(), // Will be set after clone
        tags: Vec::new(),
        created_at: Utc::now(),
        last_synced_at: None,
        status: GitFolderStatus::Cloning,
    };

    // Run git clone
    let output = Command::new("git")
        .args(["clone", url, &local_path.to_string_lossy()])
        .output()
        .map_err(|e| format!("Failed to run git clone: {}", e))?;

    if !output.status.success() {
        folder.status = GitFolderStatus::CloneFailed;
        append_to_manifest(&folder)?;
        return Err(format!(
            "git clone failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Get current branch
    folder.current_branch = get_current_branch(&local_path).unwrap_or_else(|_| "main".to_string());
    folder.status = GitFolderStatus::Ready;
    folder.last_synced_at = Some(Utc::now());

    // Save to manifest
    append_to_manifest(&folder)?;

    Ok(folder)
}

/// Fetch updates for a git folder
pub fn fetch_repository(folder_id: &str) -> Result<GitFolder, String> {
    let mut folders = read_manifest()?;
    let folder_idx = folders
        .iter()
        .position(|f| f.id == folder_id)
        .ok_or_else(|| format!("Git folder not found: {}", folder_id))?;

    let local_path = PathBuf::from(&folders[folder_idx].local_path);
    if !local_path.exists() {
        return Err(format!("Repository path does not exist: {}", local_path.display()));
    }

    // Run git fetch
    let output = Command::new("git")
        .args(["fetch", "--all"])
        .current_dir(&local_path)
        .output()
        .map_err(|e| format!("Failed to run git fetch: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git fetch failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Update current branch
    let current_branch = get_current_branch(&local_path).unwrap_or_else(|_| folders[folder_idx].current_branch.clone());
    folders[folder_idx].current_branch = current_branch;
    folders[folder_idx].last_synced_at = Some(Utc::now());

    // Clone the result before rewriting
    let result = folders[folder_idx].clone();

    // Save updated manifest
    rewrite_manifest(&folders)?;

    Ok(result)
}

/// Remove a git folder (marks as removed in manifest, optionally deletes files)
pub fn remove_git_folder(folder_id: &str, delete_files: bool) -> Result<(), String> {
    let mut folders = read_manifest()?;
    let folder_idx = folders
        .iter()
        .position(|f| f.id == folder_id)
        .ok_or_else(|| format!("Git folder not found: {}", folder_id))?;

    let folder = &mut folders[folder_idx];
    let local_path = PathBuf::from(&folder.local_path);

    // Delete files if requested
    if delete_files && local_path.exists() {
        fs::remove_dir_all(&local_path)
            .map_err(|e| format!("Failed to delete repository: {}", e))?;
    }

    // Mark as removed
    folder.status = GitFolderStatus::Removed;

    // Rewrite manifest
    rewrite_manifest(&folders)?;

    Ok(())
}

/// Get a single git folder by ID
pub fn get_git_folder(folder_id: &str) -> Result<GitFolder, String> {
    let folders = read_manifest()?;
    folders
        .into_iter()
        .find(|f| f.id == folder_id)
        .ok_or_else(|| format!("Git folder not found: {}", folder_id))
}

/// Update git folder metadata (name, tags)
pub fn update_git_folder(folder_id: &str, name: Option<String>, tags: Option<Vec<String>>) -> Result<GitFolder, String> {
    let mut folders = read_manifest()?;
    let folder_idx = folders
        .iter()
        .position(|f| f.id == folder_id)
        .ok_or_else(|| format!("Git folder not found: {}", folder_id))?;

    if let Some(new_name) = name {
        folders[folder_idx].name = new_name;
    }
    if let Some(new_tags) = tags {
        folders[folder_idx].tags = new_tags;
    }

    // Clone the result before rewriting
    let result = folders[folder_idx].clone();

    rewrite_manifest(&folders)?;

    Ok(result)
}

/// List all git folders with their worktree information
pub fn list_git_folders_with_worktrees() -> Result<Vec<GitFolderWithWorktrees>, String> {
    let folders = read_manifest()?;
    let mut result = Vec::new();

    for folder in folders {
        let worktrees = get_folder_worktrees(&folder)?;
        result.push(GitFolderWithWorktrees {
            folder,
            worktrees,
        });
    }

    Ok(result)
}

/// Get worktrees associated with a git folder
fn get_folder_worktrees(folder: &GitFolder) -> Result<Vec<GitFolderWorktree>, String> {
    let local_path = PathBuf::from(&folder.local_path);
    if !local_path.exists() {
        return Ok(Vec::new());
    }

    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&local_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree list: {}", e))?;

    if !output.status.success() {
        return Ok(Vec::new()); // Silently return empty if worktree list fails
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_commit = String::new();
    let mut current_branch = String::new();

    for line in output_str.lines() {
        if line.is_empty() {
            if !current_path.is_empty() {
                // Skip the main worktree (same as repo path)
                if current_path != folder.local_path {
                    worktrees.push(GitFolderWorktree {
                        path: current_path.clone(),
                        branch: current_branch.clone(),
                        commit: current_commit.clone(),
                    });
                }
                current_path.clear();
                current_commit.clear();
                current_branch.clear();
            }
            continue;
        }

        if let Some(path) = line.strip_prefix("worktree ") {
            current_path = path.to_string();
        } else if let Some(commit) = line.strip_prefix("HEAD ") {
            current_commit = commit.to_string();
        } else if let Some(branch) = line.strip_prefix("branch ") {
            current_branch = branch
                .strip_prefix("refs/heads/")
                .unwrap_or(branch)
                .to_string();
        }
    }

    // Handle last entry
    if !current_path.is_empty() && current_path != folder.local_path {
        worktrees.push(GitFolderWorktree {
            path: current_path,
            branch: current_branch,
            commit: current_commit,
        });
    }

    Ok(worktrees)
}

/// Create a worktree for a git folder
/// Worktrees are stored in the central worktrees directory
pub fn create_git_folder_worktree(
    folder_id: &str,
    branch_name: &str,
    agent_name: &str,
    run_id: &str,
) -> Result<String, String> {
    let folder = get_git_folder(folder_id)?;
    let local_path = PathBuf::from(&folder.local_path);

    if !local_path.exists() {
        return Err(format!("Repository path does not exist: {}", local_path.display()));
    }

    // Create worktree in central directory: worktrees/{agent_name}/{run_id}
    let worktrees_dir = get_worktrees_dir()?;
    let worktree_path = worktrees_dir.join(agent_name).join(run_id);

    // Ensure parent directory exists
    if let Some(parent) = worktree_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create worktree parent directory: {}", e))?;
    }

    // Create the worktree
    let output = Command::new("git")
        .args([
            "worktree",
            "add",
            "-b",
            branch_name,
            &worktree_path.to_string_lossy(),
            "HEAD",
        ])
        .current_dir(&local_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree add: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git worktree add failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(worktree_path.to_string_lossy().to_string())
}

// =============================================================================
// Import/Scan Functions
// =============================================================================

/// Scan result for a directory
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/git/")]
pub struct ScanResult {
    /// Path that was scanned
    pub path: String,
    /// Whether it's a git repository
    pub is_git_repo: bool,
    /// Repository name (from directory name)
    pub name: String,
    /// Remote origin URL (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_url: Option<String>,
    /// Current branch
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_branch: Option<String>,
}

/// Scan a directory for git repositories
pub fn scan_for_repositories(scan_path: &Path) -> Result<Vec<ScanResult>, String> {
    if !scan_path.exists() {
        return Err(format!("Scan path does not exist: {}", scan_path.display()));
    }

    if !scan_path.is_dir() {
        return Err(format!("Scan path is not a directory: {}", scan_path.display()));
    }

    let mut results = Vec::new();

    // Check if the scan path itself is a git repo
    if scan_path.join(".git").exists() {
        if let Ok(result) = scan_single_repo(scan_path) {
            results.push(result);
        }
    } else {
        // Scan subdirectories
        let entries = fs::read_dir(scan_path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join(".git").exists() {
                if let Ok(result) = scan_single_repo(&path) {
                    results.push(result);
                }
            }
        }
    }

    Ok(results)
}

/// Scan a single potential repository
fn scan_single_repo(path: &Path) -> Result<ScanResult, String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let is_git_repo = path.join(".git").exists();

    let origin_url = if is_git_repo {
        get_remote_origin(path).ok()
    } else {
        None
    };

    let current_branch = if is_git_repo {
        get_current_branch(path).ok()
    } else {
        None
    };

    Ok(ScanResult {
        path: path.to_string_lossy().to_string(),
        is_git_repo,
        name,
        origin_url,
        current_branch,
    })
}

/// Import an existing repository into git folders (via clone from local path)
pub fn import_repository(source_path: &Path, name: Option<&str>) -> Result<GitFolder, String> {
    if !source_path.exists() {
        return Err(format!("Source path does not exist: {}", source_path.display()));
    }

    // Get the origin URL to clone from
    let origin_url = get_remote_origin(source_path)
        .unwrap_or_else(|_| format!("file://{}", source_path.display()));

    // Clone from the origin (or local path if no remote)
    clone_repository(&origin_url, name)
}

// =============================================================================
// Helper Functions
// =============================================================================

/// Get the remote origin URL
fn get_remote_origin(repo_path: &Path) -> Result<String, String> {
    let output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git remote: {}", e))?;

    if !output.status.success() {
        return Err("No origin remote found".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Get the current branch name
fn get_current_branch(repo_path: &Path) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git rev-parse: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git rev-parse failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Extract repository name from URL
fn extract_repo_name(url: &str) -> String {
    let url = url.trim_end_matches('/');
    let url = url.strip_suffix(".git").unwrap_or(url);

    url.rsplit('/')
        .next()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "repository".to_string())
}

/// Sanitize a name for use in file paths
fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect::<String>()
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_repo_name() {
        assert_eq!(extract_repo_name("https://github.com/user/repo.git"), "repo");
        assert_eq!(extract_repo_name("https://github.com/user/repo"), "repo");
        assert_eq!(extract_repo_name("git@github.com:user/repo.git"), "repo");
        assert_eq!(extract_repo_name("/path/to/local/repo"), "repo");
    }

    #[test]
    fn test_sanitize_name() {
        assert_eq!(sanitize_name("My Repo"), "my-repo");
        assert_eq!(sanitize_name("my-repo_test"), "my-repo_test");
        assert_eq!(sanitize_name("repo@123!"), "repo-123-");
    }

    #[test]
    fn test_git_folder_status_serialization() {
        let status = GitFolderStatus::Ready;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"ready\"");

        let parsed: GitFolderStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, GitFolderStatus::Ready);
    }
}
