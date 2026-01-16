//! Tauri commands for git folders management
//!
//! Provides API endpoints for cloning, listing, and managing external git repositories.

use std::path::PathBuf;

use crate::git::folders::{
    self, CloneResult, GitFolder, GitFolderWithWorktrees, ScanResult,
};

/// List all git folders
#[tauri::command]
pub async fn list_git_folders() -> Result<Vec<GitFolder>, String> {
    folders::read_manifest()
}

/// List all git folders with their associated worktrees
#[tauri::command]
pub async fn list_git_folders_with_worktrees() -> Result<Vec<GitFolderWithWorktrees>, String> {
    folders::list_git_folders_with_worktrees()
}

/// Get a single git folder by ID
#[tauri::command]
pub async fn get_git_folder(folder_id: String) -> Result<GitFolder, String> {
    folders::get_git_folder(&folder_id)
}

/// Clone a git repository
#[tauri::command]
pub async fn clone_git_repository(url: String, name: Option<String>) -> Result<CloneResult, String> {
    // Validate URL
    if url.trim().is_empty() {
        return Ok(CloneResult {
            success: false,
            folder: None,
            error: Some("Repository URL cannot be empty".to_string()),
        });
    }

    match folders::clone_repository(&url, name.as_deref()) {
        Ok(folder) => Ok(CloneResult {
            success: true,
            folder: Some(folder),
            error: None,
        }),
        Err(e) => Ok(CloneResult {
            success: false,
            folder: None,
            error: Some(e),
        }),
    }
}

/// Fetch updates for a git folder
#[tauri::command]
pub async fn fetch_git_folder(folder_id: String) -> Result<GitFolder, String> {
    folders::fetch_repository(&folder_id)
}

/// Remove a git folder
#[tauri::command]
pub async fn remove_git_folder(folder_id: String, delete_files: bool) -> Result<(), String> {
    folders::remove_git_folder(&folder_id, delete_files)
}

/// Update git folder metadata
#[tauri::command]
pub async fn update_git_folder(
    folder_id: String,
    name: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<GitFolder, String> {
    folders::update_git_folder(&folder_id, name, tags)
}

/// Scan a directory for git repositories
#[tauri::command]
pub async fn scan_for_git_repositories(path: String) -> Result<Vec<ScanResult>, String> {
    let scan_path = PathBuf::from(&path);

    // Security: Ensure path is absolute and doesn't contain traversal attempts
    if path.contains("..") {
        return Err("Path cannot contain '..'".to_string());
    }

    folders::scan_for_repositories(&scan_path)
}

/// Import an existing repository into git folders
#[tauri::command]
pub async fn import_git_repository(
    source_path: String,
    name: Option<String>,
) -> Result<CloneResult, String> {
    let path = PathBuf::from(&source_path);

    // Security: Ensure path is absolute and doesn't contain traversal attempts
    if source_path.contains("..") {
        return Ok(CloneResult {
            success: false,
            folder: None,
            error: Some("Path cannot contain '..'".to_string()),
        });
    }

    match folders::import_repository(&path, name.as_deref()) {
        Ok(folder) => Ok(CloneResult {
            success: true,
            folder: Some(folder),
            error: None,
        }),
        Err(e) => Ok(CloneResult {
            success: false,
            folder: None,
            error: Some(e),
        }),
    }
}

/// Create a worktree for a git folder
#[tauri::command]
pub async fn create_git_folder_worktree(
    folder_id: String,
    branch_name: String,
    agent_name: String,
    run_id: String,
) -> Result<String, String> {
    // Validate inputs
    if folder_id.trim().is_empty() {
        return Err("Folder ID cannot be empty".to_string());
    }
    if branch_name.trim().is_empty() {
        return Err("Branch name cannot be empty".to_string());
    }
    if agent_name.trim().is_empty() {
        return Err("Agent name cannot be empty".to_string());
    }
    if run_id.trim().is_empty() {
        return Err("Run ID cannot be empty".to_string());
    }

    folders::create_git_folder_worktree(&folder_id, &branch_name, &agent_name, &run_id)
}
