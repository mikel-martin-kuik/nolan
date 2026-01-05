use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use serde_json::{json, Value};

pub struct PythonService {
    child: Child,
    stdin: BufWriter<std::process::ChildStdin>,
    stdout: Arc<Mutex<BufReader<std::process::ChildStdout>>>,
}

impl PythonService {
    pub fn new(script_path: &Path) -> Result<Self, String> {
        // Get transcript service directory and construct venv Python path
        let service_dir = script_path.parent()
            .ok_or("Invalid script path")?;
        let venv_python = service_dir.join(".venv/bin/python3");

        // Use venv Python if it exists, otherwise fall back to system Python
        let python_path = if venv_python.exists() {
            venv_python
        } else {
            Path::new("python3").to_path_buf()
        };

        // CRITICAL: Validate Python version before spawning
        validate_python_version(&python_path)?;

        // Spawn process with error handling
        let mut child = Command::new(&python_path)
            .arg(script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn Python service: {}", e))?;

        let stdin = BufWriter::new(
            child.stdin.take().ok_or("Failed to capture stdin")?
        );
        let stdout = Arc::new(Mutex::new(BufReader::new(
            child.stdout.take().ok_or("Failed to capture stdout")?
        )));

        Ok(Self { child, stdin, stdout })
    }

    pub fn call_rpc(&mut self, method: &str, params: Value) -> Result<Value, String> {
        // Build JSON RPC request
        let request = json!({
            "jsonrpc": "2.0",
            "id": uuid::Uuid::new_v4().to_string(),
            "method": method,
            "params": params,
        });

        // Write with error handling
        serde_json::to_writer(&mut self.stdin, &request)
            .map_err(|e| format!("Failed to write request: {}", e))?;
        self.stdin.write_all(b"\n")
            .map_err(|e| format!("Failed to write newline: {}", e))?;
        self.stdin.flush()
            .map_err(|e| format!("Failed to flush: {}", e))?;

        // Read response with 15-second timeout protection
        // Use channel-based approach to add timeout to blocking I/O
        let (tx, rx) = mpsc::channel();
        let stdout_clone = Arc::clone(&self.stdout);

        thread::spawn(move || {
            let mut line = String::new();
            let result = match stdout_clone.lock() {
                Ok(mut reader) => reader.read_line(&mut line),
                Err(_) => {
                    // Handle poisoned mutex (occurs if previous thread panicked while holding lock)
                    // Send error through channel instead of propagating panic
                    // This prevents deadlock and allows graceful error handling at the call site
                    let _ = tx.send((String::new(), Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "Mutex poisoned"
                    ))));
                    return;
                }
            };
            let _ = tx.send((line, result));
        });

        // Wait for result with timeout
        let (line, read_result) = rx.recv_timeout(Duration::from_secs(15))
            .map_err(|_| "RPC timeout: Python service did not respond within 15 seconds".to_string())?;

        read_result.map_err(|e| format!("Failed to read response: {}", e))?;

        // Parse and validate response
        let response: Value = serde_json::from_str(&line)
            .map_err(|e| format!("Invalid JSON response: {}", e))?;

        if let Some(error) = response.get("error") {
            return Err(format!("RPC error: {}", error));
        }

        response.get("result")
            .cloned()
            .ok_or_else(|| "Missing result field".to_string())
    }
}

impl Drop for PythonService {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn validate_python_version(python_path: &Path) -> Result<(), String> {
    let output = Command::new(python_path)
        .args(&["--version"])
        .output()
        .map_err(|e| format!("Failed to check Python version: {}", e))?;

    let version_str = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = version_str
        .trim()
        .strip_prefix("Python ")
        .ok_or("Invalid Python version format")?
        .split('.')
        .collect();

    let major: u32 = parts.get(0).and_then(|s| s.parse().ok())
        .ok_or("Invalid major version")?;
    let minor: u32 = parts.get(1).and_then(|s| s.parse().ok())
        .ok_or("Invalid minor version")?;

    if major < 3 || (major == 3 && minor < 10) {
        return Err(format!(
            "Python 3.10+ required, found {}.{}",
            major, minor
        ));
    }

    Ok(())
}
