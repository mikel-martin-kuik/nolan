use std::env;
use std::path::Path;
use std::process::Command;
use crate::utils::paths;

/// Result of script execution with structured output
#[derive(Debug, Clone)]
pub struct ScriptOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

impl ScriptOutput {
    /// Get user-facing message (stdout on success, stderr on failure)
    pub fn user_message(&self) -> String {
        if self.success {
            self.stdout.trim().to_string()
        } else {
            format!("Error (exit code {}): {}", self.exit_code, self.stderr.trim())
        }
    }

    /// Check if execution was successful
    pub fn is_success(&self) -> bool {
        self.success
    }
}

/// Execute a bash script with proper environment and error handling
pub fn execute_script(script_path: &Path, args: &[String]) -> Result<ScriptOutput, String> {
    // 1. Validate script path
    if !script_path.exists() {
        return Err(format!("Script not found: {:?}", script_path));
    }

    // 2. Get required paths using portable detection
    let home = env::var("HOME")
        .map_err(|_| "HOME environment variable not set")?;
    let nolan_app = paths::get_nolan_app_root()
        .map_err(|e| format!("Failed to get Nolan app root: {}", e))?;

    // 3. Build PATH with common locations
    let path = env::var("PATH").unwrap_or_else(|_|
        "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin".to_string()
    );

    // 4. Execute script with full environment
    let output = Command::new(script_path)
        .args(args)
        .current_dir(&nolan_app)      // CRITICAL: Set working directory to app root
        .env("HOME", &home)            // Pass HOME
        .env("PATH", &path)            // Pass PATH
        .env("SHELL", "/bin/bash")     // Ensure bash shell
        .env("NOLAN_APP_ROOT", nolan_app.to_string_lossy().as_ref()) // Portable app path
        .output()
        .map_err(|e| format!("Failed to execute script: {}", e))?;

    // 5. Build structured output
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);
    let success = output.status.success();

    Ok(ScriptOutput {
        success,
        stdout,
        stderr,
        exit_code,
    })
}

/// Execute a script and return Result based on exit code
pub fn execute_script_checked(script_path: &Path, args: &[String]) -> Result<String, String> {
    let output = execute_script(script_path, args)?;

    if output.success {
        Ok(output.stdout.trim().to_string())
    } else {
        Err(output.user_message())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_successful_script() {
        let dir = tempdir().unwrap();
        let script_path = dir.path().join("test.sh");

        {
            let mut file = File::create(&script_path).unwrap();
            writeln!(file, "#!/bin/bash\necho 'Success'").unwrap();
            // File is dropped here, ensuring it's closed
        }

        std::fs::set_permissions(&script_path,
            std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();

        // Small delay to avoid "Text file busy" race condition
        std::thread::sleep(std::time::Duration::from_millis(10));

        let result = execute_script(&script_path, &[]).unwrap();
        assert!(result.success);
        assert_eq!(result.stdout.trim(), "Success");
    }

    #[test]
    fn test_failing_script() {
        let dir = tempdir().unwrap();
        let script_path = dir.path().join("test.sh");

        {
            let mut file = File::create(&script_path).unwrap();
            writeln!(file, "#!/bin/bash\necho 'Error' >&2\nexit 1").unwrap();
            // File is dropped here, ensuring it's closed
        }

        std::fs::set_permissions(&script_path,
            std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();

        // Small delay to avoid "Text file busy" race condition
        std::thread::sleep(std::time::Duration::from_millis(10));

        let result = execute_script(&script_path, &[]).unwrap();
        assert!(!result.success);
        assert_eq!(result.exit_code, 1);
        assert_eq!(result.stderr.trim(), "Error");
    }
}
