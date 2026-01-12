use chrono::{DateTime, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use tauri::command;

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

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
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

    let (input_price, output_price, cache_write_price, cache_read_price) =
        if model.contains("opus") {
            (OPUS_INPUT, OPUS_OUTPUT, OPUS_CACHE_WRITE, OPUS_CACHE_READ)
        } else if model.contains("haiku") {
            (HAIKU_INPUT, HAIKU_OUTPUT, HAIKU_CACHE_WRITE, HAIKU_CACHE_READ)
        } else {
            // Default to Sonnet pricing
            (SONNET_INPUT, SONNET_OUTPUT, SONNET_CACHE_WRITE, SONNET_CACHE_READ)
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
                                files.push((entry.path().to_path_buf(), project_name.clone(), modified));
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
    let cutoff_date = days.map(|d| {
        Local::now().naive_local().date() - chrono::Duration::days(d as i64)
    });

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

#[command]
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
