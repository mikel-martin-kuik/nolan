use chrono::{DateTime, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use tauri::command;
use ts_rs::TS;

use crate::scheduler::types::ScheduledRunLog;
use crate::utils::paths::get_scheduler_runs_dir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsageEntry {
    pub timestamp: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub cost: f64,
    pub session_id: String,
    pub project_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UsageStats {
    pub total_cost: f64,
    pub total_tokens: u64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_creation_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub total_sessions: u64,
    pub by_model: Vec<ModelUsage>,
    pub by_date: Vec<DailyUsage>,
    pub by_project: Vec<ProjectUsage>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ModelUsage {
    pub model: String,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub session_count: u64,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct DailyUsage {
    pub date: String,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub models_used: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectUsage {
    pub project_path: String,
    pub project_name: String,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub session_count: u64,
    pub last_used: String,
}

/// Stats for a single agent session
#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct AgentSessionStats {
    pub session_id: String,
    pub tmux_session: String,
    pub original_prompt: String,
    pub start_time: String,
    pub end_time: String,
    pub duration_secs: u64,
    pub model: String,
    pub cost_usd: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub total_tokens: u64,
}

/// Aggregated stats for an agent
#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AgentStats {
    pub agent_name: String,
    pub total_sessions: u64,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub total_duration_secs: u64,
    pub avg_cost_per_session: f64,
    pub avg_duration_secs: u64,
    pub by_model: Vec<ModelUsage>,
    pub by_date: Vec<DailyUsage>,
    pub sessions: Vec<AgentSessionStats>,
}

/// Entry from history.jsonl for prompt extraction
#[derive(Debug, Deserialize)]
struct HistoryEntry {
    display: String,
    _timestamp: u64,
    _project: String,
    #[serde(rename = "sessionId")]
    session_id: String,
}

// Claude 4.5 pricing constants (per million tokens, 5m cache)
const OPUS_INPUT: f64 = 5.0;
const OPUS_OUTPUT: f64 = 25.0;
const OPUS_CACHE_WRITE: f64 = 6.25;
const OPUS_CACHE_READ: f64 = 0.50;

const SONNET_INPUT: f64 = 3.0;
const SONNET_OUTPUT: f64 = 15.0;
const SONNET_CACHE_WRITE: f64 = 3.75;
const SONNET_CACHE_READ: f64 = 0.30;

const HAIKU_INPUT: f64 = 1.0;
const HAIKU_OUTPUT: f64 = 5.0;
const HAIKU_CACHE_WRITE: f64 = 1.25;
const HAIKU_CACHE_READ: f64 = 0.10;

#[derive(Debug, Deserialize)]
struct JsonlEntry {
    timestamp: String,
    message: Option<MessageData>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "requestId")]
    request_id: Option<String>,
    #[serde(rename = "costUSD")]
    cost_usd: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct MessageData {
    id: Option<String>,
    model: Option<String>,
    usage: Option<UsageData>,
}

#[derive(Debug, Deserialize)]
struct UsageData {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
}

fn calculate_cost(model: &str, usage: &UsageData) -> f64 {
    let input_tokens = usage.input_tokens.unwrap_or(0) as f64;
    let output_tokens = usage.output_tokens.unwrap_or(0) as f64;
    let cache_creation_tokens = usage.cache_creation_input_tokens.unwrap_or(0) as f64;
    let cache_read_tokens = usage.cache_read_input_tokens.unwrap_or(0) as f64;

    let (input_price, output_price, cache_write_price, cache_read_price) = if model.contains("opus")
    {
        (OPUS_INPUT, OPUS_OUTPUT, OPUS_CACHE_WRITE, OPUS_CACHE_READ)
    } else if model.contains("haiku") {
        (
            HAIKU_INPUT,
            HAIKU_OUTPUT,
            HAIKU_CACHE_WRITE,
            HAIKU_CACHE_READ,
        )
    } else {
        // Default to Sonnet pricing
        (
            SONNET_INPUT,
            SONNET_OUTPUT,
            SONNET_CACHE_WRITE,
            SONNET_CACHE_READ,
        )
    };

    (input_tokens * input_price / 1_000_000.0)
        + (output_tokens * output_price / 1_000_000.0)
        + (cache_creation_tokens * cache_write_price / 1_000_000.0)
        + (cache_read_tokens * cache_read_price / 1_000_000.0)
}

fn parse_jsonl_file(
    path: &PathBuf,
    encoded_project_name: &str,
    processed_hashes: &mut HashSet<String>,
    cutoff_date: Option<NaiveDate>,
) -> Vec<UsageEntry> {
    let mut entries = Vec::new();
    let mut actual_project_path: Option<String> = None;

    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return entries,
    };

    let session_id = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let json_value = match serde_json::from_str::<serde_json::Value>(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if actual_project_path.is_none() {
            if let Some(cwd) = json_value.get("cwd").and_then(|v| v.as_str()) {
                actual_project_path = Some(cwd.to_string());
            }
        }

        let entry = match serde_json::from_value::<JsonlEntry>(json_value) {
            Ok(e) => e,
            Err(_) => continue,
        };

        // Early filter by date if cutoff provided
        if let Some(cutoff) = cutoff_date {
            if let Ok(dt) = DateTime::parse_from_rfc3339(&entry.timestamp) {
                if dt.naive_local().date() < cutoff {
                    continue;
                }
            }
        }

        if let Some(message) = &entry.message {
            if let (Some(msg_id), Some(req_id)) = (&message.id, &entry.request_id) {
                let unique_hash = format!("{}:{}", msg_id, req_id);
                if processed_hashes.contains(&unique_hash) {
                    continue;
                }
                processed_hashes.insert(unique_hash);
            }

            if let Some(usage) = &message.usage {
                if usage.input_tokens.unwrap_or(0) == 0
                    && usage.output_tokens.unwrap_or(0) == 0
                    && usage.cache_creation_input_tokens.unwrap_or(0) == 0
                    && usage.cache_read_input_tokens.unwrap_or(0) == 0
                {
                    continue;
                }

                let cost = entry.cost_usd.unwrap_or_else(|| {
                    if let Some(model_str) = &message.model {
                        calculate_cost(model_str, usage)
                    } else {
                        0.0
                    }
                });

                let project_path = actual_project_path
                    .clone()
                    .unwrap_or_else(|| encoded_project_name.to_string());

                entries.push(UsageEntry {
                    timestamp: entry.timestamp,
                    model: message
                        .model
                        .clone()
                        .unwrap_or_else(|| "unknown".to_string()),
                    input_tokens: usage.input_tokens.unwrap_or(0),
                    output_tokens: usage.output_tokens.unwrap_or(0),
                    cache_creation_tokens: usage.cache_creation_input_tokens.unwrap_or(0),
                    cache_read_tokens: usage.cache_read_input_tokens.unwrap_or(0),
                    cost,
                    session_id: entry.session_id.unwrap_or_else(|| session_id.clone()),
                    project_path,
                });
            }
        }
    }

    entries
}

/// Get JSONL files sorted by modification time (newest first), limited to max_files
fn get_recent_jsonl_files(claude_path: &PathBuf, max_files: usize) -> Vec<(PathBuf, String)> {
    let projects_dir = claude_path.join("projects");
    let mut files: Vec<(PathBuf, String, std::time::SystemTime)> = Vec::new();

    if let Ok(projects) = fs::read_dir(&projects_dir) {
        for project in projects.flatten() {
            if !project.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }

            let project_name = project.file_name().to_string_lossy().to_string();
            let project_path = project.path();

            if let Ok(walker) = walkdir::WalkDir::new(&project_path)
                .max_depth(3) // Limit depth to avoid going too deep
                .into_iter()
                .collect::<Result<Vec<_>, _>>()
            {
                for entry in walker {
                    if entry.path().extension().and_then(|s| s.to_str()) == Some("jsonl") {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                files.push((
                                    entry.path().to_path_buf(),
                                    project_name.clone(),
                                    modified,
                                ));
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by modification time, newest first
    files.sort_by(|a, b| b.2.cmp(&a.2));

    // Take only the most recent files
    files
        .into_iter()
        .take(max_files)
        .map(|(path, name, _)| (path, name))
        .collect()
}

fn get_usage_entries_limited(
    claude_path: &PathBuf,
    max_files: usize,
    cutoff_date: Option<NaiveDate>,
) -> Vec<UsageEntry> {
    let mut all_entries = Vec::new();
    let mut processed_hashes = HashSet::new();

    let files = get_recent_jsonl_files(claude_path, max_files);

    for (path, project_name) in files {
        let entries = parse_jsonl_file(&path, &project_name, &mut processed_hashes, cutoff_date);
        all_entries.extend(entries);
    }

    all_entries.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    all_entries
}

fn aggregate_stats(filtered_entries: &[UsageEntry]) -> UsageStats {
    if filtered_entries.is_empty() {
        return UsageStats {
            total_cost: 0.0,
            total_tokens: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cache_creation_tokens: 0,
            total_cache_read_tokens: 0,
            total_sessions: 0,
            by_model: vec![],
            by_date: vec![],
            by_project: vec![],
        };
    }

    let mut total_cost = 0.0;
    let mut total_input_tokens = 0u64;
    let mut total_output_tokens = 0u64;
    let mut total_cache_creation_tokens = 0u64;
    let mut total_cache_read_tokens = 0u64;

    let mut model_stats: HashMap<String, ModelUsage> = HashMap::new();
    let mut daily_stats: HashMap<String, DailyUsage> = HashMap::new();
    let mut project_stats: HashMap<String, ProjectUsage> = HashMap::new();

    for entry in filtered_entries {
        total_cost += entry.cost;
        total_input_tokens += entry.input_tokens;
        total_output_tokens += entry.output_tokens;
        total_cache_creation_tokens += entry.cache_creation_tokens;
        total_cache_read_tokens += entry.cache_read_tokens;

        let model_stat = model_stats
            .entry(entry.model.clone())
            .or_insert(ModelUsage {
                model: entry.model.clone(),
                total_cost: 0.0,
                total_tokens: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_tokens: 0,
                cache_read_tokens: 0,
                session_count: 0,
            });
        model_stat.total_cost += entry.cost;
        model_stat.input_tokens += entry.input_tokens;
        model_stat.output_tokens += entry.output_tokens;
        model_stat.cache_creation_tokens += entry.cache_creation_tokens;
        model_stat.cache_read_tokens += entry.cache_read_tokens;
        model_stat.total_tokens = model_stat.input_tokens + model_stat.output_tokens;
        model_stat.session_count += 1;

        let date = entry
            .timestamp
            .split('T')
            .next()
            .unwrap_or(&entry.timestamp)
            .to_string();
        let daily_stat = daily_stats.entry(date.clone()).or_insert(DailyUsage {
            date,
            total_cost: 0.0,
            total_tokens: 0,
            models_used: vec![],
        });
        daily_stat.total_cost += entry.cost;
        daily_stat.total_tokens += entry.input_tokens
            + entry.output_tokens
            + entry.cache_creation_tokens
            + entry.cache_read_tokens;
        if !daily_stat.models_used.contains(&entry.model) {
            daily_stat.models_used.push(entry.model.clone());
        }

        let project_stat =
            project_stats
                .entry(entry.project_path.clone())
                .or_insert(ProjectUsage {
                    project_path: entry.project_path.clone(),
                    project_name: entry
                        .project_path
                        .split('/')
                        .last()
                        .unwrap_or(&entry.project_path)
                        .to_string(),
                    total_cost: 0.0,
                    total_tokens: 0,
                    session_count: 0,
                    last_used: entry.timestamp.clone(),
                });
        project_stat.total_cost += entry.cost;
        project_stat.total_tokens += entry.input_tokens
            + entry.output_tokens
            + entry.cache_creation_tokens
            + entry.cache_read_tokens;
        project_stat.session_count += 1;
        if entry.timestamp > project_stat.last_used {
            project_stat.last_used = entry.timestamp.clone();
        }
    }

    let total_tokens = total_input_tokens
        + total_output_tokens
        + total_cache_creation_tokens
        + total_cache_read_tokens;
    let total_sessions = filtered_entries.len() as u64;

    let mut by_model: Vec<ModelUsage> = model_stats.into_values().collect();
    by_model.sort_by(|a, b| b.total_cost.total_cmp(&a.total_cost));

    let mut by_date: Vec<DailyUsage> = daily_stats.into_values().collect();
    by_date.sort_by(|a, b| b.date.cmp(&a.date));

    let mut by_project: Vec<ProjectUsage> = project_stats.into_values().collect();
    by_project.sort_by(|a, b| b.total_cost.total_cmp(&a.total_cost));

    UsageStats {
        total_cost,
        total_tokens,
        total_input_tokens,
        total_output_tokens,
        total_cache_creation_tokens,
        total_cache_read_tokens,
        total_sessions,
        by_model,
        by_date,
        by_project,
    }
}

/// Get usage stats with a limit on files processed (for performance)
/// max_files defaults to 500 most recent JSONL files
#[command]
pub fn get_usage_stats(days: Option<u32>) -> Result<UsageStats, String> {
    let claude_path = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    // Calculate cutoff date if days specified
    let cutoff_date =
        days.map(|d| Local::now().naive_local().date() - chrono::Duration::days(d as i64));

    // Limit to 500 most recent files for performance
    // With date filtering, we'll get accurate recent data
    let max_files = match days {
        Some(d) if d <= 7 => 200,
        Some(d) if d <= 30 => 500,
        _ => 1000, // "all time" still limited for safety
    };

    let entries = get_usage_entries_limited(&claude_path, max_files, cutoff_date);

    // Additional filter for days (in case file modification time doesn't match content)
    let filtered_entries: Vec<_> = if let Some(cutoff) = cutoff_date {
        entries
            .into_iter()
            .filter(|e| {
                if let Ok(dt) = DateTime::parse_from_rfc3339(&e.timestamp) {
                    dt.naive_local().date() >= cutoff
                } else {
                    false
                }
            })
            .collect()
    } else {
        entries
    };

    Ok(aggregate_stats(&filtered_entries))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_usage_by_date_range(start_date: String, end_date: String) -> Result<UsageStats, String> {
    let claude_path = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d").or_else(|_| {
        DateTime::parse_from_rfc3339(&start_date)
            .map(|dt| dt.naive_local().date())
            .map_err(|e| format!("Invalid start date: {}", e))
    })?;
    let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d").or_else(|_| {
        DateTime::parse_from_rfc3339(&end_date)
            .map(|dt| dt.naive_local().date())
            .map_err(|e| format!("Invalid end date: {}", e))
    })?;

    // Calculate days between for file limit
    let days_diff = (end - start).num_days().abs() as usize;
    let max_files = match days_diff {
        0..=7 => 200,
        8..=30 => 500,
        _ => 1000,
    };

    let entries = get_usage_entries_limited(&claude_path, max_files, Some(start));

    let filtered_entries: Vec<_> = entries
        .into_iter()
        .filter(|e| {
            if let Ok(dt) = DateTime::parse_from_rfc3339(&e.timestamp) {
                let date = dt.naive_local().date();
                date >= start && date <= end
            } else {
                false
            }
        })
        .collect();

    Ok(aggregate_stats(&filtered_entries))
}

#[command]
pub fn get_session_stats(
    since: Option<String>,
    until: Option<String>,
    order: Option<String>,
) -> Result<Vec<ProjectUsage>, String> {
    let claude_path = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    let since_date = since.and_then(|s| NaiveDate::parse_from_str(&s, "%Y%m%d").ok());
    let until_date = until.and_then(|s| NaiveDate::parse_from_str(&s, "%Y%m%d").ok());

    // Determine max files based on date range
    let max_files = match (&since_date, &until_date) {
        (Some(s), Some(u)) => {
            let days = (*u - *s).num_days().abs() as usize;
            match days {
                0..=7 => 200,
                8..=30 => 500,
                _ => 1000,
            }
        }
        _ => 500,
    };

    let entries = get_usage_entries_limited(&claude_path, max_files, since_date);

    let filtered_entries: Vec<_> = entries
        .into_iter()
        .filter(|e| {
            if let Ok(dt) = DateTime::parse_from_rfc3339(&e.timestamp) {
                let date = dt.date_naive();
                let is_after_since = since_date.map_or(true, |s| date >= s);
                let is_before_until = until_date.map_or(true, |u| date <= u);
                is_after_since && is_before_until
            } else {
                false
            }
        })
        .collect();

    let mut session_stats: HashMap<String, ProjectUsage> = HashMap::new();
    for entry in &filtered_entries {
        let session_key = format!("{}/{}", entry.project_path, entry.session_id);
        let project_stat = session_stats
            .entry(session_key)
            .or_insert_with(|| ProjectUsage {
                project_path: entry.project_path.clone(),
                project_name: entry.session_id.clone(),
                total_cost: 0.0,
                total_tokens: 0,
                session_count: 0,
                last_used: " ".to_string(),
            });

        project_stat.total_cost += entry.cost;
        project_stat.total_tokens += entry.input_tokens
            + entry.output_tokens
            + entry.cache_creation_tokens
            + entry.cache_read_tokens;
        project_stat.session_count += 1;
        if entry.timestamp > project_stat.last_used {
            project_stat.last_used = entry.timestamp.clone();
        }
    }

    let mut by_session: Vec<ProjectUsage> = session_stats.into_values().collect();

    if let Some(order_str) = order {
        if order_str == "asc" {
            by_session.sort_by(|a, b| a.last_used.cmp(&b.last_used));
        } else {
            by_session.sort_by(|a, b| b.last_used.cmp(&a.last_used));
        }
    } else {
        by_session.sort_by(|a, b| b.last_used.cmp(&a.last_used));
    }

    Ok(by_session)
}

/// Load original prompts from history.jsonl, indexed by session_id
fn load_session_prompts(claude_path: &PathBuf) -> HashMap<String, String> {
    let history_path = claude_path.join("history.jsonl");
    let mut prompts: HashMap<String, String> = HashMap::new();

    if let Ok(file) = fs::File::open(&history_path) {
        let reader = BufReader::new(file);
        for line in reader.lines().flatten() {
            if let Ok(entry) = serde_json::from_str::<HistoryEntry>(&line) {
                // Only store the first prompt for each session (the original)
                if !prompts.contains_key(&entry.session_id) && !entry.display.is_empty() {
                    prompts.insert(entry.session_id, entry.display);
                }
            }
        }
    }

    prompts
}

/// Get usage stats for a specific agent (e.g., "ralph")
#[tauri::command(rename_all = "snake_case")]
pub fn get_agent_usage_stats(agent_name: String, days: Option<u32>) -> Result<AgentStats, String> {
    let claude_path = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    let cutoff_date =
        days.map(|d| Local::now().naive_local().date() - chrono::Duration::days(d as i64));

    let max_files = match days {
        Some(d) if d <= 7 => 500,
        Some(d) if d <= 30 => 1000,
        _ => 2000,
    };

    let entries = get_usage_entries_limited(&claude_path, max_files, cutoff_date);

    let agent_pattern = format!("agent-{}", agent_name.to_lowercase());
    let agent_entries: Vec<_> = entries
        .into_iter()
        .filter(|e| {
            e.project_path.to_lowercase().contains(&agent_pattern)
                || e.project_path
                    .to_lowercase()
                    .contains(&format!("agents/{}", agent_name.to_lowercase()))
        })
        .collect();

    if agent_entries.is_empty() {
        return Ok(AgentStats {
            agent_name: agent_name.clone(),
            total_sessions: 0,
            total_cost: 0.0,
            total_tokens: 0,
            total_duration_secs: 0,
            avg_cost_per_session: 0.0,
            avg_duration_secs: 0,
            by_model: vec![],
            by_date: vec![],
            sessions: vec![],
        });
    }

    let prompts = load_session_prompts(&claude_path);

    let mut session_map: HashMap<String, Vec<&UsageEntry>> = HashMap::new();
    for entry in &agent_entries {
        session_map
            .entry(entry.session_id.clone())
            .or_default()
            .push(entry);
    }

    let mut sessions: Vec<AgentSessionStats> = Vec::new();
    let mut model_stats: HashMap<String, ModelUsage> = HashMap::new();
    let mut daily_stats: HashMap<String, DailyUsage> = HashMap::new();

    for (session_id, entries) in &session_map {
        if entries.is_empty() {
            continue;
        }

        let mut sorted_entries: Vec<_> = entries.iter().collect();
        sorted_entries.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        let first = sorted_entries.first().unwrap();
        let last = sorted_entries.last().unwrap();

        let start_time = &first.timestamp;
        let end_time = &last.timestamp;
        let duration_secs = if let (Ok(start_dt), Ok(end_dt)) = (
            DateTime::parse_from_rfc3339(start_time),
            DateTime::parse_from_rfc3339(end_time),
        ) {
            (end_dt - start_dt).num_seconds().max(0) as u64
        } else {
            0
        };

        let mut total_input = 0u64;
        let mut total_output = 0u64;
        let mut total_cache_read = 0u64;
        let mut total_cache_write = 0u64;
        let mut total_cost = 0.0f64;
        let mut model = String::from("unknown");

        for entry in &sorted_entries {
            total_input += entry.input_tokens;
            total_output += entry.output_tokens;
            total_cache_read += entry.cache_read_tokens;
            total_cache_write += entry.cache_creation_tokens;
            total_cost += entry.cost;
            if entry.model != "unknown" {
                model = entry.model.clone();
            }
        }

        let tmux_session = first
            .project_path
            .split('/')
            .last()
            .unwrap_or("unknown")
            .to_string();
        let original_prompt = prompts
            .get(session_id)
            .cloned()
            .unwrap_or_else(|| "No prompt recorded".to_string());

        sessions.push(AgentSessionStats {
            session_id: session_id.clone(),
            tmux_session,
            original_prompt,
            start_time: start_time.clone(),
            end_time: end_time.clone(),
            duration_secs,
            model: model.clone(),
            cost_usd: total_cost,
            input_tokens: total_input,
            output_tokens: total_output,
            cache_read_tokens: total_cache_read,
            cache_write_tokens: total_cache_write,
            total_tokens: total_input + total_output + total_cache_read + total_cache_write,
        });

        let model_stat = model_stats.entry(model.clone()).or_insert(ModelUsage {
            model: model.clone(),
            total_cost: 0.0,
            total_tokens: 0,
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            session_count: 0,
        });
        model_stat.total_cost += total_cost;
        model_stat.input_tokens += total_input;
        model_stat.output_tokens += total_output;
        model_stat.cache_creation_tokens += total_cache_write;
        model_stat.cache_read_tokens += total_cache_read;
        model_stat.total_tokens +=
            total_input + total_output + total_cache_read + total_cache_write;
        model_stat.session_count += 1;

        let date = start_time
            .split('T')
            .next()
            .unwrap_or(start_time)
            .to_string();
        let daily_stat = daily_stats.entry(date.clone()).or_insert(DailyUsage {
            date,
            total_cost: 0.0,
            total_tokens: 0,
            models_used: vec![],
        });
        daily_stat.total_cost += total_cost;
        daily_stat.total_tokens +=
            total_input + total_output + total_cache_read + total_cache_write;
        if !daily_stat.models_used.contains(&model) {
            daily_stat.models_used.push(model);
        }
    }

    sessions.sort_by(|a, b| b.start_time.cmp(&a.start_time));

    let total_sessions = sessions.len() as u64;
    let total_cost: f64 = sessions.iter().map(|s| s.cost_usd).sum();
    let total_tokens: u64 = sessions.iter().map(|s| s.total_tokens).sum();
    let total_duration_secs: u64 = sessions.iter().map(|s| s.duration_secs).sum();

    let avg_cost_per_session = if total_sessions > 0 {
        total_cost / total_sessions as f64
    } else {
        0.0
    };
    let avg_duration_secs = if total_sessions > 0 {
        total_duration_secs / total_sessions
    } else {
        0
    };

    let mut by_model: Vec<ModelUsage> = model_stats.into_values().collect();
    by_model.sort_by(|a, b| b.session_count.cmp(&a.session_count));

    let mut by_date: Vec<DailyUsage> = daily_stats.into_values().collect();
    by_date.sort_by(|a, b| b.date.cmp(&a.date));

    Ok(AgentStats {
        agent_name,
        total_sessions,
        total_cost,
        total_tokens,
        total_duration_secs,
        avg_cost_per_session,
        avg_duration_secs,
        by_model,
        by_date,
        sessions,
    })
}

// =============================================================================
// Execution Metrics Types (matching frontend types/metrics.ts)
// =============================================================================

/// Breakdown of executions by status
#[derive(Debug, Serialize, Deserialize, Clone, Default, TS)]
#[ts(export)]
pub struct StatusBreakdown {
    pub success: u32,
    pub failed: u32,
    pub timeout: u32,
    pub cancelled: u32,
    pub running: u32,
    pub skipped: u32,
    pub interrupted: u32,
}

/// Breakdown of executions by trigger type
#[derive(Debug, Serialize, Deserialize, Clone, Default, TS)]
#[ts(export)]
pub struct TriggerBreakdown {
    pub scheduled: u32,
    pub manual: u32,
    pub retry: u32,
    pub catch_up: u32,
}

/// Common error pattern with count
#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct ErrorSummary {
    pub error_type: String,
    pub count: u32,
    pub last_seen: String,
    pub example_message: Option<String>,
}

/// Quantitative metrics per workflow execution
#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct ExecutionMetrics {
    pub execution_id: String,
    pub project_name: String,
    pub workflow_name: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_secs: u32,

    // Status and trigger info
    pub status: String,
    pub trigger: String,
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,

    // Token metrics (not available in run logs, set to 0)
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,

    // Execution metrics
    pub agent_count: u32,
    pub phase_count: u32,
    pub rejection_count: u32,
    pub retry_count: u32,

    // Cost
    pub cost_usd: f64,

    // Quality scores (optional, AI-evaluated)
    pub prompt_quality_score: Option<f64>,
    pub output_quality_score: Option<f64>,
    pub quality_evaluated_at: Option<String>,
    pub quality_model: Option<String>,
}

/// Daily aggregated metrics for trend visualization
#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct ExecutionDailyMetrics {
    pub date: String,
    pub execution_count: u32,
    pub success_count: u32,
    pub failure_count: u32,
    pub success_rate: f64,
    pub total_duration_secs: u32,
    pub avg_duration_secs: f64,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub avg_cost: f64,
    pub avg_agent_count: f64,
    pub avg_phase_count: f64,
    pub total_rejections: u32,
    pub total_retries: u32,

    // Average quality scores (when available)
    pub avg_prompt_quality: Option<f64>,
    pub avg_output_quality: Option<f64>,
    pub quality_sample_count: Option<u32>,
}

/// Agent performance metrics
#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct AgentPerformanceMetrics {
    pub agent_name: String,
    pub execution_count: u32,
    pub success_count: u32,
    pub failure_count: u32,
    pub success_rate: f64,
    pub total_tokens: u64,
    pub avg_tokens: f64,
    pub total_cost: f64,
    pub avg_cost: f64,
    pub cost_per_success: f64,
    pub total_duration_secs: u32,
    pub avg_duration_secs: f64,
    pub rejection_count: u32,
    pub retry_count: u32,
    pub last_run_at: Option<String>,
    pub last_status: Option<String>,
}

/// Project-level metrics summary
#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct ProjectMetricsSummary {
    pub project_name: String,
    pub total_executions: u32,
    pub success_count: u32,
    pub failure_count: u32,
    pub success_rate: f64,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub total_duration_secs: u32,
    pub avg_duration_secs: f64,
    pub avg_cost: f64,
    pub avg_agents_per_execution: f64,
    pub avg_phases_per_execution: f64,
    pub first_execution_at: String,
    pub last_execution_at: String,

    // Quality metrics (when available)
    pub avg_prompt_quality: Option<f64>,
    pub avg_output_quality: Option<f64>,
}

/// Overall metrics dashboard data
#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct MetricsDashboard {
    // Summary stats
    pub total_executions: u32,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub total_duration_secs: u32,
    pub avg_duration_secs: f64,
    pub avg_cost_per_execution: f64,

    // Success/failure metrics
    pub success_count: u32,
    pub failure_count: u32,
    pub success_rate: f64,
    pub cost_per_success: f64,

    // Status and trigger breakdowns
    pub status_breakdown: StatusBreakdown,
    pub trigger_breakdown: TriggerBreakdown,

    // Error analysis
    pub top_errors: Vec<ErrorSummary>,

    // Trend data
    pub daily_metrics: Vec<ExecutionDailyMetrics>,

    // Breakdowns
    pub by_project: Vec<ProjectMetricsSummary>,
    pub by_agent: Vec<AgentPerformanceMetrics>,

    // Recent executions
    pub recent_executions: Vec<ExecutionMetrics>,
}

// =============================================================================
// Execution Metrics Command
// =============================================================================

/// Scan runs directory and load all run logs within date range
fn load_run_logs(days: Option<u32>) -> Result<Vec<ScheduledRunLog>, String> {
    let runs_dir = get_scheduler_runs_dir()?;

    if !runs_dir.exists() {
        return Ok(Vec::new());
    }

    let cutoff_date = days.map(|d| {
        Local::now().naive_local().date() - chrono::Duration::days(d as i64)
    });

    let mut run_logs = Vec::new();

    // Scan date directories (format: YYYY-MM-DD)
    let entries = fs::read_dir(&runs_dir)
        .map_err(|e| format!("Failed to read runs directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        // Parse date from directory name
        let dir_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name,
            None => continue,
        };

        // Check if within date range
        if let Some(cutoff) = cutoff_date {
            if let Ok(dir_date) = NaiveDate::parse_from_str(dir_name, "%Y-%m-%d") {
                if dir_date < cutoff {
                    continue;
                }
            }
        }

        // Scan JSON files in this date directory
        if let Ok(files) = fs::read_dir(&path) {
            for file in files.flatten() {
                let file_path = file.path();
                if file_path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }

                // Parse run log JSON
                if let Ok(content) = fs::read_to_string(&file_path) {
                    if let Ok(run_log) = serde_json::from_str::<ScheduledRunLog>(&content) {
                        run_logs.push(run_log);
                    }
                }
            }
        }
    }

    // Sort by started_at descending (most recent first)
    run_logs.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    Ok(run_logs)
}

/// Convert status enum to string
fn status_to_string(status: &crate::scheduler::types::ScheduledRunStatus) -> String {
    match status {
        crate::scheduler::types::ScheduledRunStatus::Running => "running".to_string(),
        crate::scheduler::types::ScheduledRunStatus::Success => "success".to_string(),
        crate::scheduler::types::ScheduledRunStatus::Failed => "failed".to_string(),
        crate::scheduler::types::ScheduledRunStatus::Timeout => "timeout".to_string(),
        crate::scheduler::types::ScheduledRunStatus::Cancelled => "cancelled".to_string(),
        crate::scheduler::types::ScheduledRunStatus::Skipped => "skipped".to_string(),
        crate::scheduler::types::ScheduledRunStatus::Retrying => "retrying".to_string(),
        crate::scheduler::types::ScheduledRunStatus::Interrupted => "interrupted".to_string(),
    }
}

/// Convert trigger enum to string
fn trigger_to_string(trigger: &crate::scheduler::types::RunTrigger) -> String {
    match trigger {
        crate::scheduler::types::RunTrigger::Scheduled => "scheduled".to_string(),
        crate::scheduler::types::RunTrigger::Manual => "manual".to_string(),
        crate::scheduler::types::RunTrigger::Retry => "retry".to_string(),
        crate::scheduler::types::RunTrigger::CatchUp => "catch_up".to_string(),
    }
}

/// Check if a status is considered successful
fn is_success_status(status: &crate::scheduler::types::ScheduledRunStatus) -> bool {
    matches!(status, crate::scheduler::types::ScheduledRunStatus::Success)
}

/// Check if a status is considered a failure
fn is_failure_status(status: &crate::scheduler::types::ScheduledRunStatus) -> bool {
    matches!(
        status,
        crate::scheduler::types::ScheduledRunStatus::Failed
        | crate::scheduler::types::ScheduledRunStatus::Timeout
        | crate::scheduler::types::ScheduledRunStatus::Interrupted
    )
}

/// Convert a ScheduledRunLog to ExecutionMetrics
fn run_log_to_execution_metrics(run_log: &ScheduledRunLog) -> ExecutionMetrics {
    let retry_count = if run_log.attempt > 1 {
        run_log.attempt - 1
    } else {
        0
    };

    // Check if this was a rejection (failed status with analyzer verdict)
    let rejection_count = match run_log.status {
        crate::scheduler::types::ScheduledRunStatus::Failed
        | crate::scheduler::types::ScheduledRunStatus::Timeout => {
            if run_log.analyzer_verdict.is_some() {
                1
            } else {
                0
            }
        }
        _ => 0,
    };

    ExecutionMetrics {
        execution_id: run_log.run_id.clone(),
        project_name: run_log.agent_name.clone(),
        workflow_name: run_log.label.clone(),
        started_at: run_log.started_at.clone(),
        ended_at: run_log.completed_at.clone(),
        duration_secs: run_log.duration_secs.unwrap_or(0),

        // Status and trigger info
        status: status_to_string(&run_log.status),
        trigger: trigger_to_string(&run_log.trigger),
        exit_code: run_log.exit_code,
        error_message: run_log.error.clone(),

        // Token metrics not available in run logs
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,

        agent_count: 1,
        phase_count: 1,
        rejection_count,
        retry_count,

        cost_usd: run_log.total_cost_usd.unwrap_or(0.0) as f64,

        // Quality scores not available
        prompt_quality_score: None,
        output_quality_score: None,
        quality_evaluated_at: None,
        quality_model: None,
    }
}

/// Aggregate run logs into a MetricsDashboard
fn aggregate_execution_metrics(run_logs: &[ScheduledRunLog]) -> MetricsDashboard {
    if run_logs.is_empty() {
        return MetricsDashboard {
            total_executions: 0,
            total_tokens: 0,
            total_cost: 0.0,
            total_duration_secs: 0,
            avg_duration_secs: 0.0,
            avg_cost_per_execution: 0.0,
            success_count: 0,
            failure_count: 0,
            success_rate: 0.0,
            cost_per_success: 0.0,
            status_breakdown: StatusBreakdown::default(),
            trigger_breakdown: TriggerBreakdown::default(),
            top_errors: vec![],
            daily_metrics: vec![],
            by_project: vec![],
            by_agent: vec![],
            recent_executions: vec![],
        };
    }

    // Calculate totals
    let total_executions = run_logs.len() as u32;
    let total_duration_secs: u32 = run_logs.iter()
        .map(|r| r.duration_secs.unwrap_or(0))
        .sum();
    let total_cost: f64 = run_logs.iter()
        .map(|r| r.total_cost_usd.unwrap_or(0.0) as f64)
        .sum();

    let avg_duration_secs = if total_executions > 0 {
        (total_duration_secs as f64 / total_executions as f64).round()
    } else {
        0.0
    };
    let avg_cost_per_execution = if total_executions > 0 {
        total_cost / total_executions as f64
    } else {
        0.0
    };

    // Calculate success/failure counts and status breakdown
    let mut status_breakdown = StatusBreakdown::default();
    let mut trigger_breakdown = TriggerBreakdown::default();
    let mut error_map: HashMap<String, (u32, String, Option<String>)> = HashMap::new();

    for run_log in run_logs {
        // Status breakdown
        match run_log.status {
            crate::scheduler::types::ScheduledRunStatus::Success => status_breakdown.success += 1,
            crate::scheduler::types::ScheduledRunStatus::Failed => status_breakdown.failed += 1,
            crate::scheduler::types::ScheduledRunStatus::Timeout => status_breakdown.timeout += 1,
            crate::scheduler::types::ScheduledRunStatus::Cancelled => status_breakdown.cancelled += 1,
            crate::scheduler::types::ScheduledRunStatus::Running => status_breakdown.running += 1,
            crate::scheduler::types::ScheduledRunStatus::Skipped => status_breakdown.skipped += 1,
            crate::scheduler::types::ScheduledRunStatus::Retrying => status_breakdown.running += 1,
            crate::scheduler::types::ScheduledRunStatus::Interrupted => status_breakdown.interrupted += 1,
        }

        // Trigger breakdown
        match run_log.trigger {
            crate::scheduler::types::RunTrigger::Scheduled => trigger_breakdown.scheduled += 1,
            crate::scheduler::types::RunTrigger::Manual => trigger_breakdown.manual += 1,
            crate::scheduler::types::RunTrigger::Retry => trigger_breakdown.retry += 1,
            crate::scheduler::types::RunTrigger::CatchUp => trigger_breakdown.catch_up += 1,
        }

        // Error aggregation
        if let Some(error) = &run_log.error {
            let error_type = categorize_error(error);
            let entry = error_map.entry(error_type).or_insert((0, run_log.started_at.clone(), None));
            entry.0 += 1;
            if run_log.started_at > entry.1 {
                entry.1 = run_log.started_at.clone();
            }
            if entry.2.is_none() {
                entry.2 = Some(truncate_error(error, 200));
            }
        }
    }

    let success_count = status_breakdown.success;
    let failure_count = status_breakdown.failed + status_breakdown.timeout + status_breakdown.interrupted;
    let success_rate = if total_executions > 0 {
        (success_count as f64 / total_executions as f64 * 100.0).round()
    } else {
        0.0
    };
    let cost_per_success = if success_count > 0 {
        total_cost / success_count as f64
    } else {
        0.0
    };

    // Build top errors list
    let mut top_errors: Vec<ErrorSummary> = error_map
        .into_iter()
        .map(|(error_type, (count, last_seen, example))| ErrorSummary {
            error_type,
            count,
            last_seen,
            example_message: example,
        })
        .collect();
    top_errors.sort_by(|a, b| b.count.cmp(&a.count));
    top_errors.truncate(10);

    // Aggregate by date (with success/failure tracking)
    struct DailyAgg {
        count: u32,
        success: u32,
        failure: u32,
        duration: u32,
        cost: f64,
        retries: u32,
        rejections: u32,
    }
    let mut daily_map: HashMap<String, DailyAgg> = HashMap::new();
    for run_log in run_logs {
        let date = run_log.started_at.split('T').next().unwrap_or(&run_log.started_at).to_string();
        let entry = daily_map.entry(date).or_insert(DailyAgg {
            count: 0, success: 0, failure: 0, duration: 0, cost: 0.0, retries: 0, rejections: 0,
        });
        entry.count += 1;
        entry.duration += run_log.duration_secs.unwrap_or(0);
        entry.cost += run_log.total_cost_usd.unwrap_or(0.0) as f64;
        if is_success_status(&run_log.status) {
            entry.success += 1;
        }
        if is_failure_status(&run_log.status) {
            entry.failure += 1;
        }
        if run_log.attempt > 1 {
            entry.retries += run_log.attempt - 1;
        }
        if run_log.analyzer_verdict.is_some() && is_failure_status(&run_log.status) {
            entry.rejections += 1;
        }
    }

    let mut daily_metrics: Vec<ExecutionDailyMetrics> = daily_map
        .into_iter()
        .map(|(date, agg)| {
            let rate = if agg.count > 0 { (agg.success as f64 / agg.count as f64 * 100.0).round() } else { 0.0 };
            ExecutionDailyMetrics {
                date,
                execution_count: agg.count,
                success_count: agg.success,
                failure_count: agg.failure,
                success_rate: rate,
                total_duration_secs: agg.duration,
                avg_duration_secs: if agg.count > 0 { (agg.duration as f64 / agg.count as f64).round() } else { 0.0 },
                total_tokens: 0,
                total_cost: agg.cost,
                avg_cost: if agg.count > 0 { agg.cost / agg.count as f64 } else { 0.0 },
                avg_agent_count: 1.0,
                avg_phase_count: 1.0,
                total_rejections: agg.rejections,
                total_retries: agg.retries,
                avg_prompt_quality: None,
                avg_output_quality: None,
                quality_sample_count: None,
            }
        })
        .collect();
    daily_metrics.sort_by(|a, b| a.date.cmp(&b.date));

    // Aggregate by agent (with success/failure tracking)
    struct AgentAgg {
        count: u32,
        success: u32,
        failure: u32,
        duration: u32,
        cost: f64,
        retries: u32,
        rejections: u32,
        last_run: String,
        last_status: String,
    }
    let mut agent_map: HashMap<String, AgentAgg> = HashMap::new();
    for run_log in run_logs {
        let entry = agent_map.entry(run_log.agent_name.clone()).or_insert(AgentAgg {
            count: 0, success: 0, failure: 0, duration: 0, cost: 0.0, retries: 0, rejections: 0,
            last_run: String::new(), last_status: String::new(),
        });
        entry.count += 1;
        entry.duration += run_log.duration_secs.unwrap_or(0);
        entry.cost += run_log.total_cost_usd.unwrap_or(0.0) as f64;
        if is_success_status(&run_log.status) {
            entry.success += 1;
        }
        if is_failure_status(&run_log.status) {
            entry.failure += 1;
        }
        if run_log.attempt > 1 {
            entry.retries += run_log.attempt - 1;
        }
        if run_log.analyzer_verdict.is_some() && is_failure_status(&run_log.status) {
            entry.rejections += 1;
        }
        // Track most recent run
        if run_log.started_at > entry.last_run {
            entry.last_run = run_log.started_at.clone();
            entry.last_status = status_to_string(&run_log.status);
        }
    }

    let mut by_agent: Vec<AgentPerformanceMetrics> = agent_map
        .into_iter()
        .map(|(name, agg)| {
            let rate = if agg.count > 0 { (agg.success as f64 / agg.count as f64 * 100.0).round() } else { 0.0 };
            let cps = if agg.success > 0 { agg.cost / agg.success as f64 } else { 0.0 };
            AgentPerformanceMetrics {
                agent_name: name,
                execution_count: agg.count,
                success_count: agg.success,
                failure_count: agg.failure,
                success_rate: rate,
                total_tokens: 0,
                avg_tokens: 0.0,
                total_cost: agg.cost,
                avg_cost: if agg.count > 0 { agg.cost / agg.count as f64 } else { 0.0 },
                cost_per_success: cps,
                total_duration_secs: agg.duration,
                avg_duration_secs: if agg.count > 0 { (agg.duration as f64 / agg.count as f64).round() } else { 0.0 },
                rejection_count: agg.rejections,
                retry_count: agg.retries,
                last_run_at: if agg.last_run.is_empty() { None } else { Some(agg.last_run) },
                last_status: if agg.last_status.is_empty() { None } else { Some(agg.last_status) },
            }
        })
        .collect();
    by_agent.sort_by(|a, b| b.execution_count.cmp(&a.execution_count));

    // Aggregate by project (with success/failure tracking)
    struct ProjectAgg {
        count: u32,
        success: u32,
        failure: u32,
        duration: u32,
        cost: f64,
        first: String,
        last: String,
    }
    let mut project_map: HashMap<String, ProjectAgg> = HashMap::new();
    for run_log in run_logs {
        let project_key = run_log.pipeline_id.clone().unwrap_or_else(|| run_log.agent_name.clone());
        let entry = project_map.entry(project_key).or_insert(ProjectAgg {
            count: 0, success: 0, failure: 0, duration: 0, cost: 0.0,
            first: run_log.started_at.clone(), last: run_log.started_at.clone(),
        });
        entry.count += 1;
        entry.duration += run_log.duration_secs.unwrap_or(0);
        entry.cost += run_log.total_cost_usd.unwrap_or(0.0) as f64;
        if is_success_status(&run_log.status) {
            entry.success += 1;
        }
        if is_failure_status(&run_log.status) {
            entry.failure += 1;
        }
        if run_log.started_at < entry.first {
            entry.first = run_log.started_at.clone();
        }
        if run_log.started_at > entry.last {
            entry.last = run_log.started_at.clone();
        }
    }

    let mut by_project: Vec<ProjectMetricsSummary> = project_map
        .into_iter()
        .map(|(name, agg)| {
            let rate = if agg.count > 0 { (agg.success as f64 / agg.count as f64 * 100.0).round() } else { 0.0 };
            ProjectMetricsSummary {
                project_name: name,
                total_executions: agg.count,
                success_count: agg.success,
                failure_count: agg.failure,
                success_rate: rate,
                total_tokens: 0,
                total_cost: agg.cost,
                total_duration_secs: agg.duration,
                avg_duration_secs: if agg.count > 0 { (agg.duration as f64 / agg.count as f64).round() } else { 0.0 },
                avg_cost: if agg.count > 0 { agg.cost / agg.count as f64 } else { 0.0 },
                avg_agents_per_execution: 1.0,
                avg_phases_per_execution: 1.0,
                first_execution_at: agg.first,
                last_execution_at: agg.last,
                avg_prompt_quality: None,
                avg_output_quality: None,
            }
        })
        .collect();
    by_project.sort_by(|a, b| b.total_executions.cmp(&a.total_executions));

    // Recent executions (take first 20)
    let recent_executions: Vec<ExecutionMetrics> = run_logs.iter()
        .take(20)
        .map(run_log_to_execution_metrics)
        .collect();

    MetricsDashboard {
        total_executions,
        total_tokens: 0,
        total_cost,
        total_duration_secs,
        avg_duration_secs,
        avg_cost_per_execution,
        success_count,
        failure_count,
        success_rate,
        cost_per_success,
        status_breakdown,
        trigger_breakdown,
        top_errors,
        daily_metrics,
        by_project,
        by_agent,
        recent_executions,
    }
}

/// Categorize an error message into a type
fn categorize_error(error: &str) -> String {
    let error_lower = error.to_lowercase();
    if error_lower.contains("timeout") {
        "Timeout".to_string()
    } else if error_lower.contains("connection") || error_lower.contains("network") {
        "Network Error".to_string()
    } else if error_lower.contains("permission") || error_lower.contains("denied") {
        "Permission Denied".to_string()
    } else if error_lower.contains("not found") || error_lower.contains("404") {
        "Not Found".to_string()
    } else if error_lower.contains("rate limit") || error_lower.contains("429") {
        "Rate Limited".to_string()
    } else if error_lower.contains("memory") || error_lower.contains("oom") {
        "Out of Memory".to_string()
    } else if error_lower.contains("cancelled") || error_lower.contains("canceled") {
        "Cancelled".to_string()
    } else if error_lower.contains("exit code") {
        "Process Error".to_string()
    } else {
        "Other".to_string()
    }
}

/// Truncate error message to a maximum length
fn truncate_error(error: &str, max_len: usize) -> String {
    if error.len() <= max_len {
        error.to_string()
    } else {
        format!("{}...", &error[..max_len])
    }
}

/// Get execution metrics dashboard data
/// Scans ~/.nolan/data/runs/ for run log files and aggregates them
#[tauri::command(rename_all = "snake_case")]
pub fn get_execution_metrics(days: Option<u32>) -> Result<MetricsDashboard, String> {
    let run_logs = load_run_logs(days)?;
    Ok(aggregate_execution_metrics(&run_logs))
}
