use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::time::Duration;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::time::sleep;
use serde::{Deserialize, Serialize};

// Global flag to prevent multiple streaming tasks
static STREAMING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub timestamp: String,
    pub agent: Option<String>,
    pub message: String,
    pub entry_type: String,  // "user", "assistant", "system", etc.
}

#[tauri::command]
pub async fn start_history_stream(app_handle: AppHandle) -> Result<(), String> {
    eprintln!("[DEBUG] start_history_stream called");

    // Check if already streaming
    if STREAMING.load(Ordering::Relaxed) {
        eprintln!("[DEBUG] Already streaming, returning early");
        return Ok(()); // Already streaming, don't start another task
    }

    eprintln!("[DEBUG] Starting new streaming task");

    // Mark as streaming
    STREAMING.store(true, Ordering::Relaxed);

    // Spawn background task that won't block
    tokio::spawn(async move {
        eprintln!("[DEBUG] Background streaming task started");
        if let Err(e) = tail_history_file(app_handle).await {
            eprintln!("History streaming error: {}", e);
            STREAMING.store(false, Ordering::Relaxed);
        }
    });

    Ok(())
}

async fn tail_history_file(app_handle: AppHandle) -> Result<(), String> {
    eprintln!("[DEBUG] tail_history_file started");

    // Get history file path
    let history_path = crate::utils::paths::get_history_path()?;
    eprintln!("[DEBUG] History file path: {:?}", history_path);

    // Open file for reading
    let mut file = File::open(&history_path)
        .map_err(|e| format!("Failed to open history file: {}", e))?;

    // Start at end of file (only show new entries)
    file.seek(SeekFrom::End(0))
        .map_err(|e| format!("Failed to seek to end: {}", e))?;

    let mut reader = BufReader::new(file);
    let mut line = String::new();
    let mut consecutive_empty_reads = 0;

    loop {
        // Check if streaming should stop
        if !STREAMING.load(Ordering::Relaxed) {
            eprintln!("History streaming stopped by request");
            return Ok(());
        }

        line.clear();

        // Try to read a complete line
        match reader.read_line(&mut line) {
            Ok(0) => {
                // EOF reached - wait for new data
                consecutive_empty_reads += 1;

                // Back off exponentially (up to 500ms) to avoid busy-waiting
                let wait_ms = std::cmp::min(50 * consecutive_empty_reads, 500);
                sleep(Duration::from_millis(wait_ms)).await;

                // Check if file was truncated or rotated
                if let Ok(metadata) = reader.get_ref().metadata() {
                    if let Ok(current_pos) = reader.stream_position() {
                        if current_pos > metadata.len() {
                            // File was truncated - seek back to start
                            reader.seek(SeekFrom::Start(0))
                                .map_err(|e| format!("Failed to seek after truncation: {}", e))?;
                        }
                    }
                }

                continue;
            }
            Ok(_bytes_read) => {
                // Successfully read a line
                consecutive_empty_reads = 0;

                // Ensure line is complete (ends with newline)
                if !line.ends_with('\n') {
                    // Partial line - seek back and wait for completion
                    let line_len = line.len() as i64;
                    reader.seek(SeekFrom::Current(-line_len))
                        .map_err(|e| format!("Failed to seek back: {}", e))?;
                    sleep(Duration::from_millis(100)).await;
                    continue;
                }

                // Try to parse as JSON
                if let Ok(entry) = parse_history_line(&line) {
                    eprintln!("[DEBUG] Parsed entry: {} - {}", entry.timestamp, entry.message.chars().take(50).collect::<String>());
                    // Emit event to frontend
                    if let Err(e) = app_handle.emit("history-entry", &entry) {
                        eprintln!("Failed to emit history entry: {}", e);
                    } else {
                        eprintln!("[DEBUG] Successfully emitted entry");
                    }
                } else {
                    // Invalid JSON - log but continue
                    eprintln!("Failed to parse history line: {}", line.trim());
                }
            }
            Err(e) => {
                // Read error - log and retry after delay
                eprintln!("History read error: {}", e);
                sleep(Duration::from_millis(1000)).await;

                // Try to reopen file
                match File::open(&history_path) {
                    Ok(new_file) => {
                        let pos = reader.stream_position().unwrap_or(0);
                        reader = BufReader::new(new_file);
                        let _ = reader.seek(SeekFrom::Start(pos));
                    }
                    Err(e) => {
                        eprintln!("Failed to reopen history file: {}", e);
                        sleep(Duration::from_millis(5000)).await;
                    }
                }
            }
        }
    }
}

fn parse_history_line(line: &str) -> Result<HistoryEntry, serde_json::Error> {
    // Parse the JSONL entry
    let json: serde_json::Value = serde_json::from_str(line.trim())?;

    // Extract fields (adapted to actual history.jsonl format)
    // The actual format has: display, timestamp (unix ms), project, sessionId, pastedContents

    // Convert Unix timestamp (milliseconds) to readable format
    let timestamp_str = if let Some(ts) = json.get("timestamp").and_then(|v| v.as_i64()) {
        // Convert Unix timestamp (ms) to HH:MM:SS format
        use chrono::{DateTime, Local};
        if let Some(datetime) = DateTime::from_timestamp_millis(ts) {
            // Convert to local time and format as HH:MM:SS
            let local: DateTime<Local> = datetime.into();
            local.format("%H:%M:%S").to_string()
        } else {
            ts.to_string()
        }
    } else {
        "unknown".to_string()
    };

    // Extract agent from project path (e.g., "/path/to/agents/ana" -> "ana")
    let agent = json.get("project")
        .and_then(|v| v.as_str())
        .and_then(|path| {
            // Split by '/' and find "agents" segment, then get the next one
            let parts: Vec<&str> = path.split('/').collect();
            if let Some(agents_idx) = parts.iter().position(|&p| p == "agents") {
                if agents_idx + 1 < parts.len() {
                    return Some(parts[agents_idx + 1].to_string());
                }
            }
            None
        });

    // Get the display message
    let display = json.get("display")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Determine entry type based on content
    let entry_type = if display.starts_with('/') {
        "command"
    } else if json.get("pastedContents").is_some() {
        "user"
    } else {
        "message"
    };

    let entry = HistoryEntry {
        timestamp: timestamp_str,
        agent: agent,
        message: display,
        entry_type: entry_type.to_string(),
    };

    Ok(entry)
}

#[tauri::command]
pub async fn stop_history_stream() -> Result<(), String> {
    // Mark as not streaming
    STREAMING.store(false, Ordering::Relaxed);
    Ok(())
}
