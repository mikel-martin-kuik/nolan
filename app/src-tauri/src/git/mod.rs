//! Git operations module for worktree and repository management
//!
//! Provides isolation for agent executions using git worktrees,
//! enabling parallel work without file conflicts.
//! Also manages external git repositories for agent deployment.

pub mod folders;
pub mod worktree;
