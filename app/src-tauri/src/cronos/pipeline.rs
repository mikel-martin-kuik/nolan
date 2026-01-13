//! Pipeline management for CI/CD-like agent orchestration.
//!
//! This module provides tracking, persistence, and state machine logic
//! for multi-stage agent pipelines (implementer → analyzer → qa → merger).

use std::collections::HashMap;
use std::path::PathBuf;
use std::fs;

use chrono::Utc;

use crate::cronos::types::{
    AnalyzerVerdict, AnalyzerVerdictType, Pipeline, PipelineDefinition, PipelineEvent,
    PipelineEventType, PipelineInputs, PipelineNextAction, PipelineStage,
    PipelineStageStatus, PipelineStageType, PipelineStatus,
};

/// Manager for pipeline state persistence and operations
pub struct PipelineManager {
    pipelines_dir: PathBuf,
    definitions_dir: PathBuf,
}

impl PipelineManager {
    /// Create a new PipelineManager
    pub fn new(data_root: &PathBuf) -> Self {
        let pipelines_dir = data_root.join(".state").join("pipelines");
        let definitions_dir = data_root.join("pipelines");

        // Ensure directories exist
        if !pipelines_dir.exists() {
            let _ = fs::create_dir_all(&pipelines_dir);
        }
        if !definitions_dir.exists() {
            let _ = fs::create_dir_all(&definitions_dir);
        }

        Self { pipelines_dir, definitions_dir }
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
        let now = Utc::now().to_rfc3339();

        let inputs = PipelineInputs {
            idea_id: Some(idea_id.to_string()),
            idea_title: Some(idea_title.to_string()),
            env_vars,
            git_commit: base_commit.map(|s| s.to_string()),
            timestamp: now.clone(),
        };

        // Initialize all stages
        let stages = vec![
            PipelineStage {
                stage_type: PipelineStageType::Implementer,
                status: PipelineStageStatus::Running,
                agent_name: "cron-idea-implementer".to_string(),
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
                agent_name: "cron-implementer-analyzer".to_string(),
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
                agent_name: "pred-qa-validation".to_string(),
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
                agent_name: "pred-merge-changes".to_string(),
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

    /// List all pipelines, optionally filtered by status
    pub fn list_pipelines(&self, status_filter: Option<PipelineStatus>) -> Result<Vec<Pipeline>, String> {
        let mut pipelines = Vec::new();

        if !self.pipelines_dir.exists() {
            return Ok(pipelines);
        }

        let entries = fs::read_dir(&self.pipelines_dir)
            .map_err(|e| format!("Failed to read pipelines directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(pipeline) = serde_json::from_str::<Pipeline>(&content) {
                        if status_filter.is_none() || status_filter.as_ref() == Some(&pipeline.status) {
                            pipelines.push(pipeline);
                        }
                    }
                }
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
}
