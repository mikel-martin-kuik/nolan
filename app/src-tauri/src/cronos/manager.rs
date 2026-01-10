use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_cron_scheduler::JobScheduler;
use chrono::{DateTime, Utc};

use super::types::*;
use crate::utils::paths;

/// Running processes tracker (in-memory)
pub type RunningProcesses = Arc<RwLock<HashMap<String, RunningProcess>>>;

pub struct CronosManager {
    scheduler: JobScheduler,
    cronos_root: PathBuf,
    running: RunningProcesses,
    state: Arc<RwLock<SchedulerState>>,
}

impl CronosManager {
    pub async fn new() -> Result<Self, String> {
        let nolan_root = paths::get_nolan_root()?;
        let cronos_root = nolan_root.join("cronos");

        // Ensure directories exist
        std::fs::create_dir_all(cronos_root.join("agents"))
            .map_err(|e| format!("Failed to create cronos/agents: {}", e))?;
        std::fs::create_dir_all(cronos_root.join("runs"))
            .map_err(|e| format!("Failed to create cronos/runs: {}", e))?;

        let scheduler = JobScheduler::new().await
            .map_err(|e| format!("Failed to create scheduler: {}", e))?;

        // Load persistent state
        let state = Self::load_state(&cronos_root)?;

        Ok(Self {
            scheduler,
            cronos_root,
            running: Arc::new(RwLock::new(HashMap::new())),
            state: Arc::new(RwLock::new(state)),
        })
    }

    /// Get the cronos root path
    pub fn cronos_root(&self) -> &PathBuf {
        &self.cronos_root
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

    fn state_file_path(cronos_root: &PathBuf) -> PathBuf {
        cronos_root.join("scheduler_state.json")
    }

    fn load_state(cronos_root: &PathBuf) -> Result<SchedulerState, String> {
        let path = Self::state_file_path(cronos_root);
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
        let path = Self::state_file_path(&self.cronos_root);
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
        status: Option<CronRunStatus>,
        next_scheduled: Option<String>,
    ) -> Result<(), String> {
        let mut state = self.state.write().await;
        let agent_state = state.agents.entry(agent_name.to_string()).or_default();

        if let Some(s) = status {
            agent_state.last_run = Some(Utc::now().to_rfc3339());
            agent_state.total_runs += 1;

            match s {
                CronRunStatus::Success => {
                    agent_state.total_successes += 1;
                    agent_state.consecutive_failures = 0;
                }
                CronRunStatus::Failed | CronRunStatus::Timeout => {
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
        let mut running = self.running.write().await;
        running.insert(agent_name.to_string(), RunningProcess {
            run_id: run_id.to_string(),
            agent_name: agent_name.to_string(),
            started_at: Utc::now(),
            pid,
            log_file,
            json_file,
        });
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
    // Agent Configuration Management
    // ========================

    /// Load all agent configs from disk
    pub async fn load_agents(&self) -> Result<Vec<CronAgentConfig>, String> {
        let agents_dir = self.cronos_root.join("agents");
        let mut configs = Vec::new();

        if let Ok(entries) = std::fs::read_dir(&agents_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let config_path = entry.path().join("agent.yaml");
                    if config_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&config_path) {
                            if let Ok(config) = serde_yaml::from_str::<CronAgentConfig>(&content) {
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
    pub async fn get_agent(&self, name: &str) -> Result<CronAgentConfig, String> {
        let config_path = self.cronos_root
            .join("agents")
            .join(name)
            .join("agent.yaml");

        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Agent '{}' not found: {}", name, e))?;

        serde_yaml::from_str(&content)
            .map_err(|e| format!("Invalid agent config: {}", e))
    }

    /// Save agent config
    pub async fn save_agent(&self, config: &CronAgentConfig) -> Result<(), String> {
        let agent_dir = self.cronos_root.join("agents").join(&config.name);
        std::fs::create_dir_all(&agent_dir)
            .map_err(|e| format!("Failed to create agent directory: {}", e))?;

        let config_path = agent_dir.join("agent.yaml");
        let yaml = serde_yaml::to_string(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        std::fs::write(&config_path, yaml)
            .map_err(|e| format!("Failed to write config: {}", e))?;

        Ok(())
    }

    /// Delete agent
    pub async fn delete_agent(&self, name: &str) -> Result<(), String> {
        let agent_dir = self.cronos_root.join("agents").join(name);
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
    ) -> Result<Vec<CronRunLog>, String> {
        let runs_dir = self.cronos_root.join("runs");
        let mut logs = Vec::new();

        // Read all date directories in reverse order
        if let Ok(mut entries) = std::fs::read_dir(&runs_dir)
            .map(|e| e.flatten().collect::<Vec<_>>())
        {
            entries.sort_by(|a, b| b.path().cmp(&a.path()));

            for entry in entries {
                if !entry.path().is_dir() {
                    continue;
                }

                if let Ok(mut files) = std::fs::read_dir(entry.path())
                    .map(|e| e.flatten().collect::<Vec<_>>())
                {
                    files.sort_by(|a, b| b.path().cmp(&a.path()));

                    for file in files {
                        if file.path().extension().map(|e| e == "json").unwrap_or(false) {
                            if let Ok(content) = std::fs::read_to_string(file.path()) {
                                if let Ok(log) = serde_json::from_str::<CronRunLog>(&content) {
                                    // Filter by agent if specified
                                    if let Some(name) = agent_name {
                                        if log.agent_name != name {
                                            continue;
                                        }
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
        let history = self.get_run_history(Some(agent_name), limit).await.unwrap_or_default();

        if history.is_empty() {
            return AgentStats::default();
        }

        let total_runs = history.len() as u32;
        let success_count = history.iter()
            .filter(|r| r.status == CronRunStatus::Success)
            .count() as u32;
        let failure_count = total_runs - success_count;

        let durations: Vec<f32> = history.iter()
            .filter_map(|r| r.duration_secs.map(|d| d as f32))
            .collect();

        let avg_duration_secs = if durations.is_empty() {
            None
        } else {
            Some(durations.iter().sum::<f32>() / durations.len() as f32)
        };

        AgentStats {
            total_runs,
            success_count,
            failure_count,
            success_rate: if total_runs > 0 { success_count as f32 / total_runs as f32 } else { 0.0 },
            avg_duration_secs,
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
        self.scheduler.start().await
            .map_err(|e| format!("Failed to start scheduler: {}", e))
    }

    /// Stop the scheduler
    pub async fn shutdown(&mut self) -> Result<(), String> {
        // Save state before shutdown
        self.save_state().await?;

        self.scheduler.shutdown().await
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
                        if next_sched.with_timezone(&Utc) < now &&
                           next_sched.with_timezone(&Utc) > last_run.with_timezone(&Utc)
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
