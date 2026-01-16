//! Team pipeline management for multi-phase team workflows.
//!
//! This module provides tracking, persistence, and state machine logic
//! for team agent pipelines that mirror the team.yaml workflow phases.

use std::fs;
use std::path::PathBuf;

use chrono::Utc;

use crate::config::TeamConfig;
use crate::scheduler::types::{
    AgentRole, PhaseVerdict, PhaseVerdictType, PipelineEvent, PipelineEventType,
    PipelineStageStatus, PipelineStatus, TeamPipeline, TeamPipelineNextAction, TeamPipelineStage,
    TeamPipelineStageType,
};

/// Agent names for team pipeline stages
/// Use Default::default() for backwards-compatible hardcoded names,
/// or populate from role-based lookup for dynamic agent assignment
#[derive(Clone, Debug)]
pub struct TeamPipelineAgents {
    pub validator: String,
}

impl Default for TeamPipelineAgents {
    fn default() -> Self {
        Self {
            validator: "phase-validator".to_string(),
        }
    }
}

impl TeamPipelineAgents {
    /// Get the role for phase validator (Analyzer role)
    pub fn validator_role() -> AgentRole {
        AgentRole::Analyzer
    }
}

/// Manager for team pipeline state persistence and operations
pub struct TeamPipelineManager {
    pipelines_dir: PathBuf,
}

impl TeamPipelineManager {
    /// Create a new TeamPipelineManager
    pub fn new(_data_root: &PathBuf) -> Self {
        let pipelines_dir = crate::utils::paths::get_state_dir()
            .map(|p| p.join("team-pipelines"))
            .unwrap_or_else(|_| _data_root.join(".state").join("team-pipelines"));

        if !pipelines_dir.exists() {
            let _ = fs::create_dir_all(&pipelines_dir);
        }

        Self { pipelines_dir }
    }

    /// Create a new team pipeline when a team workflow starts
    /// Uses default agent names - prefer create_pipeline_with_agents for role-based lookup
    pub fn create_pipeline(
        &self,
        pipeline_id: &str,
        team: &TeamConfig,
        project_name: &str,
        docs_path: &str,
    ) -> Result<TeamPipeline, String> {
        self.create_pipeline_with_agents(
            pipeline_id,
            team,
            project_name,
            docs_path,
            TeamPipelineAgents::default(),
        )
    }

    /// Create a new team pipeline with specific agent names
    /// Use TeamPipelineAgents::default() for backwards-compatible hardcoded names,
    /// or populate from role-based SchedulerManager lookup for dynamic assignment
    pub fn create_pipeline_with_agents(
        &self,
        pipeline_id: &str,
        team: &TeamConfig,
        project_name: &str,
        docs_path: &str,
        agents: TeamPipelineAgents,
    ) -> Result<TeamPipeline, String> {
        let now = Utc::now().to_rfc3339();

        // Build stages from team phases - each phase has execution + validation
        let mut stages = Vec::new();
        let phases = &team.team.workflow.phases;

        if phases.is_empty() {
            return Err("Team has no phases defined".to_string());
        }

        let first_phase = &phases[0];

        for phase in phases {
            // Phase execution stage
            stages.push(TeamPipelineStage {
                phase_name: phase.name.clone(),
                stage_type: TeamPipelineStageType::PhaseExecution,
                status: if phase.name == first_phase.name {
                    PipelineStageStatus::Running
                } else {
                    PipelineStageStatus::Pending
                },
                agent_name: phase.owner.clone(),
                run_id: None,
                started_at: if phase.name == first_phase.name {
                    Some(now.clone())
                } else {
                    None
                },
                completed_at: None,
                verdict: None,
                skip_reason: None,
                attempt: if phase.name == first_phase.name { 1 } else { 0 },
                output_file: Some(phase.output.clone()),
            });

            // Phase validation stage
            stages.push(TeamPipelineStage {
                phase_name: phase.name.clone(),
                stage_type: TeamPipelineStageType::PhaseValidation,
                status: PipelineStageStatus::Pending,
                agent_name: agents.validator.clone(),
                run_id: None,
                started_at: None,
                completed_at: None,
                verdict: None,
                skip_reason: None,
                attempt: 0,
                output_file: Some(phase.output.clone()),
            });
        }

        let initial_event = PipelineEvent {
            timestamp: now.clone(),
            event_type: PipelineEventType::PipelineCreated,
            stage_type: None,
            run_id: None,
            message: format!("Team pipeline created for project: {}", project_name),
            metadata: Some(serde_json::json!({
                "team": team.team.name,
                "project": project_name,
                "phases": phases.iter().map(|p| &p.name).collect::<Vec<_>>(),
            })),
        };

        let pipeline = TeamPipeline {
            id: pipeline_id.to_string(),
            status: PipelineStatus::InProgress,
            created_at: now.clone(),
            updated_at: now,
            completed_at: None,
            team_name: team.team.name.clone(),
            project_name: project_name.to_string(),
            docs_path: docs_path.to_string(),
            stages,
            current_phase: first_phase.name.clone(),
            current_stage_type: TeamPipelineStageType::PhaseExecution,
            events: vec![initial_event],
            total_cost_usd: None,
        };

        self.save_pipeline(&pipeline)?;
        Ok(pipeline)
    }

    /// Get a team pipeline by ID
    pub fn get_pipeline(&self, id: &str) -> Result<TeamPipeline, String> {
        let path = self.pipeline_path(id);
        if !path.exists() {
            return Err(format!("Team pipeline not found: {}", id));
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read team pipeline file: {}", e))?;

        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse team pipeline JSON: {}", e))
    }

    /// Find pipeline by project name
    pub fn find_pipeline_by_project(
        &self,
        project_name: &str,
    ) -> Result<Option<TeamPipeline>, String> {
        let pipelines = self.list_pipelines(None)?;

        for pipeline in pipelines {
            if pipeline.project_name == project_name
                && pipeline.status == PipelineStatus::InProgress
            {
                return Ok(Some(pipeline));
            }
        }

        Ok(None)
    }

    /// List all team pipelines
    pub fn list_pipelines(
        &self,
        status_filter: Option<PipelineStatus>,
    ) -> Result<Vec<TeamPipeline>, String> {
        let mut pipelines = Vec::new();

        if !self.pipelines_dir.exists() {
            return Ok(pipelines);
        }

        let entries = fs::read_dir(&self.pipelines_dir)
            .map_err(|e| format!("Failed to read team pipelines directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(pipeline) = serde_json::from_str::<TeamPipeline>(&content) {
                        if status_filter.is_none()
                            || status_filter.as_ref() == Some(&pipeline.status)
                        {
                            pipelines.push(pipeline);
                        }
                    }
                }
            }
        }

        pipelines.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(pipelines)
    }

    /// Update a stage's status
    pub fn update_stage(
        &self,
        pipeline_id: &str,
        phase_name: &str,
        stage_type: TeamPipelineStageType,
        status: PipelineStageStatus,
        run_id: Option<&str>,
        verdict: Option<&PhaseVerdict>,
    ) -> Result<TeamPipeline, String> {
        let mut pipeline = self.get_pipeline(pipeline_id)?;
        let now = Utc::now().to_rfc3339();

        // Find and update the stage
        for stage in &mut pipeline.stages {
            if stage.phase_name == phase_name && stage.stage_type == stage_type {
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
                    PipelineStageStatus::Success
                    | PipelineStageStatus::Failed
                    | PipelineStageStatus::Skipped => {
                        stage.completed_at = Some(now.clone());
                    }
                    _ => {}
                }
                break;
            }
        }

        // Update current phase/stage
        self.update_current_stage(&mut pipeline);

        // Update overall pipeline status
        pipeline.status = self.compute_pipeline_status(&pipeline);
        pipeline.updated_at = now;

        if pipeline.status == PipelineStatus::Completed
            || pipeline.status == PipelineStatus::Failed
            || pipeline.status == PipelineStatus::Aborted
        {
            pipeline.completed_at = Some(Utc::now().to_rfc3339());
        }

        self.save_pipeline(&pipeline)?;
        Ok(pipeline)
    }

    /// Determine the next action based on current pipeline state
    pub fn get_next_action(&self, pipeline: &TeamPipeline) -> Option<TeamPipelineNextAction> {
        // Find current stage
        let current_stage = pipeline.stages.iter().find(|s| {
            s.phase_name == pipeline.current_phase && s.stage_type == pipeline.current_stage_type
        })?;

        match (&current_stage.stage_type, &current_stage.status) {
            // Phase execution completed successfully - trigger validator
            (TeamPipelineStageType::PhaseExecution, PipelineStageStatus::Success) => current_stage
                .output_file
                .as_ref()
                .map(|output_file| TeamPipelineNextAction::TriggerValidator {
                    phase_name: current_stage.phase_name.clone(),
                    output_file: output_file.clone(),
                }),

            // Phase validation is pending - execution just completed, trigger validator
            (TeamPipelineStageType::PhaseValidation, PipelineStageStatus::Pending) => {
                // Find the corresponding execution stage to get output file
                let exec_stage = pipeline.stages.iter().find(|s| {
                    s.phase_name == current_stage.phase_name
                        && s.stage_type == TeamPipelineStageType::PhaseExecution
                })?;

                if exec_stage.status == PipelineStageStatus::Success {
                    exec_stage.output_file.as_ref().map(|output_file| {
                        TeamPipelineNextAction::TriggerValidator {
                            phase_name: current_stage.phase_name.clone(),
                            output_file: output_file.clone(),
                        }
                    })
                } else {
                    None
                }
            }

            // Phase validation completed - check verdict
            (TeamPipelineStageType::PhaseValidation, PipelineStageStatus::Success) => {
                if let Some(verdict) = &current_stage.verdict {
                    match verdict.verdict {
                        PhaseVerdictType::Complete => {
                            // Find next phase
                            self.find_next_phase(pipeline, &current_stage.phase_name)
                                .map(|(phase_name, agent_name)| {
                                    TeamPipelineNextAction::TriggerNextPhase {
                                        phase_name,
                                        agent_name,
                                    }
                                })
                                .or(Some(TeamPipelineNextAction::Complete))
                        }
                        PhaseVerdictType::Revision => {
                            // Retry with feedback
                            let exec_stage = pipeline.stages.iter().find(|s| {
                                s.phase_name == current_stage.phase_name
                                    && s.stage_type == TeamPipelineStageType::PhaseExecution
                            })?;
                            Some(TeamPipelineNextAction::RetryPhase {
                                phase_name: current_stage.phase_name.clone(),
                                agent_name: exec_stage.agent_name.clone(),
                                prompt: verdict.revision_prompt.clone().unwrap_or_else(|| {
                                    format!(
                                        "Please revise your {} output. Issues: {}",
                                        current_stage.phase_name,
                                        verdict.findings.join("; ")
                                    )
                                }),
                            })
                        }
                        PhaseVerdictType::Failed => Some(TeamPipelineNextAction::EscalateToHuman {
                            phase_name: current_stage.phase_name.clone(),
                            reason: verdict.reason.clone(),
                        }),
                    }
                } else {
                    None
                }
            }

            _ => None,
        }
    }

    // --- Private helpers ---

    fn pipeline_path(&self, id: &str) -> PathBuf {
        self.pipelines_dir.join(format!("{}.json", id))
    }

    fn save_pipeline(&self, pipeline: &TeamPipeline) -> Result<(), String> {
        let path = self.pipeline_path(&pipeline.id);
        let content = serde_json::to_string_pretty(pipeline)
            .map_err(|e| format!("Failed to serialize team pipeline: {}", e))?;

        fs::write(&path, content).map_err(|e| format!("Failed to write team pipeline file: {}", e))
    }

    fn update_current_stage(&self, pipeline: &mut TeamPipeline) {
        for stage in &pipeline.stages {
            if stage.status != PipelineStageStatus::Success
                && stage.status != PipelineStageStatus::Skipped
            {
                pipeline.current_phase = stage.phase_name.clone();
                pipeline.current_stage_type = stage.stage_type.clone();
                return;
            }
        }
    }

    fn compute_pipeline_status(&self, pipeline: &TeamPipeline) -> PipelineStatus {
        let mut has_failed = false;
        let mut has_running = false;
        let mut all_done = true;

        for stage in &pipeline.stages {
            match stage.status {
                PipelineStageStatus::Failed => has_failed = true,
                PipelineStageStatus::Running => {
                    has_running = true;
                    all_done = false;
                }
                PipelineStageStatus::Pending => all_done = false,
                PipelineStageStatus::Blocked => return PipelineStatus::Blocked,
                _ => {}
            }
        }

        if has_running {
            PipelineStatus::InProgress
        } else if all_done && !has_failed {
            PipelineStatus::Completed
        } else if has_failed {
            PipelineStatus::Blocked
        } else {
            PipelineStatus::InProgress
        }
    }

    fn find_next_phase(
        &self,
        pipeline: &TeamPipeline,
        current_phase: &str,
    ) -> Option<(String, String)> {
        // Find the execution stage for the phase after current
        let mut found_current = false;
        for stage in &pipeline.stages {
            if stage.stage_type == TeamPipelineStageType::PhaseExecution {
                if found_current {
                    return Some((stage.phase_name.clone(), stage.agent_name.clone()));
                }
                if stage.phase_name == current_phase {
                    found_current = true;
                }
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{PhaseConfig, Team, TeamConfig, WorkflowConfig};
    use tempfile::tempdir;

    fn create_test_team() -> TeamConfig {
        TeamConfig {
            team: Team {
                name: "test-team".to_string(),
                description: Some("Test team".to_string()),
                version: None,
                schema_version: None,
                agents: vec![],
                workflow: WorkflowConfig {
                    note_taker: Some("dan".to_string()),
                    exception_handler: Some("guardian".to_string()),
                    disable_note_taker: false,
                    disable_exception_handler: false,
                    phases: vec![
                        PhaseConfig {
                            name: "Research".to_string(),
                            owner: "ana".to_string(),
                            output: "research.md".to_string(),
                            requires: vec![],
                            template: None,
                            next: None,      // Derived from array order
                            on_reject: None, // Derived from array order
                        },
                        PhaseConfig {
                            name: "Planning".to_string(),
                            owner: "bill".to_string(),
                            output: "plan.md".to_string(),
                            requires: vec!["research.md".to_string()],
                            template: None,
                            next: None,      // Derived from array order
                            on_reject: None, // Derived from array order
                        },
                    ],
                },
            },
        }
    }

    #[test]
    fn test_create_team_pipeline() {
        let temp = tempdir().unwrap();
        let manager = TeamPipelineManager::new(&temp.path().to_path_buf());
        let team = create_test_team();

        let pipeline = manager
            .create_pipeline("test-pipeline-1", &team, "test-project", "/path/to/docs")
            .unwrap();

        assert_eq!(pipeline.id, "test-pipeline-1");
        assert_eq!(pipeline.status, PipelineStatus::InProgress);
        // 2 phases * 2 stages each = 4 stages
        assert_eq!(pipeline.stages.len(), 4);
        assert_eq!(pipeline.current_phase, "Research");
    }

    #[test]
    fn test_update_stage() {
        let temp = tempdir().unwrap();
        let manager = TeamPipelineManager::new(&temp.path().to_path_buf());
        let team = create_test_team();

        manager
            .create_pipeline("test-pipeline-2", &team, "test-project", "/path/to/docs")
            .unwrap();

        let updated = manager
            .update_stage(
                "test-pipeline-2",
                "Research",
                TeamPipelineStageType::PhaseExecution,
                PipelineStageStatus::Success,
                Some("run-123"),
                None,
            )
            .unwrap();

        // First execution stage should be success
        let exec_stage = updated
            .stages
            .iter()
            .find(|s| {
                s.phase_name == "Research" && s.stage_type == TeamPipelineStageType::PhaseExecution
            })
            .unwrap();
        assert_eq!(exec_stage.status, PipelineStageStatus::Success);
    }

    #[test]
    fn test_get_next_action_trigger_validator() {
        let temp = tempdir().unwrap();
        let manager = TeamPipelineManager::new(&temp.path().to_path_buf());
        let team = create_test_team();

        manager
            .create_pipeline("test-pipeline-3", &team, "test-project", "/path/to/docs")
            .unwrap();

        let pipeline = manager
            .update_stage(
                "test-pipeline-3",
                "Research",
                TeamPipelineStageType::PhaseExecution,
                PipelineStageStatus::Success,
                None,
                None,
            )
            .unwrap();

        let action = manager.get_next_action(&pipeline);
        match action {
            Some(TeamPipelineNextAction::TriggerValidator { phase_name, .. }) => {
                assert_eq!(phase_name, "Research");
            }
            _ => panic!("Expected TriggerValidator action"),
        }
    }
}
