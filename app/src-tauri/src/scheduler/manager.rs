use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_cron_scheduler::{Job, JobScheduler};

use super::types::*;
use crate::utils::paths;

/// Running processes tracker (in-memory)
pub type RunningProcesses = Arc<RwLock<HashMap<String, RunningProcess>>>;

pub struct SchedulerManager {
    scheduler: JobScheduler,
    scheduler_root: PathBuf, // Agent definitions (source code) in NOLAN_ROOT/scheduler
    scheduler_data_root: PathBuf, // Run logs (user data) in NOLAN_DATA_ROOT/data
    _nolan_root: PathBuf, // Source code root (kept for future use)
    nolan_data_root: PathBuf, // User data root (for state storage)
    running: RunningProcesses,
    state: Arc<RwLock<SchedulerState>>,
    /// Maps schedule ID to job UUID for removal
    schedule_jobs: Arc<RwLock<HashMap<String, uuid::Uuid>>>,
}

impl SchedulerManager {
    pub async fn new() -> Result<Self, String> {
        let nolan_root = paths::get_nolan_root()?;
        let nolan_data_root = paths::get_nolan_data_root()?;
        let scheduler_root = nolan_root.join("scheduler"); // Agent definitions (source)
        let scheduler_data_root = paths::get_data_dir()?; // Run logs (data)

        // Ensure directories exist
        let agents_dir = paths::get_agents_config_dir()?;
        std::fs::create_dir_all(&agents_dir)
            .map_err(|e| format!("Failed to create agents config directory: {}", e))?;
        std::fs::create_dir_all(paths::get_scheduler_runs_dir()?)
            .map_err(|e| format!("Failed to create data/runs: {}", e))?;

        // Create consolidated state directory for scheduler (uses data root via get_state_dir)
        let scheduler_state_dir = paths::get_scheduler_state_dir()?;
        std::fs::create_dir_all(&scheduler_state_dir)
            .map_err(|e| format!("Failed to create .state/scheduler: {}", e))?;

        let scheduler = JobScheduler::new()
            .await
            .map_err(|e| format!("Failed to create scheduler: {}", e))?;

        // Load persistent state from consolidated location
        let state = Self::load_state(&nolan_data_root)?;

        Ok(Self {
            scheduler,
            scheduler_root,
            scheduler_data_root,
            _nolan_root: nolan_root,
            nolan_data_root,
            running: Arc::new(RwLock::new(HashMap::new())),
            state: Arc::new(RwLock::new(state)),
            schedule_jobs: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Get the scheduler root path (source code - agent definitions)
    pub fn scheduler_root(&self) -> &PathBuf {
        &self.scheduler_root
    }

    /// Get the scheduler data root path (user data - run logs)
    pub fn scheduler_data_root(&self) -> &PathBuf {
        &self.scheduler_data_root
    }

    /// Get running processes tracker
    pub fn running_processes(&self) -> RunningProcesses {
        self.running.clone()
    }

    /// Get persistent state
    pub fn state(&self) -> Arc<RwLock<SchedulerState>> {
        self.state.clone()
    }

    // ========================
    // Persistent State Management
    // ========================

    fn state_file_path(_data_root: &PathBuf) -> PathBuf {
        // Use centralized paths module
        paths::get_scheduler_state_dir()
            .map(|p| p.join("state.json"))
            .unwrap_or_else(|_| PathBuf::from(".state/scheduler/state.json"))
    }

    fn load_state(data_root: &PathBuf) -> Result<SchedulerState, String> {
        let path = Self::state_file_path(data_root);
        if path.exists() {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read scheduler state: {}", e))?;
            serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse scheduler state: {}", e))
        } else {
            Ok(SchedulerState::default())
        }
    }

    pub async fn save_state(&self) -> Result<(), String> {
        let path = Self::state_file_path(&self.nolan_data_root);
        let mut state = self.state.write().await;
        state.last_updated = Some(Utc::now().to_rfc3339());

        let json = serde_json::to_string_pretty(&*state)
            .map_err(|e| format!("Failed to serialize scheduler state: {}", e))?;
        std::fs::write(&path, json)
            .map_err(|e| format!("Failed to write scheduler state: {}", e))?;
        Ok(())
    }

    pub async fn update_agent_state(
        &self,
        agent_name: &str,
        status: Option<ScheduledRunStatus>,
        next_scheduled: Option<String>,
    ) -> Result<(), String> {
        let mut state = self.state.write().await;
        let agent_state = state.agents.entry(agent_name.to_string()).or_default();

        if let Some(s) = status {
            agent_state.last_run = Some(Utc::now().to_rfc3339());
            agent_state.total_runs += 1;

            match s {
                ScheduledRunStatus::Success => {
                    agent_state.total_successes += 1;
                    agent_state.consecutive_failures = 0;
                }
                ScheduledRunStatus::Failed | ScheduledRunStatus::Timeout => {
                    agent_state.total_failures += 1;
                    agent_state.consecutive_failures += 1;
                }
                _ => {}
            }
            agent_state.last_status = Some(s);
        }

        if let Some(next) = next_scheduled {
            agent_state.next_scheduled = Some(next);
        }

        drop(state);
        self.save_state().await
    }

    pub async fn get_agent_state(&self, agent_name: &str) -> Option<AgentState> {
        let state = self.state.read().await;
        state.agents.get(agent_name).cloned()
    }

    // ========================
    // Running Process Management
    // ========================

    pub async fn register_running(
        &self,
        run_id: &str,
        agent_name: &str,
        pid: Option<u32>,
        log_file: PathBuf,
        json_file: PathBuf,
    ) {
        self.register_running_with_session(
            run_id, agent_name, pid, log_file, json_file, None, None, None,
        )
        .await;
    }

    /// Register a running process with tmux session info for recovery
    pub async fn register_running_with_session(
        &self,
        run_id: &str,
        agent_name: &str,
        pid: Option<u32>,
        log_file: PathBuf,
        json_file: PathBuf,
        session_name: Option<String>,
        run_dir: Option<PathBuf>,
        cancellation_token: Option<CancellationToken>,
    ) {
        self.register_running_with_worktree(
            run_id,
            agent_name,
            pid,
            log_file,
            json_file,
            session_name,
            run_dir,
            cancellation_token,
            None,
            None,
            None,
            None,
        )
        .await;
    }

    /// Register a running process with worktree isolation info
    pub async fn register_running_with_worktree(
        &self,
        run_id: &str,
        agent_name: &str,
        pid: Option<u32>,
        log_file: PathBuf,
        json_file: PathBuf,
        session_name: Option<String>,
        run_dir: Option<PathBuf>,
        cancellation_token: Option<CancellationToken>,
        worktree_path: Option<PathBuf>,
        worktree_branch: Option<String>,
        base_commit: Option<String>,
        claude_session_id: Option<String>,
    ) {
        let mut running = self.running.write().await;
        running.insert(
            agent_name.to_string(),
            RunningProcess {
                run_id: run_id.to_string(),
                agent_name: agent_name.to_string(),
                started_at: Utc::now(),
                pid,
                log_file,
                json_file,
                session_name,
                run_dir,
                cancellation_token,
                claude_session_id,
                worktree_path,
                worktree_branch,
                base_commit,
            },
        );
    }

    pub async fn unregister_running(&self, agent_name: &str) {
        let mut running = self.running.write().await;
        running.remove(agent_name);
    }

    pub async fn is_running(&self, agent_name: &str) -> bool {
        let running = self.running.read().await;
        running.contains_key(agent_name)
    }

    pub async fn get_running_process(&self, agent_name: &str) -> Option<RunningProcess> {
        let running = self.running.read().await;
        running.get(agent_name).cloned()
    }

    pub async fn list_running(&self) -> Vec<RunningProcess> {
        let running = self.running.read().await;
        running.values().cloned().collect()
    }

    // ========================
    // Orphan Detection & Recovery
    // ========================

    /// Find orphaned scheduled sessions (runs that were interrupted by app restart)
    ///
    /// Scans JSON log files for runs with completed_at: null and session_name set,
    /// then checks if the tmux session is still alive.
    pub fn find_orphaned_scheduled_sessions(&self) -> Result<Vec<OrphanedScheduledSession>, String> {
        let runs_dir = paths::get_scheduler_runs_dir()?;
        let mut orphaned = Vec::new();

        // Scan date directories (e.g., runs/2026-01-10/)
        if let Ok(date_entries) = std::fs::read_dir(&runs_dir) {
            for date_entry in date_entries.flatten() {
                if !date_entry.path().is_dir() {
                    continue;
                }

                // Scan JSON files in each date directory
                if let Ok(run_entries) = std::fs::read_dir(date_entry.path()) {
                    for run_entry in run_entries.flatten() {
                        let path = run_entry.path();
                        if path.extension().map_or(false, |e| e == "json") {
                            // Try to parse the run log
                            if let Ok(content) = std::fs::read_to_string(&path) {
                                if let Ok(run_log) = serde_json::from_str::<ScheduledRunLog>(&content) {
                                    // Check if it's a running session (completed_at is None)
                                    if run_log.completed_at.is_none() {
                                        if let Some(ref session_name) = run_log.session_name {
                                            // Check if tmux session exists
                                            let session_alive =
                                                crate::tmux::session::session_exists(session_name)
                                                    .unwrap_or(false);

                                            orphaned.push(OrphanedScheduledSession {
                                                run_log,
                                                json_file: path,
                                                session_alive,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(orphaned)
    }

    /// Recover orphaned scheduled sessions
    ///
    /// For sessions still alive: re-register in running processes and start completion monitor
    /// For dead sessions: mark as interrupted in the JSON log
    pub async fn recover_orphaned_scheduled_sessions(&self) -> Result<ScheduledRecoveryResult, String> {
        let orphaned = self.find_orphaned_scheduled_sessions()?;
        let mut result = ScheduledRecoveryResult::default();

        for session in orphaned {
            if session.session_alive {
                // Session still running - re-register and monitor
                match self.reattach_scheduled_session(&session).await {
                    Ok(_) => {
                        result.recovered.push(format!(
                            "Reattached to running scheduled agent: {} (session: {})",
                            session.run_log.agent_name,
                            session.run_log.session_name.as_deref().unwrap_or("unknown")
                        ));
                    }
                    Err(e) => {
                        result.errors.push(format!(
                            "Failed to reattach {}: {}",
                            session.run_log.agent_name, e
                        ));
                    }
                }
            } else {
                // Session ended - determine if completed or was interrupted
                match self.finalize_interrupted_run(&session).await {
                    Ok(status) => {
                        let status_str = match status {
                            ScheduledRunStatus::Success => "Recovered as success",
                            ScheduledRunStatus::Failed => "Recovered as failed",
                            ScheduledRunStatus::Interrupted => "Marked as interrupted",
                            _ => "Finalized",
                        };
                        result.interrupted.push(format!(
                            "{}: {} (run_id: {})",
                            status_str, session.run_log.agent_name, session.run_log.run_id
                        ));
                    }
                    Err(e) => {
                        result.errors.push(format!(
                            "Failed to finalize {}: {}",
                            session.run_log.agent_name, e
                        ));
                    }
                }
            }
        }

        Ok(result)
    }

    /// Reattach to a still-running scheduled session
    async fn reattach_scheduled_session(&self, session: &OrphanedScheduledSession) -> Result<(), String> {
        let run_log = &session.run_log;

        // Create a new cancellation token for this recovered session
        let cancel_token = Arc::new(RwLock::new(false));

        // Re-register in running processes
        self.register_running_with_session(
            &run_log.run_id,
            &run_log.agent_name,
            None, // PID not available
            PathBuf::from(&run_log.output_file),
            session.json_file.clone(),
            run_log.session_name.clone(),
            run_log.run_dir.as_ref().map(PathBuf::from),
            Some(cancel_token.clone()),
        )
        .await;

        // Spawn a task to monitor for completion
        let session_name = run_log.session_name.clone().unwrap_or_default();
        let run_dir = run_log.run_dir.as_ref().map(PathBuf::from);
        let json_file = session.json_file.clone();
        let agent_name = run_log.agent_name.clone();
        let run_id = run_log.run_id.clone();
        let started_at = run_log.started_at.clone();
        let output_file = run_log.output_file.clone();
        let attempt = run_log.attempt;
        let trigger = run_log.trigger.clone();
        let worktree_path = run_log.worktree_path.clone();
        let worktree_branch = run_log.worktree_branch.clone();
        let base_commit = run_log.base_commit.clone();
        let label = run_log.label.clone();
        let parent_run_id = run_log.parent_run_id.clone();
        let running = Arc::clone(&self.running);

        tokio::spawn(async move {
            // Monitor for completion
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                // Check cancellation token first (for user-initiated cancel)
                let was_cancelled = {
                    let cancelled = cancel_token.read().await;
                    *cancelled
                };

                // Check if session still exists
                let session_exists =
                    crate::tmux::session::session_exists(&session_name).unwrap_or(false);

                if was_cancelled || !session_exists {
                    // Session ended or was cancelled - finalize the run log
                    let completed_at = Utc::now();

                    let (status, exit_code, error) = if was_cancelled {
                        // User cancelled - don't retry
                        (
                            ScheduledRunStatus::Cancelled,
                            None,
                            Some("Cancelled by user".to_string()),
                        )
                    } else {
                        // Natural completion - check exit code
                        let exit_code = run_dir
                            .as_ref()
                            .and_then(|d| std::fs::read_to_string(d.join("exit_code")).ok())
                            .and_then(|s| s.trim().parse::<i32>().ok());

                        if exit_code == Some(0) {
                            (ScheduledRunStatus::Success, exit_code, None)
                        } else {
                            (
                                ScheduledRunStatus::Failed,
                                exit_code,
                                Some("Non-zero exit code".to_string()),
                            )
                        }
                    };

                    // Parse started_at to calculate duration
                    let duration = DateTime::parse_from_rfc3339(&started_at)
                        .map(|dt| (completed_at - dt.with_timezone(&Utc)).num_seconds() as u32)
                        .unwrap_or(0);

                    let final_log = ScheduledRunLog {
                        run_id: run_id.clone(),
                        agent_name: agent_name.clone(),
                        started_at: started_at.clone(),
                        completed_at: Some(completed_at.to_rfc3339()),
                        status: status.clone(),
                        duration_secs: Some(duration),
                        exit_code,
                        output_file: output_file.clone(),
                        error,
                        attempt,
                        trigger: trigger.clone(),
                        session_name: Some(session_name.clone()),
                        run_dir: run_dir.as_ref().map(|p| p.to_string_lossy().to_string()),
                        claude_session_id: None, // Session ID not available during recovery
                        total_cost_usd: None,    // Cost not available during recovery
                        worktree_path: worktree_path.clone(),
                        worktree_branch: worktree_branch.clone(),
                        base_commit: base_commit.clone(),
                        analyzer_verdict: None,
                        pipeline_id: None,
                        label: label.clone(),
                        parent_run_id: parent_run_id.clone(),
                    };

                    // Write final log
                    if let Ok(json) = serde_json::to_string_pretty(&final_log) {
                        let _ = std::fs::write(&json_file, json);
                    }

                    // Unregister from running
                    {
                        let mut running_guard = running.write().await;
                        running_guard.remove(&agent_name);
                    }

                    // Cleanup run directory on success
                    if status == ScheduledRunStatus::Success {
                        if let Some(ref dir) = run_dir {
                            let _ = std::fs::remove_dir_all(dir);
                        }
                    }

                    break;
                }
            }
        });

        Ok(())
    }

    /// Finalize an orphaned run where the tmux session no longer exists
    ///
    /// Checks for exit_code file to determine if the job completed naturally
    /// before the app crashed, or if it was truly interrupted.
    /// Returns the final status so recovery can report accurately.
    async fn finalize_interrupted_run(
        &self,
        session: &OrphanedScheduledSession,
    ) -> Result<ScheduledRunStatus, String> {
        let run_log = &session.run_log;
        let completed_at = Utc::now();

        // Parse started_at to calculate duration
        let duration = DateTime::parse_from_rfc3339(&run_log.started_at)
            .map(|dt| (completed_at - dt.with_timezone(&Utc)).num_seconds() as u32)
            .unwrap_or(0);

        // Check if the job actually completed by looking for exit_code file
        // This file is written by the shell command after Claude exits
        let (status, exit_code, error) = if let Some(ref run_dir) = run_log.run_dir {
            let exit_code_path = std::path::Path::new(run_dir).join("exit_code");
            if let Ok(content) = std::fs::read_to_string(&exit_code_path) {
                let code = content.trim().parse::<i32>().ok();
                if code == Some(0) {
                    // Job completed successfully before app crashed
                    (ScheduledRunStatus::Success, code, None)
                } else {
                    // Job failed with non-zero exit code
                    (
                        ScheduledRunStatus::Failed,
                        code,
                        Some("Non-zero exit code".to_string()),
                    )
                }
            } else {
                // No exit_code file - job was truly interrupted
                (
                    ScheduledRunStatus::Interrupted,
                    None,
                    Some("Process interrupted by app restart".to_string()),
                )
            }
        } else {
            // No run_dir - can't check, assume interrupted
            (
                ScheduledRunStatus::Interrupted,
                None,
                Some("Process interrupted by app restart".to_string()),
            )
        };

        let final_log = ScheduledRunLog {
            run_id: run_log.run_id.clone(),
            agent_name: run_log.agent_name.clone(),
            started_at: run_log.started_at.clone(),
            completed_at: Some(completed_at.to_rfc3339()),
            status: status.clone(),
            duration_secs: Some(duration),
            exit_code,
            output_file: run_log.output_file.clone(),
            error,
            attempt: run_log.attempt,
            trigger: run_log.trigger.clone(),
            session_name: run_log.session_name.clone(),
            run_dir: run_log.run_dir.clone(),
            claude_session_id: run_log.claude_session_id.clone(), // Preserve original session ID
            total_cost_usd: None, // Cost not available during recovery
            worktree_path: run_log.worktree_path.clone(),
            worktree_branch: run_log.worktree_branch.clone(),
            base_commit: run_log.base_commit.clone(),
            analyzer_verdict: run_log.analyzer_verdict.clone(), // Preserve any existing verdict
            pipeline_id: run_log.pipeline_id.clone(),           // Preserve pipeline ID
            label: run_log.label.clone(),                       // Preserve original label
            parent_run_id: run_log.parent_run_id.clone(),       // Preserve parent run ID
        };

        let json = serde_json::to_string_pretty(&final_log)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        std::fs::write(&session.json_file, json).map_err(|e| format!("Failed to write: {}", e))?;

        // Cleanup run directory (for both successful and interrupted runs)
        if let Some(ref run_dir) = run_log.run_dir {
            let _ = std::fs::remove_dir_all(run_dir);
        }

        Ok(status)
    }

    // ========================
    // Group Management
    // ========================

    fn groups_file_path(&self) -> std::path::PathBuf {
        self.scheduler_root.join("groups.yaml")
    }

    /// Load all groups from disk
    pub fn load_groups(&self) -> Result<Vec<ScheduledAgentGroup>, String> {
        let path = self.groups_file_path();
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read groups.yaml: {}", e))?;
        let config: GroupsConfig = serde_yaml::from_str(&content)
            .map_err(|e| format!("Failed to parse groups.yaml: {}", e))?;

        let mut groups = config.groups;
        groups.sort_by(|a, b| a.order.cmp(&b.order));
        Ok(groups)
    }

    /// Save groups to disk
    pub fn save_groups(&self, groups: &[ScheduledAgentGroup]) -> Result<(), String> {
        let path = self.groups_file_path();
        let config = GroupsConfig {
            groups: groups.to_vec(),
        };

        let yaml = serde_yaml::to_string(&config)
            .map_err(|e| format!("Failed to serialize groups: {}", e))?;

        // Add header comment
        let content = format!(
            "# Scheduled Agent Groups Configuration\n# Groups help organize scheduled agents by category/purpose\n\n{}",
            yaml
        );

        std::fs::write(&path, content)
            .map_err(|e| format!("Failed to write groups.yaml: {}", e))?;
        Ok(())
    }

    /// Get a specific group by ID
    pub fn get_group(&self, group_id: &str) -> Result<ScheduledAgentGroup, String> {
        let groups = self.load_groups()?;
        groups
            .into_iter()
            .find(|g| g.id == group_id)
            .ok_or_else(|| format!("Group '{}' not found", group_id))
    }

    /// Create a new group
    pub fn create_group(&self, group: ScheduledAgentGroup) -> Result<(), String> {
        let mut groups = self.load_groups()?;

        // Check for duplicate ID
        if groups.iter().any(|g| g.id == group.id) {
            return Err(format!("Group '{}' already exists", group.id));
        }

        groups.push(group);
        self.save_groups(&groups)
    }

    /// Update an existing group
    pub fn update_group(&self, group: ScheduledAgentGroup) -> Result<(), String> {
        let mut groups = self.load_groups()?;

        let pos = groups
            .iter()
            .position(|g| g.id == group.id)
            .ok_or_else(|| format!("Group '{}' not found", group.id))?;

        groups[pos] = group;
        self.save_groups(&groups)
    }

    /// Delete a group
    pub fn delete_group(&self, group_id: &str) -> Result<(), String> {
        let mut groups = self.load_groups()?;
        let original_len = groups.len();
        groups.retain(|g| g.id != group_id);

        if groups.len() == original_len {
            return Err(format!("Group '{}' not found", group_id));
        }

        self.save_groups(&groups)
    }

    // ========================
    // Agent Configuration Management
    // ========================

    /// Load all agent configs from disk
    /// Scans role-based subdirectories, root agents/, and teams/*/agents/ directories
    pub async fn load_agents(&self) -> Result<Vec<ScheduledAgentConfig>, String> {
        let mut configs = Vec::new();
        let agents_dir = paths::get_agents_config_dir()?; // ~/.nolan/agents/

        // Load from role-based subdirectories first
        let role_dirs = [
            "implementers",
            "analyzers",
            "testers",
            "mergers",
            "builders",
            "scanners",
            "indexers",
            "monitors",
            "researchers",
            "planners",
            "free",
        ];

        for role_dir in role_dirs {
            let role_path = agents_dir.join(role_dir);
            if role_path.exists() && role_path.is_dir() {
                configs.extend(self.load_agents_from_dir(&role_path)?);
            }
        }

        // Also load from root for backwards compatibility (agents not yet migrated)
        configs.extend(self.load_agents_from_dir(&agents_dir)?);

        // Load from team-specific agents directories
        let teams_dir = paths::get_teams_dir()?;
        if teams_dir.exists() {
            if let Ok(team_entries) = std::fs::read_dir(&teams_dir) {
                for team_entry in team_entries.flatten() {
                    let team_path = team_entry.path();
                    if team_path.is_dir() {
                        let team_agents_dir = team_path.join("agents");
                        if team_agents_dir.exists() {
                            configs.extend(self.load_agents_from_dir(&team_agents_dir)?);
                        }
                    }
                }
            }
        }

        Ok(configs)
    }

    /// Load agents from a directory
    fn load_agents_from_dir(&self, dir: &std::path::Path) -> Result<Vec<ScheduledAgentConfig>, String> {
        let mut configs = Vec::new();

        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let config_path = entry.path().join("agent.yaml");
                    if config_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&config_path) {
                            if let Ok(config) = serde_yaml::from_str::<ScheduledAgentConfig>(&content) {
                                configs.push(config);
                            }
                        }
                    }
                }
            }
        }

        Ok(configs)
    }

    /// Get agent config by name
    /// Searches role subdirectories, root agents/, and teams/*/agents/ directories
    pub async fn get_agent(&self, name: &str) -> Result<ScheduledAgentConfig, String> {
        let agents_dir = paths::get_agents_config_dir()?;

        // Check root agents directory first (for backwards compatibility)
        let config_path = agents_dir.join(name).join("agent.yaml");
        if config_path.exists() {
            let content = std::fs::read_to_string(&config_path)
                .map_err(|e| format!("Failed to read agent '{}': {}", name, e))?;
            return serde_yaml::from_str(&content)
                .map_err(|e| format!("Invalid agent config: {}", e));
        }

        // Search role-based subdirectories
        let role_dirs = [
            "implementers",
            "analyzers",
            "testers",
            "mergers",
            "builders",
            "scanners",
            "indexers",
            "monitors",
            "researchers",
            "planners",
            "free",
        ];

        for role_dir in role_dirs {
            let role_config_path = agents_dir.join(role_dir).join(name).join("agent.yaml");
            if role_config_path.exists() {
                let content = std::fs::read_to_string(&role_config_path)
                    .map_err(|e| format!("Failed to read agent '{}': {}", name, e))?;
                return serde_yaml::from_str(&content)
                    .map_err(|e| format!("Invalid agent config: {}", e));
            }
        }

        // Search team directories
        let teams_dir = paths::get_teams_dir()?;
        if teams_dir.exists() {
            if let Ok(team_entries) = std::fs::read_dir(&teams_dir) {
                for team_entry in team_entries.flatten() {
                    let team_path = team_entry.path();
                    if team_path.is_dir() {
                        let team_config_path =
                            team_path.join("agents").join(name).join("agent.yaml");
                        if team_config_path.exists() {
                            let content = std::fs::read_to_string(&team_config_path)
                                .map_err(|e| format!("Failed to read agent '{}': {}", name, e))?;
                            return serde_yaml::from_str(&content)
                                .map_err(|e| format!("Invalid agent config: {}", e));
                        }
                    }
                }
            }
        }

        Err(format!("Agent '{}' not found", name))
    }

    /// Find agents by role
    /// Returns all agents that have the specified role (explicit or inferred)
    pub async fn find_agents_by_role(
        &self,
        role: AgentRole,
    ) -> Result<Vec<ScheduledAgentConfig>, String> {
        let agents = self.load_agents().await?;
        Ok(agents
            .into_iter()
            .filter(|agent| agent.effective_role() == role)
            .collect())
    }

    /// Find first agent matching role, preferring those with specific pipeline stage config
    /// Used by pipeline manager to find the right agent for each stage
    pub async fn find_agent_for_pipeline_stage(
        &self,
        role: AgentRole,
        stage_type: PipelineStageType,
    ) -> Result<Option<ScheduledAgentConfig>, String> {
        let agents = self.load_agents().await?;

        // First try: agents with explicit pipeline_stage config matching the stage type
        let with_stage = agents.iter().find(|agent| {
            agent.effective_role() == role
                && agent
                    .effective_triggers()
                    .pipeline_stage
                    .as_ref()
                    .map(|ps| ps.stage_type == stage_type)
                    .unwrap_or(false)
        });

        if let Some(agent) = with_stage {
            return Ok(Some(agent.clone()));
        }

        // Fallback: any agent with matching role
        Ok(agents
            .into_iter()
            .find(|agent| agent.effective_role() == role))
    }

    /// Find agent for a team pipeline phase
    /// Maps phase name to role and finds appropriate agent
    pub async fn find_agent_for_team_phase(
        &self,
        phase_name: &str,
        team_name: &str,
    ) -> Result<Option<ScheduledAgentConfig>, String> {
        let role = match phase_name.to_lowercase().as_str() {
            "research" => AgentRole::Researcher,
            "planning" => AgentRole::Planner,
            "plan review" | "plan-review" | "planreview" => AgentRole::Analyzer,
            "implementation" => AgentRole::Implementer,
            "qa" | "testing" | "validation" | "audit" | "review" => AgentRole::Analyzer,
            _ => AgentRole::Free,
        };

        // Prefer team-specific agent first
        let team_agent = self.find_team_agent(team_name, role.clone()).await?;
        if team_agent.is_some() {
            return Ok(team_agent);
        }

        // Fallback to any agent with matching role
        let agents = self.find_agents_by_role(role).await?;
        Ok(agents.into_iter().next())
    }

    /// Find an agent specific to a team with the given role
    async fn find_team_agent(
        &self,
        team_name: &str,
        role: AgentRole,
    ) -> Result<Option<ScheduledAgentConfig>, String> {
        let teams_dir = paths::get_teams_dir()?;
        let team_agents_dir = teams_dir.join(team_name).join("agents");

        if !team_agents_dir.exists() {
            return Ok(None);
        }

        let agents = self.load_agents_from_dir(&team_agents_dir)?;
        Ok(agents
            .into_iter()
            .find(|agent| agent.effective_role() == role))
    }

    /// Save agent config to the agents directory
    pub async fn save_agent(&self, config: &ScheduledAgentConfig) -> Result<(), String> {
        let agents_dir = paths::get_agents_config_dir()?;
        let agent_dir = agents_dir.join(&config.name);

        std::fs::create_dir_all(&agent_dir)
            .map_err(|e| format!("Failed to create agent directory: {}", e))?;

        let config_path = agent_dir.join("agent.yaml");
        let yaml = serde_yaml::to_string(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        std::fs::write(&config_path, yaml).map_err(|e| format!("Failed to write config: {}", e))?;

        Ok(())
    }

    /// Delete agent from the agents directory
    pub async fn delete_agent(&self, name: &str) -> Result<(), String> {
        let agents_dir = paths::get_agents_config_dir()?;
        let agent_dir = agents_dir.join(name);

        if agent_dir.exists() {
            std::fs::remove_dir_all(&agent_dir)
                .map_err(|e| format!("Failed to delete agent: {}", e))?;
        }

        // Also remove from state
        let mut state = self.state.write().await;
        state.agents.remove(name);
        drop(state);
        self.save_state().await?;

        Ok(())
    }

    // ========================
    // Run History Management
    // ========================

    /// Get run history for an agent
    pub async fn get_run_history(
        &self,
        agent_name: Option<&str>,
        limit: usize,
    ) -> Result<Vec<ScheduledRunLog>, String> {
        let runs_dir = paths::get_scheduler_runs_dir()?;
        let mut logs = Vec::new();

        // Read all date directories in reverse order
        if let Ok(mut entries) =
            std::fs::read_dir(&runs_dir).map(|e| e.flatten().collect::<Vec<_>>())
        {
            entries.sort_by(|a, b| b.path().cmp(&a.path()));

            for entry in entries {
                if !entry.path().is_dir() {
                    continue;
                }

                if let Ok(mut files) =
                    std::fs::read_dir(entry.path()).map(|e| e.flatten().collect::<Vec<_>>())
                {
                    files.sort_by(|a, b| b.path().cmp(&a.path()));

                    for file in files {
                        if file
                            .path()
                            .extension()
                            .map(|e| e == "json")
                            .unwrap_or(false)
                        {
                            if let Ok(content) = std::fs::read_to_string(file.path()) {
                                if let Ok(mut log) = serde_json::from_str::<ScheduledRunLog>(&content) {
                                    // Filter by agent if specified
                                    if let Some(name) = agent_name {
                                        if log.agent_name != name {
                                            continue;
                                        }
                                    }
                                    // Extract cost from output log if not in JSON
                                    if log.total_cost_usd.is_none() && !log.output_file.is_empty() {
                                        log.total_cost_usd =
                                            crate::scheduler::executor::extract_cost_from_log_file(
                                                &log.output_file,
                                            );
                                    }
                                    logs.push(log);
                                    if logs.len() >= limit {
                                        return Ok(logs);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(logs)
    }

    /// Calculate agent statistics from run history
    pub async fn calculate_agent_stats(&self, agent_name: &str, limit: usize) -> AgentStats {
        let history = self
            .get_run_history(Some(agent_name), limit)
            .await
            .unwrap_or_default();

        if history.is_empty() {
            return AgentStats::default();
        }

        let total_runs = history.len() as u32;
        let success_count = history
            .iter()
            .filter(|r| r.status == ScheduledRunStatus::Success)
            .count() as u32;
        let failure_count = total_runs - success_count;

        let durations: Vec<f32> = history
            .iter()
            .filter_map(|r| r.duration_secs.map(|d| d as f32))
            .collect();

        let avg_duration_secs = if durations.is_empty() {
            None
        } else {
            Some(durations.iter().sum::<f32>() / durations.len() as f32)
        };

        // Calculate cost statistics - try JSON field first, then extract from output log
        let costs: Vec<f32> = history
            .iter()
            .filter_map(|r| {
                // First try the JSON field
                if let Some(cost) = r.total_cost_usd {
                    return Some(cost);
                }
                // Fall back to extracting from output log file
                if !r.output_file.is_empty() {
                    return crate::scheduler::executor::extract_cost_from_log_file(&r.output_file);
                }
                None
            })
            .collect();

        let (total_cost_usd, avg_cost_usd) = if costs.is_empty() {
            (None, None)
        } else {
            let total = costs.iter().sum::<f32>();
            (Some(total), Some(total / costs.len() as f32))
        };

        AgentStats {
            total_runs,
            success_count,
            failure_count,
            success_rate: if total_runs > 0 {
                success_count as f32 / total_runs as f32
            } else {
                0.0
            },
            avg_duration_secs,
            total_cost_usd,
            avg_cost_usd,
        }
    }

    /// Determine agent health based on recent runs
    pub async fn calculate_agent_health(&self, agent_name: &str) -> AgentHealth {
        let state = self.get_agent_state(agent_name).await;

        match state {
            None => AgentHealth {
                status: HealthStatus::Unknown,
                message: Some("No runs recorded".to_string()),
            },
            Some(s) => {
                if s.consecutive_failures >= 3 {
                    AgentHealth {
                        status: HealthStatus::Critical,
                        message: Some(format!("{} consecutive failures", s.consecutive_failures)),
                    }
                } else if s.consecutive_failures >= 1 {
                    AgentHealth {
                        status: HealthStatus::Warning,
                        message: Some(format!("{} recent failure(s)", s.consecutive_failures)),
                    }
                } else {
                    AgentHealth {
                        status: HealthStatus::Healthy,
                        message: None,
                    }
                }
            }
        }
    }

    // ========================
    // Scheduler Control
    // ========================

    /// Start the scheduler
    pub async fn start(&self) -> Result<(), String> {
        self.scheduler
            .start()
            .await
            .map_err(|e| format!("Failed to start scheduler: {}", e))
    }

    /// Schedule all enabled schedules from schedules.yaml
    /// This replaces the old agent-embedded scheduling
    pub async fn schedule_all_agents(&self) -> Result<(), String> {
        // Load schedules from schedules.yaml
        let schedules = self.load_schedules()?;

        for schedule in schedules {
            if schedule.enabled {
                if let Err(e) = self.schedule_from_config(&schedule).await {
                    eprintln!("[Scheduler] Failed to schedule '{}': {}", schedule.name, e);
                } else {
                    println!(
                        "[Scheduler] Scheduled '{}' ({}) with cron: {}",
                        schedule.name, schedule.agent_name, schedule.cron
                    );
                }
            }
        }

        Ok(())
    }

    /// Load schedules from schedules.yaml
    fn load_schedules(&self) -> Result<Vec<ScheduleConfig>, String> {
        let path = paths::get_schedules_path()?;
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read schedules: {}", e))?;
        let file: SchedulesFile = serde_yaml::from_str(&content)
            .map_err(|e| format!("Failed to parse schedules: {}", e))?;
        Ok(file.schedules)
    }

    /// Schedule a single schedule entry
    pub async fn schedule_from_config(&self, schedule: &ScheduleConfig) -> Result<(), String> {
        // Convert 5-field cron to 6-field (add seconds)
        let cron_expr = if schedule.cron.split_whitespace().count() == 5 {
            format!("0 {}", schedule.cron)
        } else {
            schedule.cron.clone()
        };

        let schedule_id = schedule.id.clone();
        let agent_name = schedule.agent_name.clone();
        let schedule_name = schedule.name.clone();
        let running = self.running.clone();

        let job = Job::new_async(cron_expr.as_str(), move |_uuid, _lock| {
            let agent_name = agent_name.clone();
            let schedule_name = schedule_name.clone();
            let running = running.clone();

            Box::pin(async move {
                println!("[Scheduler] Schedule '{}' triggering agent: {}", schedule_name, agent_name);

                // Check if agent is already running
                {
                    let running_guard = running.read().await;
                    if running_guard.contains_key(&agent_name) {
                        println!("[Scheduler] Skipping {} - already running", agent_name);
                        return;
                    }
                }

                // Execute the agent
                tokio::spawn(async move {
                    if let Err(e) =
                        crate::scheduler::commands::trigger_scheduled_agent_scheduled(agent_name.clone())
                            .await
                    {
                        eprintln!("[Scheduler] Scheduled run failed for {}: {}", agent_name, e);
                    }
                });
            })
        })
        .map_err(|e| format!("Failed to create job: {}", e))?;

        let job_id = job.guid();
        self.scheduler
            .add(job)
            .await
            .map_err(|e| format!("Failed to add job to scheduler: {}", e))?;

        // Store the job ID for later removal
        self.schedule_jobs.write().await.insert(schedule_id, job_id);

        Ok(())
    }

    /// Remove a schedule from the scheduler
    pub async fn unschedule(&self, schedule_id: &str) -> Result<(), String> {
        let mut jobs = self.schedule_jobs.write().await;
        if let Some(job_id) = jobs.remove(schedule_id) {
            self.scheduler
                .remove(&job_id)
                .await
                .map_err(|e| format!("Failed to remove job: {}", e))?;
        }
        Ok(())
    }

    /// Schedule a single scheduled agent
    /// Only works for agents with a schedule configured
    pub async fn schedule_agent(&self, config: &ScheduledAgentConfig) -> Result<(), String> {
        // Only schedule agents with a schedule
        if !config.has_schedule() {
            return Ok(()); // Silently skip non-scheduled agents
        }

        let schedule = config
            .schedule
            .as_ref()
            .ok_or_else(|| format!("Agent '{}' has no schedule", config.name))?;

        // Convert 5-field cron to 6-field (add seconds)
        let cron_expr = if schedule.cron.split_whitespace().count() == 5 {
            format!("0 {}", schedule.cron)
        } else {
            schedule.cron.clone()
        };

        let agent_name = config.name.clone();
        let scheduler_root = self.scheduler_root.clone();
        let running = self.running.clone();

        let job = Job::new_async(cron_expr.as_str(), move |_uuid, _lock| {
            let agent_name = agent_name.clone();
            let scheduler_root = scheduler_root.clone();
            let running = running.clone();

            Box::pin(async move {
                println!("[Scheduler] Triggering scheduled run for: {}", agent_name);

                // Load config fresh in case it changed
                let agents_dir = match crate::utils::paths::get_agents_config_dir() {
                    Ok(d) => d,
                    Err(e) => {
                        eprintln!("[Scheduler] Failed to get agents dir: {}", e);
                        return;
                    }
                };
                let config_path = agents_dir.join(&agent_name).join("agent.yaml");
                let config: ScheduledAgentConfig = match std::fs::read_to_string(&config_path) {
                    Ok(content) => match serde_yaml::from_str(&content) {
                        Ok(c) => c,
                        Err(e) => {
                            eprintln!("[Scheduler] Failed to parse config for {}: {}", agent_name, e);
                            return;
                        }
                    },
                    Err(e) => {
                        eprintln!("[Scheduler] Failed to read config for {}: {}", agent_name, e);
                        return;
                    }
                };

                // Check if still enabled
                if !config.enabled {
                    println!("[Scheduler] Skipping {} - agent is disabled", agent_name);
                    return;
                }

                // Check if already running
                {
                    let running_guard = running.read().await;
                    if running_guard.contains_key(&agent_name) && !config.concurrency.allow_parallel
                    {
                        println!("[Scheduler] Skipping {} - already running", agent_name);
                        return;
                    }
                }

                // Execute the agent via the executor
                // We spawn this as a separate task since we can't hold manager reference in job closure
                tokio::spawn(async move {
                    // Create a minimal execution context
                    // The actual execution uses trigger_scheduled_agent_api or similar
                    if let Err(e) =
                        crate::scheduler::commands::trigger_scheduled_agent_scheduled(agent_name.clone())
                            .await
                    {
                        eprintln!("[Scheduler] Scheduled run failed for {}: {}", agent_name, e);
                    }
                });
            })
        })
        .map_err(|e| format!("Failed to create job: {}", e))?;

        self.scheduler
            .add(job)
            .await
            .map_err(|e| format!("Failed to add job to scheduler: {}", e))?;

        Ok(())
    }

    /// Stop the scheduler
    pub async fn shutdown(&mut self) -> Result<(), String> {
        // Save state before shutdown
        self.save_state().await?;

        self.scheduler
            .shutdown()
            .await
            .map_err(|e| format!("Failed to shutdown scheduler: {}", e))
    }

    // ========================
    // Missed Run Detection
    // ========================

    /// Check for missed runs based on catch-up policy
    pub async fn check_missed_runs(&self) -> Result<Vec<(String, CatchUpPolicy)>, String> {
        let agents = self.load_agents().await?;
        let mut missed = Vec::new();

        for agent in agents {
            if !agent.enabled || agent.catch_up == CatchUpPolicy::Skip {
                continue;
            }

            let state = self.get_agent_state(&agent.name).await;
            if let Some(agent_state) = state {
                if let (Some(last_run_str), Some(next_sched_str)) =
                    (&agent_state.last_run, &agent_state.next_scheduled)
                {
                    if let (Ok(last_run), Ok(next_sched)) = (
                        DateTime::parse_from_rfc3339(last_run_str),
                        DateTime::parse_from_rfc3339(next_sched_str),
                    ) {
                        let now = Utc::now();
                        // If next scheduled time has passed and it's after our last run
                        if next_sched.with_timezone(&Utc) < now
                            && next_sched.with_timezone(&Utc) > last_run.with_timezone(&Utc)
                        {
                            missed.push((agent.name.clone(), agent.catch_up.clone()));
                        }
                    }
                }
            }
        }

        Ok(missed)
    }
}
