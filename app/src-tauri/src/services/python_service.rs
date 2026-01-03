use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use serde_json::{json, Value};

pub struct PythonService {
    child: Child,
    stdin: BufWriter<std::process::ChildStdin>,
    stdout: BufReader<std::process::ChildStdout>,
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
        let stdout = BufReader::new(
            child.stdout.take().ok_or("Failed to capture stdout")?
        );

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

        // Read response with timeout
        let mut line = String::new();
        self.stdout.read_line(&mut line)
            .map_err(|e| format!("Failed to read response: {}", e))?;

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
