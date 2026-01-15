//! Feedback and feature request management commands

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use tauri::command;
use ts_rs::TS;
use uuid::Uuid;

use crate::utils::paths::get_feedback_dir;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
#[serde(rename_all = "lowercase")]
pub enum FeatureRequestStatus {
    New,
    Reviewed,
    Designed,
    Done,
    Rejected,
}

impl Default for FeatureRequestStatus {
    fn default() -> Self {
        FeatureRequestStatus::New
    }
}

impl std::fmt::Display for FeatureRequestStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FeatureRequestStatus::New => write!(f, "new"),
            FeatureRequestStatus::Reviewed => write!(f, "reviewed"),
            FeatureRequestStatus::Designed => write!(f, "designed"),
            FeatureRequestStatus::Done => write!(f, "done"),
            FeatureRequestStatus::Rejected => write!(f, "rejected"),
        }
    }
}

impl std::str::FromStr for FeatureRequestStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "new" => Ok(FeatureRequestStatus::New),
            "reviewed" => Ok(FeatureRequestStatus::Reviewed),
            "designed" => Ok(FeatureRequestStatus::Designed),
            "done" => Ok(FeatureRequestStatus::Done),
            "rejected" => Ok(FeatureRequestStatus::Rejected),
            _ => Err(format!("Invalid status: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
pub struct FeatureRequest {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: FeatureRequestStatus,
    pub votes: i32,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
pub struct VoteRecord {
    pub request_id: String,
    pub user_id: String,
    pub vote_type: String, // "up" or "down"
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
#[serde(rename_all = "lowercase")]
pub enum IdeaStatus {
    Active,
    Archived,
}

impl Default for IdeaStatus {
    fn default() -> Self {
        IdeaStatus::Active
    }
}

impl std::str::FromStr for IdeaStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "active" => Ok(IdeaStatus::Active),
            "archived" => Ok(IdeaStatus::Archived),
            _ => Err(format!("Invalid status: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
pub struct Idea {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: IdeaStatus,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

// ============================================================================
// Hotfixes - Simple fixes that bypass the full idea pipeline
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
#[serde(rename_all = "lowercase")]
pub enum HotfixStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

impl Default for HotfixStatus {
    fn default() -> Self {
        HotfixStatus::Pending
    }
}

impl std::str::FromStr for HotfixStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "pending" => Ok(HotfixStatus::Pending),
            "in_progress" => Ok(HotfixStatus::InProgress),
            "completed" => Ok(HotfixStatus::Completed),
            "failed" => Ok(HotfixStatus::Failed),
            _ => Err(format!("Invalid hotfix status: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
pub struct Hotfix {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: HotfixStatus,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scope: Vec<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
pub struct FeedbackStats {
    pub total_requests: usize,
    pub by_status: HashMap<String, usize>,
    pub total_votes: i32,
    pub total_ideas: usize,
}

// ============================================================================
// File Helpers
// ============================================================================

fn ensure_feedback_dir() -> Result<PathBuf, String> {
    let dir = get_feedback_dir()?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create feedback directory: {}", e))?;
    }
    Ok(dir)
}

fn get_requests_file() -> Result<PathBuf, String> {
    Ok(ensure_feedback_dir()?.join("requests.jsonl"))
}

fn get_votes_file() -> Result<PathBuf, String> {
    Ok(ensure_feedback_dir()?.join("votes.jsonl"))
}

fn get_ideas_file() -> Result<PathBuf, String> {
    Ok(ensure_feedback_dir()?.join("ideas.jsonl"))
}

fn get_hotfixes_file() -> Result<PathBuf, String> {
    Ok(ensure_feedback_dir()?.join("hotfixes.jsonl"))
}

/// Read all lines from a JSONL file and deserialize them
fn read_jsonl<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Result<Vec<T>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::new(file);
    let mut items = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str(&line) {
            Ok(item) => items.push(item),
            Err(e) => {
                // Log but skip malformed lines
                eprintln!("Warning: Failed to parse line: {}", e);
            }
        }
    }

    Ok(items)
}

/// Append a single item to a JSONL file
fn append_jsonl<T: Serialize>(path: &PathBuf, item: &T) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Failed to open file for append: {}", e))?;

    let json = serde_json::to_string(item).map_err(|e| format!("Failed to serialize: {}", e))?;
    writeln!(file, "{}", json).map_err(|e| format!("Failed to write: {}", e))?;

    Ok(())
}

/// Rewrite entire JSONL file with updated items
fn write_jsonl<T: Serialize>(path: &PathBuf, items: &[T]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)
        .map_err(|e| format!("Failed to open file for write: {}", e))?;

    for item in items {
        let json =
            serde_json::to_string(item).map_err(|e| format!("Failed to serialize: {}", e))?;
        writeln!(file, "{}", json).map_err(|e| format!("Failed to write: {}", e))?;
    }

    Ok(())
}

/// Generate a unique user ID for voting (stored locally)
fn get_or_create_user_id() -> Result<String, String> {
    let dir = ensure_feedback_dir()?;
    let user_id_file = dir.join(".user-id");

    if user_id_file.exists() {
        fs::read_to_string(&user_id_file)
            .map(|s| s.trim().to_string())
            .map_err(|e| format!("Failed to read user ID: {}", e))
    } else {
        let user_id = Uuid::new_v4().to_string();
        fs::write(&user_id_file, &user_id)
            .map_err(|e| format!("Failed to write user ID: {}", e))?;
        Ok(user_id)
    }
}

// ============================================================================
// Feature Request Commands
// ============================================================================

#[command]
pub fn list_feature_requests() -> Result<Vec<FeatureRequest>, String> {
    let path = get_requests_file()?;
    let mut requests: Vec<FeatureRequest> = read_jsonl(&path)?;

    // Sort by votes descending, then by created_at descending
    requests.sort_by(|a, b| {
        b.votes
            .cmp(&a.votes)
            .then_with(|| b.created_at.cmp(&a.created_at))
    });

    Ok(requests)
}

#[command]
pub fn create_feature_request(
    title: String,
    description: String,
    author: Option<String>,
) -> Result<FeatureRequest, String> {
    let now = Utc::now().to_rfc3339();
    let request = FeatureRequest {
        id: Uuid::new_v4().to_string(),
        title,
        description,
        status: FeatureRequestStatus::New,
        votes: 0,
        created_at: now.clone(),
        updated_at: now,
        author,
    };

    let path = get_requests_file()?;
    append_jsonl(&path, &request)?;

    Ok(request)
}

#[command]
pub fn update_feature_request_status(id: String, status: String) -> Result<FeatureRequest, String> {
    let path = get_requests_file()?;
    let mut requests: Vec<FeatureRequest> = read_jsonl(&path)?;

    let new_status: FeatureRequestStatus = status.parse()?;

    let request = requests
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("Request not found: {}", id))?;

    request.status = new_status;
    request.updated_at = Utc::now().to_rfc3339();

    let updated = request.clone();
    write_jsonl(&path, &requests)?;

    Ok(updated)
}

#[tauri::command(rename_all = "snake_case")]
pub fn vote_feature_request(id: String, vote_type: String) -> Result<FeatureRequest, String> {
    // Validate vote type
    if vote_type != "up" && vote_type != "down" {
        return Err("Invalid vote type. Must be 'up' or 'down'".to_string());
    }

    let user_id = get_or_create_user_id()?;
    let votes_path = get_votes_file()?;
    let requests_path = get_requests_file()?;

    // Check for existing vote
    let votes: Vec<VoteRecord> = read_jsonl(&votes_path)?;
    let existing_vote = votes
        .iter()
        .find(|v| v.request_id == id && v.user_id == user_id);

    let vote_delta = match existing_vote {
        Some(v) if v.vote_type == vote_type => {
            // Same vote - remove it (toggle off)
            let new_votes: Vec<_> = votes
                .into_iter()
                .filter(|v| !(v.request_id == id && v.user_id == user_id))
                .collect();
            write_jsonl(&votes_path, &new_votes)?;
            if vote_type == "up" {
                -1
            } else {
                1
            }
        }
        Some(_existing) => {
            // Different vote - update it
            let new_votes: Vec<_> = votes
                .into_iter()
                .map(|mut v| {
                    if v.request_id == id && v.user_id == user_id {
                        v.vote_type = vote_type.clone();
                        v.timestamp = Utc::now().to_rfc3339();
                    }
                    v
                })
                .collect();
            write_jsonl(&votes_path, &new_votes)?;
            // Changed from down to up: +2, from up to down: -2
            if vote_type == "up" {
                2
            } else {
                -2
            }
        }
        None => {
            // New vote
            let vote = VoteRecord {
                request_id: id.clone(),
                user_id,
                vote_type: vote_type.clone(),
                timestamp: Utc::now().to_rfc3339(),
            };
            append_jsonl(&votes_path, &vote)?;
            if vote_type == "up" {
                1
            } else {
                -1
            }
        }
    };

    // Update request vote count
    let mut requests: Vec<FeatureRequest> = read_jsonl(&requests_path)?;
    let request = requests
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("Request not found: {}", id))?;

    request.votes += vote_delta;
    request.updated_at = Utc::now().to_rfc3339();

    let updated = request.clone();
    write_jsonl(&requests_path, &requests)?;

    Ok(updated)
}

#[command]
pub fn delete_feature_request(id: String) -> Result<(), String> {
    let requests_path = get_requests_file()?;
    let votes_path = get_votes_file()?;

    // Remove the request
    let requests: Vec<FeatureRequest> = read_jsonl(&requests_path)?;
    let filtered: Vec<_> = requests.into_iter().filter(|r| r.id != id).collect();
    write_jsonl(&requests_path, &filtered)?;

    // Remove associated votes
    let votes: Vec<VoteRecord> = read_jsonl(&votes_path)?;
    let filtered_votes: Vec<_> = votes.into_iter().filter(|v| v.request_id != id).collect();
    write_jsonl(&votes_path, &filtered_votes)?;

    Ok(())
}

// ============================================================================
// Ideas Commands
// ============================================================================

#[command]
pub fn list_ideas() -> Result<Vec<Idea>, String> {
    let path = get_ideas_file()?;
    let mut ideas: Vec<Idea> = read_jsonl(&path)?;

    // Sort by created_at descending (newest first)
    ideas.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(ideas)
}

#[command]
pub fn create_idea(
    title: String,
    description: String,
    created_by: Option<String>,
) -> Result<Idea, String> {
    let idea = Idea {
        id: Uuid::new_v4().to_string(),
        title,
        description,
        status: IdeaStatus::Active,
        created_at: Utc::now().to_rfc3339(),
        updated_at: None,
        created_by,
        tags: Vec::new(),
    };

    let path = get_ideas_file()?;
    append_jsonl(&path, &idea)?;

    Ok(idea)
}

#[command]
pub fn update_idea(id: String, title: String, description: String) -> Result<Idea, String> {
    let path = get_ideas_file()?;
    let mut ideas: Vec<Idea> = read_jsonl(&path)?;

    let idea = ideas
        .iter_mut()
        .find(|i| i.id == id)
        .ok_or_else(|| format!("Idea not found: {}", id))?;

    idea.title = title;
    idea.description = description;
    idea.updated_at = Some(Utc::now().to_rfc3339());

    let updated = idea.clone();
    write_jsonl(&path, &ideas)?;

    Ok(updated)
}

#[command]
pub fn update_idea_status(id: String, status: String) -> Result<Idea, String> {
    let path = get_ideas_file()?;
    let mut ideas: Vec<Idea> = read_jsonl(&path)?;

    let new_status: IdeaStatus = status.parse()?;

    let idea = ideas
        .iter_mut()
        .find(|i| i.id == id)
        .ok_or_else(|| format!("Idea not found: {}", id))?;

    idea.status = new_status;
    idea.updated_at = Some(Utc::now().to_rfc3339());

    let updated = idea.clone();
    write_jsonl(&path, &ideas)?;

    Ok(updated)
}

#[command]
pub fn delete_idea(id: String) -> Result<(), String> {
    let path = get_ideas_file()?;
    let ideas: Vec<Idea> = read_jsonl(&path)?;
    let filtered: Vec<_> = ideas.into_iter().filter(|i| i.id != id).collect();
    write_jsonl(&path, &filtered)?;

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_idea_tag(id: String, tag: String) -> Result<Idea, String> {
    let tag = tag.trim().to_lowercase();
    if tag.is_empty() {
        return Err("Tag cannot be empty".to_string());
    }

    let path = get_ideas_file()?;
    let mut ideas: Vec<Idea> = read_jsonl(&path)?;

    let idea = ideas
        .iter_mut()
        .find(|i| i.id == id)
        .ok_or_else(|| format!("Idea not found: {}", id))?;

    if !idea.tags.contains(&tag) {
        idea.tags.push(tag);
        idea.tags.sort();
        idea.updated_at = Some(Utc::now().to_rfc3339());
    }

    let updated = idea.clone();
    write_jsonl(&path, &ideas)?;

    Ok(updated)
}

#[tauri::command(rename_all = "snake_case")]
pub fn remove_idea_tag(id: String, tag: String) -> Result<Idea, String> {
    let tag = tag.trim().to_lowercase();

    let path = get_ideas_file()?;
    let mut ideas: Vec<Idea> = read_jsonl(&path)?;

    let idea = ideas
        .iter_mut()
        .find(|i| i.id == id)
        .ok_or_else(|| format!("Idea not found: {}", id))?;

    idea.tags.retain(|t| t != &tag);
    idea.updated_at = Some(Utc::now().to_rfc3339());

    let updated = idea.clone();
    write_jsonl(&path, &ideas)?;

    Ok(updated)
}

#[command]
pub fn list_all_idea_tags() -> Result<Vec<String>, String> {
    let path = get_ideas_file()?;
    let ideas: Vec<Idea> = read_jsonl(&path)?;

    let mut tags: Vec<String> = ideas.into_iter().flat_map(|i| i.tags).collect();

    tags.sort();
    tags.dedup();

    Ok(tags)
}

// ============================================================================
// Hotfix Commands - Simple fixes that bypass the full idea pipeline
// ============================================================================

#[command]
pub fn list_hotfixes() -> Result<Vec<Hotfix>, String> {
    let path = get_hotfixes_file()?;
    read_jsonl(&path)
}

#[command]
pub fn create_hotfix(
    title: String,
    description: String,
    scope: Option<Vec<String>>,
    created_by: Option<String>,
) -> Result<Hotfix, String> {
    let hotfix = Hotfix {
        id: Uuid::new_v4().to_string(),
        title,
        description,
        status: HotfixStatus::Pending,
        scope: scope.unwrap_or_default(),
        created_at: Utc::now().to_rfc3339(),
        completed_at: None,
        created_by,
        run_id: None,
        error: None,
    };

    let path = get_hotfixes_file()?;
    append_jsonl(&path, &hotfix)?;

    Ok(hotfix)
}

#[command]
pub fn update_hotfix(
    id: String,
    title: Option<String>,
    description: Option<String>,
    scope: Option<Vec<String>>,
) -> Result<Hotfix, String> {
    let path = get_hotfixes_file()?;
    let mut hotfixes: Vec<Hotfix> = read_jsonl(&path)?;

    let hotfix = hotfixes
        .iter_mut()
        .find(|h| h.id == id)
        .ok_or_else(|| format!("Hotfix not found: {}", id))?;

    if let Some(t) = title {
        hotfix.title = t;
    }
    if let Some(d) = description {
        hotfix.description = d;
    }
    if let Some(s) = scope {
        hotfix.scope = s;
    }

    let updated = hotfix.clone();
    write_jsonl(&path, &hotfixes)?;

    Ok(updated)
}

#[command]
pub fn update_hotfix_status(id: String, status: String) -> Result<Hotfix, String> {
    let new_status: HotfixStatus = status.parse()?;
    let path = get_hotfixes_file()?;
    let mut hotfixes: Vec<Hotfix> = read_jsonl(&path)?;

    let hotfix = hotfixes
        .iter_mut()
        .find(|h| h.id == id)
        .ok_or_else(|| format!("Hotfix not found: {}", id))?;

    hotfix.status = new_status.clone();

    // Set completed_at when status changes to completed or failed
    if new_status == HotfixStatus::Completed || new_status == HotfixStatus::Failed {
        hotfix.completed_at = Some(Utc::now().to_rfc3339());
    }

    let updated = hotfix.clone();
    write_jsonl(&path, &hotfixes)?;

    Ok(updated)
}

#[command]
pub fn delete_hotfix(id: String) -> Result<(), String> {
    let path = get_hotfixes_file()?;
    let hotfixes: Vec<Hotfix> = read_jsonl(&path)?;
    let filtered: Vec<_> = hotfixes.into_iter().filter(|h| h.id != id).collect();
    write_jsonl(&path, &filtered)?;

    Ok(())
}

// ============================================================================
// Stats Command
// ============================================================================

#[command]
pub fn get_feedback_stats() -> Result<FeedbackStats, String> {
    let requests_path = get_requests_file()?;
    let ideas_path = get_ideas_file()?;

    let requests: Vec<FeatureRequest> = read_jsonl(&requests_path)?;
    let ideas: Vec<Idea> = read_jsonl(&ideas_path)?;

    let mut by_status: HashMap<String, usize> = HashMap::new();
    let mut total_votes = 0i32;

    for request in &requests {
        *by_status.entry(request.status.to_string()).or_insert(0) += 1;
        total_votes += request.votes;
    }

    Ok(FeedbackStats {
        total_requests: requests.len(),
        by_status,
        total_votes,
        total_ideas: ideas.len(),
    })
}

// ============================================================================
// Get User Vote State (for UI)
// ============================================================================

#[command]
pub fn get_user_votes() -> Result<HashMap<String, String>, String> {
    let user_id = get_or_create_user_id()?;
    let votes_path = get_votes_file()?;
    let votes: Vec<VoteRecord> = read_jsonl(&votes_path)?;

    let user_votes: HashMap<String, String> = votes
        .into_iter()
        .filter(|v| v.user_id == user_id)
        .map(|v| (v.request_id, v.vote_type))
        .collect();

    Ok(user_votes)
}

// ============================================================================
// Idea Reviews (from scheduled-inbox-digest agent)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
#[serde(rename_all = "snake_case")]
pub enum IdeaReviewStatus {
    Draft,
    NeedsInput,
    Ready,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
#[serde(rename_all = "lowercase")]
pub enum IdeaComplexity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
pub struct IdeaProposal {
    pub title: String,
    pub summary: String,
    pub problem: String,
    pub solution: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub implementation_hints: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
pub struct IdeaGap {
    pub id: String,
    pub label: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
pub struct IdeaReview {
    pub item_id: String,
    pub item_type: String,
    pub review_status: IdeaReviewStatus,
    pub proposal: IdeaProposal,
    #[serde(default)]
    pub gaps: Vec<IdeaGap>,
    pub analysis: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub complexity: Option<IdeaComplexity>,
    pub reviewed_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accepted_at: Option<String>,
    /// Route type when accepted: "project" or "implementer"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
    /// Route detail: project name for "project", or "triggered" for "implementer"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_detail: Option<String>,
}

fn get_inbox_reviews_file() -> Result<PathBuf, String> {
    Ok(ensure_feedback_dir()?.join("inbox-reviews.jsonl"))
}

fn get_decisions_file() -> Result<PathBuf, String> {
    Ok(ensure_feedback_dir()?.join("decisions.jsonl"))
}

// ============================================================================
// Design Decision Tracking
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
#[serde(rename_all = "snake_case")]
pub enum DecisionStatus {
    Proposed,
    InReview,
    Approved,
    Deprecated,
    Superseded,
}

impl Default for DecisionStatus {
    fn default() -> Self {
        DecisionStatus::Proposed
    }
}

impl std::fmt::Display for DecisionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecisionStatus::Proposed => write!(f, "proposed"),
            DecisionStatus::InReview => write!(f, "in_review"),
            DecisionStatus::Approved => write!(f, "approved"),
            DecisionStatus::Deprecated => write!(f, "deprecated"),
            DecisionStatus::Superseded => write!(f, "superseded"),
        }
    }
}

impl std::str::FromStr for DecisionStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "proposed" => Ok(DecisionStatus::Proposed),
            "in_review" => Ok(DecisionStatus::InReview),
            "approved" => Ok(DecisionStatus::Approved),
            "deprecated" => Ok(DecisionStatus::Deprecated),
            "superseded" => Ok(DecisionStatus::Superseded),
            _ => Err(format!("Invalid decision status: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
pub struct TeamDecision {
    pub id: String,
    pub team_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    pub title: String,
    pub problem: String,
    pub proposed_solution: String,
    #[serde(default)]
    pub alternatives: Vec<String>,
    pub rationale: String,
    pub impact: String,
    pub scope: String,
    pub status: DecisionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_by: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deprecated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
}

#[command]
pub fn list_idea_reviews() -> Result<Vec<IdeaReview>, String> {
    let path = get_inbox_reviews_file()?;
    let reviews: Vec<IdeaReview> = read_jsonl(&path)?;
    Ok(reviews)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_idea_review(item_id: String) -> Result<(), String> {
    let path = get_inbox_reviews_file()?;
    let reviews: Vec<IdeaReview> = read_jsonl(&path)?;
    let filtered: Vec<_> = reviews
        .into_iter()
        .filter(|r| r.item_id != item_id)
        .collect();
    write_jsonl(&path, &filtered)?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_review_gaps(item_id: String, gaps: Vec<IdeaGap>) -> Result<IdeaReview, String> {
    let path = get_inbox_reviews_file()?;
    let mut reviews: Vec<IdeaReview> = read_jsonl(&path)?;

    let review = reviews
        .iter_mut()
        .find(|r| r.item_id == item_id)
        .ok_or_else(|| format!("Review not found for item: {}", item_id))?;

    review.gaps = gaps;
    review.updated_at = Some(Utc::now().to_rfc3339());

    // Check if all required gaps are filled
    let all_filled = review.gaps.iter().all(|g| !g.required || g.value.is_some());
    if all_filled && matches!(review.review_status, IdeaReviewStatus::NeedsInput) {
        review.review_status = IdeaReviewStatus::Draft;
    }

    let updated = review.clone();
    write_jsonl(&path, &reviews)?;

    Ok(updated)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_review_proposal(
    item_id: String,
    proposal: IdeaProposal,
) -> Result<IdeaReview, String> {
    let path = get_inbox_reviews_file()?;
    let mut reviews: Vec<IdeaReview> = read_jsonl(&path)?;

    let review = reviews
        .iter_mut()
        .find(|r| r.item_id == item_id)
        .ok_or_else(|| format!("Review not found for item: {}", item_id))?;

    review.proposal = proposal;
    review.updated_at = Some(Utc::now().to_rfc3339());

    let updated = review.clone();
    write_jsonl(&path, &reviews)?;

    Ok(updated)
}

#[tauri::command(rename_all = "snake_case")]
pub fn accept_review(item_id: String) -> Result<IdeaReview, String> {
    let path = get_inbox_reviews_file()?;
    let mut reviews: Vec<IdeaReview> = read_jsonl(&path)?;

    let review = reviews
        .iter_mut()
        .find(|r| r.item_id == item_id)
        .ok_or_else(|| format!("Review not found for item: {}", item_id))?;

    // Check if all required gaps are filled
    let all_filled = review.gaps.iter().all(|g| !g.required || g.value.is_some());
    if !all_filled {
        return Err("Cannot accept: some required gaps are not filled".to_string());
    }

    review.review_status = IdeaReviewStatus::Ready;
    review.accepted_at = Some(Utc::now().to_rfc3339());
    review.updated_at = Some(Utc::now().to_rfc3339());

    let updated = review.clone();
    write_jsonl(&path, &reviews)?;

    Ok(updated)
}

#[tauri::command(rename_all = "snake_case")]
pub fn unaccept_review(item_id: String) -> Result<IdeaReview, String> {
    let path = get_inbox_reviews_file()?;
    let mut reviews: Vec<IdeaReview> = read_jsonl(&path)?;

    let review = reviews
        .iter_mut()
        .find(|r| r.item_id == item_id)
        .ok_or_else(|| format!("Review not found for item: {}", item_id))?;

    // Only unaccept if currently accepted
    if review.accepted_at.is_none() {
        return Err("Review is not accepted".to_string());
    }

    // Clear acceptance, keeping status as Ready (but will show in Ready column now)
    review.accepted_at = None;
    review.updated_at = Some(Utc::now().to_rfc3339());

    let updated = review.clone();
    write_jsonl(&path, &reviews)?;

    Ok(updated)
}

/// Result of accepting and routing an idea
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/types/generated/feedback/")]
pub struct AcceptAndRouteResult {
    pub review: IdeaReview,
    pub route: String,
    pub route_detail: String,
}

/// Accept a review and route it based on complexity (async version for Tauri)
/// - High complexity → Create project
/// - Low/Medium complexity → Trigger idea-implementer
#[tauri::command(rename_all = "snake_case")]
pub async fn accept_and_route_review(item_id: String) -> Result<AcceptAndRouteResult, String> {
    // First accept the review
    let _review = accept_review(item_id.clone())?;

    // Then route based on complexity
    let route_result = crate::scheduler::commands::route_accepted_idea(item_id.clone()).await?;

    // Update the review with route info
    let path = get_inbox_reviews_file()?;
    let mut reviews: Vec<IdeaReview> = read_jsonl(&path)?;

    let review = reviews
        .iter_mut()
        .find(|r| r.item_id == item_id)
        .ok_or_else(|| format!("Review not found for item: {}", item_id))?;

    review.route = Some(route_result.route.clone());
    review.route_detail = Some(route_result.detail.clone());
    review.updated_at = Some(Utc::now().to_rfc3339());

    let updated = review.clone();
    write_jsonl(&path, &reviews)?;

    Ok(AcceptAndRouteResult {
        review: updated,
        route: route_result.route,
        route_detail: route_result.detail,
    })
}

// ============================================================================
// Team Decision Commands
// ============================================================================

#[command]
pub fn list_decisions() -> Result<Vec<TeamDecision>, String> {
    let path = get_decisions_file()?;
    let mut decisions: Vec<TeamDecision> = read_jsonl(&path)?;

    // Sort by created_at descending (newest first)
    decisions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(decisions)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_decisions_by_team(team_id: String) -> Result<Vec<TeamDecision>, String> {
    let path = get_decisions_file()?;
    let decisions: Vec<TeamDecision> = read_jsonl(&path)?;

    let filtered: Vec<_> = decisions
        .into_iter()
        .filter(|d| d.team_id == team_id)
        .collect();

    Ok(filtered)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_decision(
    team_id: String,
    title: String,
    problem: String,
    proposed_solution: String,
    alternatives: Vec<String>,
    rationale: String,
    impact: String,
    scope: String,
    agent_id: Option<String>,
) -> Result<TeamDecision, String> {
    let decision = TeamDecision {
        id: Uuid::new_v4().to_string(),
        team_id,
        agent_id,
        title,
        problem,
        proposed_solution,
        alternatives,
        rationale,
        impact,
        scope,
        status: DecisionStatus::Proposed,
        approved_by: None,
        created_at: Utc::now().to_rfc3339(),
        approved_at: None,
        deprecated_at: None,
        superseded_by: None,
    };

    let path = get_decisions_file()?;
    append_jsonl(&path, &decision)?;

    Ok(decision)
}

#[command]
pub fn update_decision_status(id: String, status: String) -> Result<TeamDecision, String> {
    let path = get_decisions_file()?;
    let mut decisions: Vec<TeamDecision> = read_jsonl(&path)?;

    let new_status: DecisionStatus = status.parse()?;

    let decision = decisions
        .iter_mut()
        .find(|d| d.id == id)
        .ok_or_else(|| format!("Decision not found: {}", id))?;

    decision.status = new_status;

    let updated = decision.clone();
    write_jsonl(&path, &decisions)?;

    Ok(updated)
}

#[tauri::command(rename_all = "snake_case")]
pub fn approve_decision(id: String, approved_by: String) -> Result<TeamDecision, String> {
    let path = get_decisions_file()?;
    let mut decisions: Vec<TeamDecision> = read_jsonl(&path)?;

    let decision = decisions
        .iter_mut()
        .find(|d| d.id == id)
        .ok_or_else(|| format!("Decision not found: {}", id))?;

    decision.status = DecisionStatus::Approved;
    decision.approved_by = Some(approved_by);
    decision.approved_at = Some(Utc::now().to_rfc3339());

    let updated = decision.clone();
    write_jsonl(&path, &decisions)?;

    Ok(updated)
}

#[command]
pub fn deprecate_decision(id: String) -> Result<TeamDecision, String> {
    let path = get_decisions_file()?;
    let mut decisions: Vec<TeamDecision> = read_jsonl(&path)?;

    let decision = decisions
        .iter_mut()
        .find(|d| d.id == id)
        .ok_or_else(|| format!("Decision not found: {}", id))?;

    decision.status = DecisionStatus::Deprecated;
    decision.deprecated_at = Some(Utc::now().to_rfc3339());

    let updated = decision.clone();
    write_jsonl(&path, &decisions)?;

    Ok(updated)
}

#[tauri::command(rename_all = "snake_case")]
pub fn supersede_decision(id: String, new_decision_id: String) -> Result<TeamDecision, String> {
    let path = get_decisions_file()?;
    let mut decisions: Vec<TeamDecision> = read_jsonl(&path)?;

    // Verify new decision exists
    let new_exists = decisions.iter().any(|d| d.id == new_decision_id);
    if !new_exists {
        return Err(format!("New decision not found: {}", new_decision_id));
    }

    let decision = decisions
        .iter_mut()
        .find(|d| d.id == id)
        .ok_or_else(|| format!("Decision not found: {}", id))?;

    decision.status = DecisionStatus::Superseded;
    decision.superseded_by = Some(new_decision_id);

    let updated = decision.clone();
    write_jsonl(&path, &decisions)?;

    Ok(updated)
}

#[command]
pub fn delete_decision(id: String) -> Result<(), String> {
    let path = get_decisions_file()?;
    let decisions: Vec<TeamDecision> = read_jsonl(&path)?;
    let filtered: Vec<_> = decisions.into_iter().filter(|d| d.id != id).collect();
    write_jsonl(&path, &filtered)?;

    Ok(())
}
