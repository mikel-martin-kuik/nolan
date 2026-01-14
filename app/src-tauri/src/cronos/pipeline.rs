//! Pipeline management for CI/CD-like agent orchestration.
//!
//! This module provides tracking, persistence, and state machine logic
//! for multi-stage agent pipelines (implementer → analyzer → qa → merger).

use std::collections::HashMap;
use std::path::PathBuf;
use std::fs;

use chrono::Utc;

use crate::cronos::types::{
    AgentRole, AnalyzerVerdict, AnalyzerVerdictType, CronRunLog, CronRunStatus, Pipeline,
    PipelineDefinition, PipelineEvent, PipelineEventType, PipelineInputs,
    PipelineNextAction, PipelineStage, PipelineStageStatus, PipelineStageType,
    PipelineStatus,
};

/// Agent names for each pipeline stage
/// Use Default::default() for backwards-compatible hardcoded names,
/// or populate from role-based lookup for dynamic agent assignment
#[derive(Clone, Debug)]
pub struct PipelineAgents {
    pub implementer: String,
    pub analyzer: String,
    pub qa: String,
    pub merger: String,
}

impl Default for PipelineAgents {
    fn default() -> Self {
        Self {
            implementer: "cron-idea-implementer".to_string(),
            analyzer: "cron-implementer-analyzer".to_string(),
            qa: "pred-qa-validation".to_string(),
            merger: "pred-merge-changes".to_string(),
        }
    }
}

impl PipelineAgents {
    /// Map PipelineStageType to AgentRole for role-based lookup
    pub fn role_for_stage(stage_type: &PipelineStageType) -> AgentRole {
        match stage_type {
            PipelineStageType::Implementer => AgentRole::Implementer,
            PipelineStageType::Analyzer => AgentRole::Analyzer,
            PipelineStageType::Qa => AgentRole::Tester,
            PipelineStageType::Merger => AgentRole::Merger,
        }
    }

    /// Get agent name for a specific stage
    pub fn agent_for_stage(&self, stage_type: &PipelineStageType) -> &str {
        match stage_type {
            PipelineStageType::Implementer => &self.implementer,
            PipelineStageType::Analyzer => &self.analyzer,
            PipelineStageType::Qa => &self.qa,
            PipelineStageType::Merger => &self.merger,
        }
    }
}

/// Manager for pipeline state persistence and operations
pub struct PipelineManager {
    pipelines_dir: PathBuf,
    definitions_dir: PathBuf,
    cronos_dir: PathBuf,
}

impl PipelineManager {
    /// Create a new PipelineManager
    pub fn new(data_root: &PathBuf) -> Self {
        let pipelines_dir = data_root.join(".state").join("pipelines");
        let definitions_dir = data_root.join("pipelines");
        let cronos_dir = data_root.join("cronos");

        // Ensure directories exist
        if !pipelines_dir.exists() {
            let _ = fs::create_dir_all(&pipelines_dir);
        }
        if !definitions_dir.exists() {
            let _ = fs::create_dir_all(&definitions_dir);
        }

        Self { pipelines_dir, definitions_dir, cronos_dir }
    }

    // =========================================================================
    // Pipeline Definition (YAML) methods
    // =========================================================================

    /// List all available pipeline definitions
    pub fn list_definitions(&self) -> Result<Vec<PipelineDefinition>, String> {
        let mut definitions = Vec::new();

        if !self.definitions_dir.exists() {
            return Ok(definitions);
        }

        let entries = fs::read_dir(&self.definitions_dir)
            .map_err(|e| format!("Failed to read definitions directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "yaml" || ext == "yml") {
                if let Ok(def) = self.load_definition_from_path(&path) {
                    definitions.push(def);
                }
            }
        }

        Ok(definitions)
    }

    /// Get a pipeline definition by name
    pub fn get_definition(&self, name: &str) -> Result<PipelineDefinition, String> {
        // Try .yaml first, then .yml
        let yaml_path = self.definitions_dir.join(format!("{}.yaml", name));
        let yml_path = self.definitions_dir.join(format!("{}.yml", name));

        if yaml_path.exists() {
            self.load_definition_from_path(&yaml_path)
        } else if yml_path.exists() {
            self.load_definition_from_path(&yml_path)
        } else {
            Err(format!("Pipeline definition not found: {}", name))
        }
    }

    /// Get the default pipeline definition (idea-to-merge)
    pub fn get_default_definition(&self) -> Result<PipelineDefinition, String> {
        self.get_definition("idea-to-merge")
    }

    fn load_definition_from_path(&self, path: &PathBuf) -> Result<PipelineDefinition, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read pipeline definition: {}", e))?;

        serde_yaml::from_str(&content)
            .map_err(|e| format!("Failed to parse pipeline YAML: {}", e))
    }

    // =========================================================================
    // Pipeline Instance methods
    // =========================================================================

    /// Create a new pipeline when an implementer agent starts
    /// Uses default agent names - prefer create_pipeline_with_agents for role-based lookup
    pub fn create_pipeline(
        &self,
        pipeline_id: &str,
        idea_id: &str,
        idea_title: &str,
        run_id: &str,
        worktree_path: Option<&str>,
        worktree_branch: Option<&str>,
        base_commit: Option<&str>,
        env_vars: HashMap<String, String>,
    ) -> Result<Pipeline, String> {
        self.create_pipeline_with_agents(
            pipeline_id,
            idea_id,
            idea_title,
            run_id,
            worktree_path,
            worktree_branch,
            base_commit,
            env_vars,
            PipelineAgents::default(),
        )
    }

    /// Create a new pipeline with specific agent names for each stage
    /// Use PipelineAgents::default() for backwards-compatible hardcoded names,
    /// or populate from role-based CronosManager lookup for dynamic assignment
    pub fn create_pipeline_with_agents(
        &self,
        pipeline_id: &str,
        idea_id: &str,
        idea_title: &str,
        run_id: &str,
        worktree_path: Option<&str>,
        worktree_branch: Option<&str>,
        base_commit: Option<&str>,
        env_vars: HashMap<String, String>,
        agents: PipelineAgents,
    ) -> Result<Pipeline, String> {
        let now = Utc::now().to_rfc3339();

        let inputs = PipelineInputs {
            idea_id: Some(idea_id.to_string()),
            idea_title: Some(idea_title.to_string()),
            env_vars,
            git_commit: base_commit.map(|s| s.to_string()),
            timestamp: now.clone(),
        };

        // Initialize all stages using provided agent names
        let stages = vec![
            PipelineStage {
                stage_type: PipelineStageType::Implementer,
                status: PipelineStageStatus::Running,
                agent_name: agents.implementer.clone(),
                run_id: Some(run_id.to_string()),
                started_at: Some(now.clone()),
                completed_at: None,
                verdict: None,
                skip_reason: None,
                attempt: 1,
            },
            PipelineStage {
                stage_type: PipelineStageType::Analyzer,
                status: PipelineStageStatus::Pending,
                agent_name: agents.analyzer.clone(),
                run_id: None,
                started_at: None,
                completed_at: None,
                verdict: None,
                skip_reason: None,
                attempt: 0,
            },
            PipelineStage {
                stage_type: PipelineStageType::Qa,
                status: PipelineStageStatus::Pending,
                agent_name: agents.qa.clone(),
                run_id: None,
                started_at: None,
                completed_at: None,
                verdict: None,
                skip_reason: None,
                attempt: 0,
            },
            PipelineStage {
                stage_type: PipelineStageType::Merger,
                status: PipelineStageStatus::Pending,
                agent_name: agents.merger.clone(),
                run_id: None,
                started_at: None,
                completed_at: None,
                verdict: None,
                skip_reason: None,
                attempt: 0,
            },
        ];

        let initial_event = PipelineEvent {
            timestamp: now.clone(),
            event_type: PipelineEventType::PipelineCreated,
            stage_type: None,
            run_id: None,
            message: format!("Pipeline created for idea: {}", idea_title),
            metadata: Some(serde_json::json!({
                "idea_id": idea_id,
                "run_id": run_id,
            })),
        };

        let pipeline = Pipeline {
            id: pipeline_id.to_string(),
            status: PipelineStatus::InProgress,
            created_at: now.clone(),
            updated_at: now,
            completed_at: None,
            idea_id: idea_id.to_string(),
            idea_title: idea_title.to_string(),
            worktree_path: worktree_path.map(|s| s.to_string()),
            worktree_branch: worktree_branch.map(|s| s.to_string()),
            base_commit: base_commit.map(|s| s.to_string()),
            stages,
            current_stage: PipelineStageType::Implementer,
            events: vec![initial_event],
            inputs,
            total_cost_usd: None,
        };

        self.save_pipeline(&pipeline)?;
        Ok(pipeline)
    }

    /// Get a pipeline by ID
    pub fn get_pipeline(&self, id: &str) -> Result<Pipeline, String> {
        let path = self.pipeline_path(id);
        if !path.exists() {
            return Err(format!("Pipeline not found: {}", id));
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read pipeline file: {}", e))?;

        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse pipeline JSON: {}", e))
    }

    /// Discover running implementer agents from cronos run logs
    fn discover_running_implementers(&self) -> Vec<CronRunLog> {
        let mut running = Vec::new();
        let runs_dir = self.cronos_dir.join("runs");

        if !runs_dir.exists() {
            return running;
        }

        // Scan today's and yesterday's run directories (implementers might span days)
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
            .format("%Y-%m-%d").to_string();

        for date_dir in [today, yesterday] {
            let dir_path = runs_dir.join(&date_dir);
            if !dir_path.exists() {
                continue;
            }

            if let Ok(entries) = fs::read_dir(&dir_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    // Only look at JSON files for implementer runs
                    if path.extension().map_or(false, |ext| ext == "json") {
                        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                        if name.starts_with("cron-idea-implementer-") {
                            if let Ok(content) = fs::read_to_string(&path) {
                                if let Ok(run_log) = serde_json::from_str::<CronRunLog>(&content) {
                                    if run_log.status == CronRunStatus::Running {
                                        running.push(run_log);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        running
    }

    /// Convert a running implementer CronRunLog to a live Pipeline
    fn run_log_to_pipeline(&self, run_log: &CronRunLog) -> Pipeline {
        // Generate a pipeline ID from the run (or use existing if set)
        let pipeline_id = run_log.pipeline_id.clone()
            .unwrap_or_else(|| format!("live-{}", run_log.run_id));

        // Extract idea info from run label or run_id
        let idea_title = run_log.label.clone()
            .unwrap_or_else(|| run_log.run_id.clone());
        let idea_id = run_log.run_id.split('-').last()
            .unwrap_or(&run_log.run_id).to_string();

        // Use default agent names for stages (implementer already known from run_log)
        let agents = PipelineAgents::default();

        Pipeline {
            id: pipeline_id,
            status: PipelineStatus::InProgress,
            idea_id: idea_id.clone(),
            idea_title: idea_title.clone(),
            worktree_path: run_log.worktree_path.clone(),
            worktree_branch: run_log.worktree_branch.clone(),
            base_commit: run_log.base_commit.clone(),
            current_stage: PipelineStageType::Implementer,
            stages: vec![
                PipelineStage {
                    stage_type: PipelineStageType::Implementer,
                    status: PipelineStageStatus::Running,
                    agent_name: run_log.agent_name.clone(),
                    run_id: Some(run_log.run_id.clone()),
                    verdict: None,
                    attempt: run_log.attempt,
                    started_at: Some(run_log.started_at.clone()),
                    completed_at: None,
                    skip_reason: None,
                },
                PipelineStage {
                    stage_type: PipelineStageType::Analyzer,
                    status: PipelineStageStatus::Pending,
                    agent_name: agents.analyzer.clone(),
                    run_id: None,
                    verdict: None,
                    attempt: 0,
                    started_at: None,
                    completed_at: None,
                    skip_reason: None,
                },
                PipelineStage {
                    stage_type: PipelineStageType::Qa,
                    status: PipelineStageStatus::Pending,
                    agent_name: agents.qa.clone(),
                    run_id: None,
                    verdict: None,
                    attempt: 0,
                    started_at: None,
                    completed_at: None,
                    skip_reason: None,
                },
                PipelineStage {
                    stage_type: PipelineStageType::Merger,
                    status: PipelineStageStatus::Pending,
                    agent_name: agents.merger.clone(),
                    run_id: None,
                    verdict: None,
                    attempt: 0,
                    started_at: None,
                    completed_at: None,
                    skip_reason: None,
                },
            ],
            events: vec![
                PipelineEvent {
                    timestamp: run_log.started_at.clone(),
                    event_type: PipelineEventType::StageStarted,
                    stage_type: Some(PipelineStageType::Implementer),
                    run_id: Some(run_log.run_id.clone()),
                    message: "Implementer started".to_string(),
                    metadata: None,
                },
            ],
            inputs: PipelineInputs {
                idea_id: Some(idea_id),
                idea_title: Some(idea_title),
                env_vars: HashMap::new(),
                git_commit: run_log.base_commit.clone(),
                timestamp: run_log.started_at.clone(),
            },
            created_at: run_log.started_at.clone(),
            updated_at: run_log.started_at.clone(),
            completed_at: None,
            total_cost_usd: run_log.total_cost_usd,
        }
    }

    /// List all pipelines, optionally filtered by status
    /// Includes both persisted pipelines and "live" pipelines from running implementers
    pub fn list_pipelines(&self, status_filter: Option<PipelineStatus>) -> Result<Vec<Pipeline>, String> {
        let mut pipelines = Vec::new();
        let mut seen_run_ids = std::collections::HashSet::new();

        // First, get formal pipelines from files
        if self.pipelines_dir.exists() {
            let entries = fs::read_dir(&self.pipelines_dir)
                .map_err(|e| format!("Failed to read pipelines directory: {}", e))?;

            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(pipeline) = serde_json::from_str::<Pipeline>(&content) {
                            // Track run_ids to avoid duplicates from live discovery
                            for stage in &pipeline.stages {
                                if let Some(run_id) = &stage.run_id {
                                    seen_run_ids.insert(run_id.clone());
                                }
                            }
                            if status_filter.is_none() || status_filter.as_ref() == Some(&pipeline.status) {
                                pipelines.push(pipeline);
                            }
                        }
                    }
                }
            }
        }

        // Then, discover running implementers that don't have formal pipelines yet
        let running_implementers = self.discover_running_implementers();
        for run_log in running_implementers {
            // Skip if we already have a pipeline for this run
            if seen_run_ids.contains(&run_log.run_id) {
                continue;
            }

            let live_pipeline = self.run_log_to_pipeline(&run_log);
            if status_filter.is_none() || status_filter.as_ref() == Some(&live_pipeline.status) {
                pipelines.push(live_pipeline);
            }
        }

        // Sort by created_at descending (newest first)
        pipelines.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(pipelines)
    }

    /// Find a pipeline by any run_id (implementer, analyzer, qa, or merger)
    pub fn find_pipeline_by_run_id(&self, run_id: &str) -> Result<Option<Pipeline>, String> {
        let pipelines = self.list_pipelines(None)?;

        for pipeline in pipelines {
            for stage in &pipeline.stages {
                if stage.run_id.as_deref() == Some(run_id) {
                    return Ok(Some(pipeline));
                }
            }
        }

        Ok(None)
    }

    /// Find a pipeline by worktree branch
    pub fn find_pipeline_by_worktree(&self, worktree_branch: &str) -> Result<Option<Pipeline>, String> {
        let pipelines = self.list_pipelines(None)?;

        for pipeline in pipelines {
            if pipeline.worktree_branch.as_deref() == Some(worktree_branch) {
                return Ok(Some(pipeline));
            }
        }

        Ok(None)
    }

    /// Update a stage's status and optionally set run_id/verdict
    pub fn update_stage(
        &self,
        pipeline_id: &str,
        stage_type: PipelineStageType,
        status: PipelineStageStatus,
        run_id: Option<&str>,
        verdict: Option<&AnalyzerVerdict>,
    ) -> Result<Pipeline, String> {
        let mut pipeline = self.get_pipeline(pipeline_id)?;
        let now = Utc::now().to_rfc3339();

        // Find and update the stage
        for stage in &mut pipeline.stages {
            if stage.stage_type == stage_type {
                stage.status = status.clone();

                if let Some(rid) = run_id {
                    stage.run_id = Some(rid.to_string());
                }

                if let Some(v) = verdict {
                    stage.verdict = Some(v.clone());
                }

                match status {
                    PipelineStageStatus::Running => {
                        if stage.started_at.is_none() {
                            stage.started_at = Some(now.clone());
                        }
                        stage.attempt += 1;
                    }
                    PipelineStageStatus::Success |
                    PipelineStageStatus::Failed |
                    PipelineStageStatus::Skipped => {
                        stage.completed_at = Some(now.clone());
                    }
                    _ => {}
                }
                break;
            }
        }

        // Update current stage to the first non-completed stage
        for stage in &pipeline.stages {
            if stage.status != PipelineStageStatus::Success &&
               stage.status != PipelineStageStatus::Skipped {
                pipeline.current_stage = stage.stage_type.clone();
                break;
            }
        }

        // Update overall pipeline status
        pipeline.status = self.compute_pipeline_status(&pipeline);
        pipeline.updated_at = now;

        if pipeline.status == PipelineStatus::Completed ||
           pipeline.status == PipelineStatus::Failed ||
           pipeline.status == PipelineStatus::Aborted {
            pipeline.completed_at = Some(Utc::now().to_rfc3339());
        }

        self.save_pipeline(&pipeline)?;
        Ok(pipeline)
    }

    /// Add an event to the pipeline's audit log
    pub fn add_event(&self, pipeline_id: &str, event: PipelineEvent) -> Result<(), String> {
        let mut pipeline = self.get_pipeline(pipeline_id)?;
        pipeline.events.push(event);
        pipeline.updated_at = Utc::now().to_rfc3339();
        self.save_pipeline(&pipeline)
    }

    /// Skip a stage with a reason
    pub fn skip_stage(
        &self,
        pipeline_id: &str,
        stage_type: PipelineStageType,
        reason: &str,
    ) -> Result<Pipeline, String> {
        let mut pipeline = self.get_pipeline(pipeline_id)?;
        let now = Utc::now().to_rfc3339();

        for stage in &mut pipeline.stages {
            if stage.stage_type == stage_type {
                stage.status = PipelineStageStatus::Skipped;
                stage.skip_reason = Some(reason.to_string());
                stage.completed_at = Some(now.clone());
                break;
            }
        }

        let event = PipelineEvent {
            timestamp: now.clone(),
            event_type: PipelineEventType::StageSkipped,
            stage_type: Some(stage_type),
            run_id: None,
            message: format!("Stage skipped: {}", reason),
            metadata: None,
        };
        pipeline.events.push(event);

        // Update current stage
        for stage in &pipeline.stages {
            if stage.status != PipelineStageStatus::Success &&
               stage.status != PipelineStageStatus::Skipped {
                pipeline.current_stage = stage.stage_type.clone();
                break;
            }
        }

        pipeline.status = self.compute_pipeline_status(&pipeline);
        pipeline.updated_at = now;

        self.save_pipeline(&pipeline)?;
        Ok(pipeline)
    }

    /// Abort entire pipeline
    pub fn abort_pipeline(&self, pipeline_id: &str, reason: &str) -> Result<Pipeline, String> {
        let mut pipeline = self.get_pipeline(pipeline_id)?;
        let now = Utc::now().to_rfc3339();

        pipeline.status = PipelineStatus::Aborted;
        pipeline.completed_at = Some(now.clone());
        pipeline.updated_at = now.clone();

        let event = PipelineEvent {
            timestamp: now,
            event_type: PipelineEventType::PipelineAborted,
            stage_type: None,
            run_id: None,
            message: format!("Pipeline aborted: {}", reason),
            metadata: None,
        };
        pipeline.events.push(event);

        self.save_pipeline(&pipeline)?;
        Ok(pipeline)
    }

    /// Manually mark a pipeline as completed
    pub fn complete_pipeline(&self, pipeline_id: &str, reason: &str) -> Result<Pipeline, String> {
        let mut pipeline = self.get_pipeline(pipeline_id)?;
        let now = Utc::now().to_rfc3339();

        pipeline.status = PipelineStatus::Completed;
        pipeline.completed_at = Some(now.clone());
        pipeline.updated_at = now.clone();

        let event = PipelineEvent {
            timestamp: now,
            event_type: PipelineEventType::PipelineManuallyCompleted,
            stage_type: None,
            run_id: None,
            message: format!("Pipeline manually completed: {}", reason),
            metadata: None,
        };
        pipeline.events.push(event);

        self.save_pipeline(&pipeline)?;
        Ok(pipeline)
    }

    /// Determine the next action based on current pipeline state
    pub fn get_next_action(&self, pipeline: &Pipeline) -> Option<PipelineNextAction> {
        // Find current stage
        let current_stage = pipeline.stages.iter()
            .find(|s| s.stage_type == pipeline.current_stage)?;

        match (&current_stage.stage_type, &current_stage.status) {
            // Implementer just completed successfully
            (PipelineStageType::Implementer, PipelineStageStatus::Success) => {
                current_stage.run_id.as_ref().map(|run_id| {
                    PipelineNextAction::TriggerAnalyzer { run_id: run_id.clone() }
                })
            }

            // Analyzer completed - check verdict
            (PipelineStageType::Analyzer, PipelineStageStatus::Success) => {
                if let Some(verdict) = &current_stage.verdict {
                    match verdict.verdict {
                        AnalyzerVerdictType::Complete => {
                            // Trigger QA if worktree exists
                            if let (Some(wt_path), Some(wt_branch)) =
                                (&pipeline.worktree_path, &pipeline.worktree_branch) {
                                Some(PipelineNextAction::TriggerQa {
                                    worktree_path: wt_path.clone(),
                                    worktree_branch: wt_branch.clone(),
                                })
                            } else {
                                // No worktree, complete directly
                                Some(PipelineNextAction::Complete)
                            }
                        }
                        AnalyzerVerdictType::Followup => {
                            // Find implementer run_id for relaunch
                            let impl_stage = pipeline.stages.iter()
                                .find(|s| s.stage_type == PipelineStageType::Implementer)?;
                            impl_stage.run_id.as_ref().map(|run_id| {
                                PipelineNextAction::RelaunchSession {
                                    run_id: run_id.clone(),
                                    prompt: verdict.follow_up_prompt.clone()
                                        .unwrap_or_else(|| "Continue the implementation.".to_string()),
                                }
                            })
                        }
                        AnalyzerVerdictType::Failed => {
                            Some(PipelineNextAction::Fail {
                                reason: verdict.reason.clone(),
                            })
                        }
                    }
                } else {
                    None
                }
            }

            // QA completed successfully - trigger merger
            (PipelineStageType::Qa, PipelineStageStatus::Success) => {
                if let (Some(wt_path), Some(wt_branch)) =
                    (&pipeline.worktree_path, &pipeline.worktree_branch) {
                    Some(PipelineNextAction::TriggerMerger {
                        worktree_path: wt_path.clone(),
                        worktree_branch: wt_branch.clone(),
                    })
                } else {
                    Some(PipelineNextAction::Complete)
                }
            }

            // Merger completed - pipeline complete
            (PipelineStageType::Merger, PipelineStageStatus::Success) => {
                Some(PipelineNextAction::Complete)
            }

            _ => None,
        }
    }

    /// Update total cost by aggregating from run costs
    pub fn update_cost(&self, pipeline_id: &str, stage_cost: f32) -> Result<(), String> {
        let mut pipeline = self.get_pipeline(pipeline_id)?;
        let current = pipeline.total_cost_usd.unwrap_or(0.0);
        pipeline.total_cost_usd = Some(current + stage_cost);
        pipeline.updated_at = Utc::now().to_rfc3339();
        self.save_pipeline(&pipeline)
    }

    // --- Private helpers ---

    fn pipeline_path(&self, id: &str) -> PathBuf {
        self.pipelines_dir.join(format!("{}.json", id))
    }

    fn save_pipeline(&self, pipeline: &Pipeline) -> Result<(), String> {
        let path = self.pipeline_path(&pipeline.id);
        let content = serde_json::to_string_pretty(pipeline)
            .map_err(|e| format!("Failed to serialize pipeline: {}", e))?;

        fs::write(&path, content)
            .map_err(|e| format!("Failed to write pipeline file: {}", e))
    }

    fn compute_pipeline_status(&self, pipeline: &Pipeline) -> PipelineStatus {
        let mut has_failed = false;
        let mut has_running = false;
        let mut all_done = true;

        for stage in &pipeline.stages {
            match stage.status {
                PipelineStageStatus::Failed => {
                    has_failed = true;
                }
                PipelineStageStatus::Running => {
                    has_running = true;
                    all_done = false;
                }
                PipelineStageStatus::Pending => {
                    all_done = false;
                }
                PipelineStageStatus::Blocked => {
                    return PipelineStatus::Blocked;
                }
                _ => {}
            }
        }

        if has_running {
            PipelineStatus::InProgress
        } else if all_done && !has_failed {
            PipelineStatus::Completed
        } else if has_failed {
            // Check if any stage after failed is still pending (can retry)
            let failed_idx = pipeline.stages.iter()
                .position(|s| s.status == PipelineStageStatus::Failed);
            if let Some(idx) = failed_idx {
                // If there are pending stages after failure, mark as blocked (awaiting retry/skip)
                if pipeline.stages.iter().skip(idx + 1).any(|s| s.status == PipelineStageStatus::Pending) {
                    PipelineStatus::Blocked
                } else {
                    PipelineStatus::Failed
                }
            } else {
                PipelineStatus::Failed
            }
        } else {
            PipelineStatus::InProgress
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_create_pipeline() {
        let temp = tempdir().unwrap();
        let manager = PipelineManager::new(&temp.path().to_path_buf());

        let pipeline = manager.create_pipeline(
            "test-pipeline-1",
            "idea-123",
            "Test Feature",
            "run-abc",
            Some("/path/to/worktree"),
            Some("worktree/impl/run-abc"),
            Some("abc123"),
            HashMap::new(),
        ).unwrap();

        assert_eq!(pipeline.id, "test-pipeline-1");
        assert_eq!(pipeline.status, PipelineStatus::InProgress);
        assert_eq!(pipeline.stages.len(), 4);
        assert_eq!(pipeline.stages[0].status, PipelineStageStatus::Running);
    }

    #[test]
    fn test_update_stage() {
        let temp = tempdir().unwrap();
        let manager = PipelineManager::new(&temp.path().to_path_buf());

        manager.create_pipeline(
            "test-pipeline-2",
            "idea-456",
            "Another Feature",
            "run-def",
            None,
            None,
            None,
            HashMap::new(),
        ).unwrap();

        let updated = manager.update_stage(
            "test-pipeline-2",
            PipelineStageType::Implementer,
            PipelineStageStatus::Success,
            None,
            None,
        ).unwrap();

        assert_eq!(updated.stages[0].status, PipelineStageStatus::Success);
        assert!(updated.stages[0].completed_at.is_some());
    }

    #[test]
    fn test_load_pipeline_definition() {
        // Test with the actual nolan directory
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let data_root = std::path::PathBuf::from(home).join(".nolan");

        if data_root.exists() {
            let manager = PipelineManager::new(&data_root);
            let result = manager.get_default_definition();

            if let Ok(def) = result {
                assert_eq!(def.name, "idea-to-merge");
                assert!(!def.stages.is_empty());
                println!("Pipeline definition loaded: {:?}", def.name);
                println!("Stages: {:?}", def.stages.iter().map(|s| &s.name).collect::<Vec<_>>());
            } else {
                println!("Could not load pipeline definition: {:?}", result.err());
            }
        }
    }
}
