//! Agent deployment to external repositories
//!
//! This module handles deploying Nolan agents to external git repositories,
//! providing environment abstraction and .claude configuration portability.

use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::utils::paths::get_deployments_path;
use crate::git::worktree;

/// Information about a deployed agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentInfo {
    /// Unique deployment identifier
    pub id: String,
    /// Agent identifier (e.g., "carl", "dan")
    pub agent_id: String,
    /// Team name if applicable
    pub team: Option<String>,
    /// Path to the target repository
    pub target_repo: PathBuf,
    /// Path to the created worktree
    pub worktree_path: PathBuf,
    /// Branch name for the worktree
    pub worktree_branch: String,
    /// Whether .claude directory was copied (vs existing)
    pub claude_copied: bool,
    /// Whether CLAUDE.md was copied (vs existing)
    pub claude_md_copied: bool,
    /// When the deployment was created
    pub deployed_at: DateTime<Utc>,
    /// Current status of the deployment
    pub status: DeploymentStatus,
}

/// Status of a deployment
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DeploymentStatus {
    /// Agent is actively working in the deployment
    Active,
    /// Deployment completed successfully
    Completed,
    /// Deployment failed
    Failed,
}

/// Result of bootstrapping .claude config into a worktree
#[derive(Debug, Clone, Default)]
pub struct BootstrapResult {
    /// Whether .claude directory was copied
    pub claude_copied: bool,
    /// Whether CLAUDE.md was copied
    pub claude_md_copied: bool,
}

// =============================================================================
// Deployment Manifest Functions
// =============================================================================

/// Read all deployments from the manifest file
pub fn read_deployment_manifest() -> Result<Vec<DeploymentInfo>, String> {
    let path = get_deployments_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = File::open(&path)
        .map_err(|e| format!("Failed to open deployment manifest: {}", e))?;
    let reader = BufReader::new(file);

    let mut deployments = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read manifest line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }
        let deployment: DeploymentInfo = serde_json::from_str(&line)
            .map_err(|e| format!("Failed to parse deployment entry: {}", e))?;
        deployments.push(deployment);
    }

    Ok(deployments)
}

/// Append a deployment to the manifest file
pub fn append_deployment(deployment: &DeploymentInfo) -> Result<(), String> {
    let path = get_deployments_path()?;

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

    let json = serde_json::to_string(deployment)
        .map_err(|e| format!("Failed to serialize deployment: {}", e))?;
    writeln!(file, "{}", json)
        .map_err(|e| format!("Failed to write deployment to manifest: {}", e))?;

    Ok(())
}

/// Update the status of a deployment in the manifest
pub fn update_deployment_status(deployment_id: &str, status: DeploymentStatus) -> Result<(), String> {
    let mut deployments = read_deployment_manifest()?;

    for deployment in &mut deployments {
        if deployment.id == deployment_id {
            deployment.status = status.clone();
        }
    }

    // Rewrite the entire manifest
    let path = get_deployments_path()?;
    let file = File::create(&path)
        .map_err(|e| format!("Failed to recreate manifest: {}", e))?;
    let mut writer = std::io::BufWriter::new(file);

    for deployment in &deployments {
        let json = serde_json::to_string(deployment)
            .map_err(|e| format!("Failed to serialize deployment: {}", e))?;
        writeln!(writer, "{}", json)
            .map_err(|e| format!("Failed to write deployment: {}", e))?;
    }

    Ok(())
}

/// Find an active deployment by session name
/// Uses a contains match on agent_id since session names include the agent
pub fn find_deployment_by_session(session_name: &str) -> Result<Option<DeploymentInfo>, String> {
    let deployments = read_deployment_manifest()?;
    Ok(deployments.into_iter().find(|d| {
        d.status == DeploymentStatus::Active &&
        session_name.contains(&d.agent_id)
    }))
}

/// Find an active deployment by deployment ID
pub fn find_deployment_by_id(deployment_id: &str) -> Result<Option<DeploymentInfo>, String> {
    let deployments = read_deployment_manifest()?;
    Ok(deployments.into_iter().find(|d| d.id == deployment_id))
}

// =============================================================================
// Target Repository Validation
// =============================================================================

/// Validate that a target repository meets requirements for deployment
/// - Must exist and be a directory
/// - Must be a git repository (or will be initialized)
/// - Must not have uncommitted changes
pub fn validate_and_prepare_target(path: &Path) -> Result<(), String> {
    // Check if directory exists
    if !path.exists() {
        return Err(format!("Target path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Target path is not a directory: {}", path.display()));
    }

    // Check if git repo, initialize if not
    let git_dir = path.join(".git");
    if !git_dir.exists() {
        let output = Command::new("git")
            .args(["init"])
            .current_dir(path)
            .output()
            .map_err(|e| format!("Failed to run git init: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to initialize git repository: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        // Make initial commit if repo is empty
        let status_output = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(path)
            .output()
            .map_err(|e| format!("Failed to check git status: {}", e))?;

        if status_output.stdout.is_empty() {
            // Empty repo, create initial commit
            let _ = Command::new("git")
                .args(["commit", "--allow-empty", "-m", "Initial commit"])
                .current_dir(path)
                .output();
        }
    }

    // Check for uncommitted changes
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(path)
        .output()
        .map_err(|e| format!("Failed to check git status: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to check git status: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    if !output.stdout.is_empty() {
        return Err(
            "Target repository has uncommitted changes. Commit or stash them first.".to_string()
        );
    }

    Ok(())
}

// =============================================================================
// .claude Configuration Bootstrap
// =============================================================================

/// Bootstrap .claude configuration into a worktree
/// Only copies if the target doesn't already have its own .claude
pub fn bootstrap_worktree_config(
    worktree_path: &Path,
    source_agent_dir: &Path,
) -> Result<BootstrapResult, String> {
    let dest_claude = worktree_path.join(".claude");
    let dest_md = worktree_path.join("CLAUDE.md");

    let mut result = BootstrapResult::default();

    // Don't overwrite project's existing .claude config
    if !dest_claude.exists() {
        let src = source_agent_dir.join(".claude");
        if src.exists() {
            copy_dir_recursive(&src, &dest_claude)?;
            result.claude_copied = true;
        }
    }

    // Don't overwrite project's existing CLAUDE.md
    if !dest_md.exists() {
        let src = source_agent_dir.join("CLAUDE.md");
        if src.exists() {
            fs::copy(&src, &dest_md)
                .map_err(|e| format!("Failed to copy CLAUDE.md: {}", e))?;
            result.claude_md_copied = true;
        }
    }

    Ok(result)
}

/// Recursively copy a directory
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory {}: {}", dst.display(), e))?;

    for entry in fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory {}: {}", src.display(), e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {}: {}", src_path.display(), e))?;
        }
    }

    Ok(())
}

/// Cleanup .claude traces from a worktree before merge
/// Only removes what was copied by Nolan, not existing project config
pub fn cleanup_worktree_config(
    worktree_path: &Path,
    deployment: &DeploymentInfo,
) -> Result<(), String> {
    // Only remove what we created
    if deployment.claude_copied {
        let config = worktree_path.join(".claude");
        if config.exists() {
            fs::remove_dir_all(&config)
                .map_err(|e| format!("Failed to remove .claude: {}", e))?;
        }
    }

    if deployment.claude_md_copied {
        let claude_md = worktree_path.join("CLAUDE.md");
        if claude_md.exists() {
            fs::remove_file(&claude_md)
                .map_err(|e| format!("Failed to remove CLAUDE.md: {}", e))?;
        }
    }

    Ok(())
}

// =============================================================================
// Main Deployment Functions
// =============================================================================

/// Deploy an agent to an external repository
///
/// Creates a worktree in the target repo and bootstraps the agent's .claude config.
/// Returns deployment info that can be used for cleanup later.
pub fn deploy_to_external_repo(
    repo_path: &Path,
    agent: &str,
    team: Option<&str>,
    source_agent_dir: &Path,
) -> Result<DeploymentInfo, String> {
    // 1. Validate target repo
    validate_and_prepare_target(repo_path)?;

    // 2. Generate deployment ID and branch name
    let deployment_id = format!("dep_{}", &Uuid::new_v4().to_string()[..8]);
    let branch_name = format!("worktree/{}/{}", agent, &deployment_id[4..]);

    // 3. Create worktree directory path
    let worktree_path = repo_path.join(".nolan-worktrees").join(&deployment_id);

    // 4. Create the worktree
    worktree::create_worktree(repo_path, &worktree_path, &branch_name, None)?;

    // 5. Bootstrap .claude config
    let bootstrap_result = bootstrap_worktree_config(&worktree_path, source_agent_dir)?;

    // 6. Create deployment info
    let deployment = DeploymentInfo {
        id: deployment_id,
        agent_id: agent.to_string(),
        team: team.map(|t| t.to_string()),
        target_repo: repo_path.to_path_buf(),
        worktree_path: worktree_path.clone(),
        worktree_branch: branch_name,
        claude_copied: bootstrap_result.claude_copied,
        claude_md_copied: bootstrap_result.claude_md_copied,
        deployed_at: Utc::now(),
        status: DeploymentStatus::Active,
    };

    // 7. Record in manifest
    append_deployment(&deployment)?;

    Ok(deployment)
}

/// Full cleanup after agent completion
/// Removes .claude traces, worktree, and branch
pub fn full_deployment_cleanup(deployment_id: &str) -> Result<(), String> {
    let deployment = find_deployment_by_id(deployment_id)?
        .ok_or_else(|| format!("Deployment not found: {}", deployment_id))?;

    // 1. Remove .claude traces from worktree
    if deployment.worktree_path.exists() {
        cleanup_worktree_config(&deployment.worktree_path, &deployment)?;
    }

    // 2. Remove the worktree
    if deployment.worktree_path.exists() {
        worktree::remove_worktree(
            &deployment.target_repo,
            &deployment.worktree_path,
            true, // force
        )?;
    }

    // 3. Delete the branch (ignore errors if already deleted)
    let _ = worktree::delete_branch(
        &deployment.target_repo,
        &deployment.worktree_branch,
        true, // force
    );

    // 4. Prune worktree metadata
    let _ = worktree::prune_worktrees(&deployment.target_repo);

    // 5. Update manifest status
    update_deployment_status(deployment_id, DeploymentStatus::Completed)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deployment_status_serialization() {
        let status = DeploymentStatus::Active;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"active\"");

        let parsed: DeploymentStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, DeploymentStatus::Active);
    }

    #[test]
    fn test_bootstrap_result_default() {
        let result = BootstrapResult::default();
        assert!(!result.claude_copied);
        assert!(!result.claude_md_copied);
    }
}
