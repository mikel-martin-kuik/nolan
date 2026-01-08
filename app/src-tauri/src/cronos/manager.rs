use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_cron_scheduler::JobScheduler;

use super::types::*;
use crate::utils::paths;

pub struct CronosManager {
    scheduler: JobScheduler,
    agents: Arc<RwLock<HashMap<String, CronAgentConfig>>>,
    cronos_root: PathBuf,
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

        Ok(Self {
            scheduler,
            agents: Arc::new(RwLock::new(HashMap::new())),
            cronos_root,
        })
    }

    /// Get the cronos root path
    pub fn cronos_root(&self) -> &PathBuf {
        &self.cronos_root
    }

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
        Ok(())
    }

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

    /// Start the scheduler
    pub async fn start(&self) -> Result<(), String> {
        self.scheduler.start().await
            .map_err(|e| format!("Failed to start scheduler: {}", e))
    }

    /// Stop the scheduler
    pub async fn shutdown(&mut self) -> Result<(), String> {
        self.scheduler.shutdown().await
            .map_err(|e| format!("Failed to shutdown scheduler: {}", e))
    }
}
