// === Core Modules ===
pub mod commands;
pub mod executor;
pub mod manager;
pub mod pipeline;
pub mod team_pipeline;
pub mod types;

// === Command Submodules (split from commands.rs for AI-friendly file sizes) ===
// See docs/AI_ARCHITECTURE.md for guidelines
pub mod commands_agent;
pub mod commands_analyzer;
pub mod commands_history;
pub mod commands_ideas;
pub mod commands_pipeline;
pub mod commands_schedules;

// === Re-exports ===
pub use manager::SchedulerManager;
pub use pipeline::PipelineManager;
pub use team_pipeline::TeamPipelineManager;
pub use types::*;
