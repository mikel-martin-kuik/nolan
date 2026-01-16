//! Git worktree management for agent execution isolation
//!
//! Each agent execution can optionally run in its own git worktree,
//! providing file-level isolation and easy rollback capabilities.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use ts_rs::TS;

/// Information about an active worktree
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/git/")]
pub struct WorktreeInfo {
    /// Full path to the worktree directory
    pub path: String,
    /// Branch name for this worktree
    pub branch: String,
    /// HEAD commit at worktree creation
    pub base_commit: String,
    /// Agent name that owns this worktree
    pub agent_name: String,
    /// Run ID associated with this worktree
    pub run_id: String,
    /// When the worktree was created
    pub created_at: String,
    /// Current status of the worktree
    pub status: WorktreeStatus,
}

/// Status of a worktree
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/git/")]
#[serde(rename_all = "snake_case")]
pub enum WorktreeStatus {
    /// Agent is actively using this worktree
    Active,
    /// Agent completed, awaiting review/merge
    Completed,
    /// Worktree has been merged to main
    Merged,
    /// Worktree was discarded (changes rejected)
    Discarded,
    /// Agent failed, worktree kept for debugging
    Failed,
}

/// Detect the git repository root from a given path
pub fn detect_git_root(start_path: &Path) -> Option<PathBuf> {
    let mut current = start_path.to_path_buf();

    // Walk up the directory tree (max 20 levels)
    for _ in 0..20 {
        let git_dir = current.join(".git");
        if git_dir.exists() {
            return Some(current);
        }

        if !current.pop() {
            break;
        }
    }

    None
}

/// Get the current HEAD commit hash
pub fn get_head_commit(repo_path: &Path) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git rev-parse failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Get the current branch name
pub fn get_current_branch(repo_path: &Path) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git rev-parse --abbrev-ref failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Create a new worktree for an agent execution
///
/// # Arguments
/// * `repo_path` - Path to the main repository
/// * `worktree_path` - Where to create the worktree
/// * `branch_name` - Name for the new branch
/// * `base_ref` - Optional base ref (defaults to HEAD)
///
/// # Returns
/// The created WorktreeInfo on success
pub fn create_worktree(
    repo_path: &Path,
    worktree_path: &Path,
    branch_name: &str,
    base_ref: Option<&str>,
) -> Result<String, String> {
    // Ensure parent directory exists
    if let Some(parent) = worktree_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create worktree parent directory: {}", e))?;
    }

    // Get base commit
    let base = base_ref.unwrap_or("HEAD");

    // Create worktree with new branch
    // git worktree add -b <branch> <path> <base>
    let output = Command::new("git")
        .args([
            "worktree",
            "add",
            "-b",
            branch_name,
            &worktree_path.to_string_lossy(),
            base,
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree add: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git worktree add failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Get the commit hash of the base
    let commit_hash = get_head_commit(worktree_path)?;

    Ok(commit_hash)
}

/// List all worktrees for a repository
pub fn list_worktrees(repo_path: &Path) -> Result<Vec<WorktreeListEntry>, String> {
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree list: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git worktree list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current = WorktreeListEntry::default();

    for line in output_str.lines() {
        if line.is_empty() {
            if !current.path.is_empty() {
                worktrees.push(current);
                current = WorktreeListEntry::default();
            }
            continue;
        }

        if let Some(path) = line.strip_prefix("worktree ") {
            current.path = path.to_string();
        } else if let Some(commit) = line.strip_prefix("HEAD ") {
            current.commit = commit.to_string();
        } else if let Some(branch) = line.strip_prefix("branch ") {
            // Strip refs/heads/ prefix
            current.branch = branch
                .strip_prefix("refs/heads/")
                .unwrap_or(branch)
                .to_string();
        } else if line == "bare" {
            current.is_bare = true;
        } else if line == "detached" {
            current.is_detached = true;
        }
    }

    // Don't forget the last entry
    if !current.path.is_empty() {
        worktrees.push(current);
    }

    Ok(worktrees)
}

/// Entry from git worktree list
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/git/")]
pub struct WorktreeListEntry {
    pub path: String,
    pub commit: String,
    pub branch: String,
    pub is_bare: bool,
    pub is_detached: bool,
}

/// Remove a worktree
///
/// # Arguments
/// * `repo_path` - Path to the main repository
/// * `worktree_path` - Path to the worktree to remove
/// * `force` - Force removal even if there are changes
pub fn remove_worktree(repo_path: &Path, worktree_path: &Path, force: bool) -> Result<(), String> {
    let worktree_str = worktree_path.to_string_lossy().to_string();
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(&worktree_str);

    let output = Command::new("git")
        .args(&args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree remove: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git worktree remove failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Prune stale worktree entries
pub fn prune_worktrees(repo_path: &Path) -> Result<(), String> {
    let output = Command::new("git")
        .args(["worktree", "prune"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git worktree prune: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git worktree prune failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Check if a worktree has uncommitted changes
pub fn has_changes(worktree_path: &Path) -> Result<bool, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git status failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(!output.stdout.is_empty())
}

/// Get the number of commits ahead of base
pub fn commits_ahead(worktree_path: &Path, base_branch: &str) -> Result<u32, String> {
    let output = Command::new("git")
        .args(["rev-list", "--count", &format!("{}..HEAD", base_branch)])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git rev-list: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git rev-list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .map_err(|e| format!("Failed to parse commit count: {}", e))
}

/// Delete a branch (after worktree is removed)
pub fn delete_branch(repo_path: &Path, branch_name: &str, force: bool) -> Result<(), String> {
    let flag = if force { "-D" } else { "-d" };

    let output = Command::new("git")
        .args(["branch", flag, branch_name])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git branch delete: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git branch {} failed: {}",
            flag,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Generate a branch name for an agent execution
pub fn generate_branch_name(agent_name: &str, run_id: &str) -> String {
    format!("worktree/{}/{}", agent_name, run_id)
}

/// Get the worktrees directory path
/// Re-exports from paths module for convenience
pub fn get_worktrees_dir() -> Result<PathBuf, String> {
    crate::utils::paths::get_worktrees_dir()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_branch_name() {
        let name = generate_branch_name("processor", "abc123");
        assert_eq!(name, "worktree/processor/abc123");
    }
}
