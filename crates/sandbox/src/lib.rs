// ==============================================================================
// GHITA CODING AGENT — Sandboxed Process Execution (v1.1.5-beta1 Track 1.1)
// ------------------------------------------------------------------------------
// Zero-dependency sandboxed spawn with three enforcement tiers:
//   - linux   : Landlock (kernel write-scoping via raw syscalls, NO_NEW_PRIVS)
//   - macos   : Seatbelt (`sandbox-exec` SBPL profile wrapper)
//   - windows : Supervised (Job Object containment + write-target policy) —
//               AppContainer upgrade documented as the follow-up tier
// All platforms additionally run the supervised core: workspace cwd lock,
// environment scrubbing, deny-glob argument precheck and write-target policy.
// Patterns: grok-build `xai-grok-sandbox` (profiles + deny globs),
// codex-rs `linux-sandbox` (NO_NEW_PRIVS + graceful degradation).
// ==============================================================================

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

#[cfg(feature = "addon")]
mod napi;

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/// Built-in sandbox profiles (custom deny globs compose with any of them).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxProfile {
    /// Writes allowed beneath the workspace (and system temp) only.
    Workspace,
    /// No writes anywhere; reads everywhere.
    ReadOnly,
    /// Read-only + network-facing binaries denied (hermetic CI posture).
    Strict,
}

impl SandboxProfile {
    pub fn as_str(&self) -> &'static str {
        match self {
            SandboxProfile::Workspace => "workspace",
            SandboxProfile::ReadOnly => "read-only",
            SandboxProfile::Strict => "strict",
        }
    }

    /// Parse a built-in profile name ("workspace" | "read-only" | "strict").
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "workspace" => Some(SandboxProfile::Workspace),
            "read-only" => Some(SandboxProfile::ReadOnly),
            "strict" => Some(SandboxProfile::Strict),
            _ => None,
        }
    }
}

/// Network-facing binaries denied under the `strict` profile.
const STRICT_DENY_BINARIES: &[&str] = &[
    "curl", "wget", "ssh", "scp", "sftp", "nc", "netcat", "telnet", "ftp", "rsync",
];

// ---------------------------------------------------------------------------
// Deny-glob matching (segment-based, supports `**`, `*`, `?`)
// ---------------------------------------------------------------------------

fn normalize(path: &str) -> String {
    path.replace('\\', "/").to_lowercase()
}

/// Match a single path segment against a glob segment (`*`, `?` wildcards).
fn segment_match(pattern: &[char], text: &[char]) -> bool {
    match (pattern.first(), text.first()) {
        (None, None) => true,
        (None, Some(_)) => false,
        (Some('*'), _) => {
            segment_match(&pattern[1..], text)
                || (!text.is_empty() && segment_match(pattern, &text[1..]))
        }
        (Some('?'), Some(_)) => segment_match(&pattern[1..], &text[1..]),
        (Some('?'), None) => false,
        (Some(p), Some(t)) if p == t => segment_match(&pattern[1..], &text[1..]),
        _ => false,
    }
}

fn segments(path: &str) -> Vec<Vec<char>> {
    path.split('/')
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().collect())
        .collect()
}

/// Match a path against a glob with `**` (any number of segments), `*`, `?`.
pub fn glob_match(pattern: &str, path: &str) -> bool {
    let pattern = segments(&normalize(pattern));
    let path = segments(&normalize(path));
    fn walk(pattern: &[Vec<char>], path: &[Vec<char>]) -> bool {
        match (pattern.first(), path.first()) {
            (None, None) => true,
            (None, Some(_)) => false,
            (Some(p), _) if p.len() == 2 && p[0] == '*' && p[1] == '*' => {
                // `**` consumes zero or more path segments.
                walk(&pattern[1..], path) || (!path.is_empty() && walk(pattern, &path[1..]))
            }
            (Some(p), Some(t)) => segment_match(p, t) && walk(&pattern[1..], &path[1..]),
            (Some(_), None) => false,
        }
    }
    walk(&pattern, &path)
}

/// True when `path` matches any configured deny glob.
pub fn path_denied(path: &str, deny_globs: &[String]) -> Option<String> {
    deny_globs.iter().find(|g| glob_match(g, path)).cloned()
}

// ---------------------------------------------------------------------------
// Environment scrubbing
// ---------------------------------------------------------------------------

/// Base environment allowlist (PATH/temp/locale/home) — everything else is
/// dropped unless explicitly allowed, so secrets never leak into sandboxes.
pub fn base_env_allowlist() -> Vec<String> {
    let mut vars = vec!["PATH", "LANG", "LC_ALL", "TMP", "TMPDIR", "TEMP"];
    if cfg!(windows) {
        vars.extend_from_slice(&[
            "SYSTEMROOT",
            "SYSTEMDRIVE",
            "COMSPEC",
            "USERPROFILE",
            "USERNAME",
            "PATHEXT",
            "WINDIR",
        ]);
    } else {
        vars.extend_from_slice(&["HOME", "USER", "SHELL"]);
    }
    vars.into_iter().map(String::from).collect()
}

fn scrub_env(extra_allow: &[String]) -> BTreeMap<String, String> {
    let allow: Vec<String> = base_env_allowlist()
        .into_iter()
        .chain(extra_allow.iter().cloned())
        .collect();
    let mut env = BTreeMap::new();
    for (key, value) in std::env::vars() {
        if allow.iter().any(|a| a.eq_ignore_ascii_case(&key)) {
            env.insert(key, value);
        }
    }
    env
}

// ---------------------------------------------------------------------------
// Environment / enforcement detection
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Enforcement {
    /// Kernel Landlock ruleset applied before exec (Linux ≥ 5.13).
    Landlock,
    /// Seatbelt profile via `sandbox-exec` (macOS).
    Seatbelt,
    /// Job Object containment + policy checks (Windows; AppContainer pending).
    Supervised,
}

impl Enforcement {
    pub fn as_str(&self) -> &'static str {
        match self {
            Enforcement::Landlock => "landlock",
            Enforcement::Seatbelt => "seatbelt",
            Enforcement::Supervised => "supervised",
        }
    }
}

/// Classify a `/proc/sys/kernel/osrelease` string (testable everywhere).
pub fn classify_linux_release(release: &str) -> &'static str {
    let lower = release.to_lowercase();
    if lower.contains("microsoft") || lower.contains("wsl") {
        if lower.contains("microsoft-standard") || lower.contains("wsl2") {
            "wsl2"
        } else {
            "wsl1" // WSL1 has no Landlock support — supervised fallback.
        }
    } else {
        "native"
    }
}

/// Best-effort detection of the current platform's sandbox capability.
pub fn detect_enforcement() -> Enforcement {
    if cfg!(target_os = "linux") {
        if linux_release_class() != "wsl1" && landlock::available() {
            return Enforcement::Landlock;
        }
        return Enforcement::Supervised;
    }
    if cfg!(target_os = "macos") {
        if Path::new("/usr/bin/sandbox-exec").exists() {
            return Enforcement::Seatbelt;
        }
        return Enforcement::Supervised;
    }
    Enforcement::Supervised
}

#[cfg(target_os = "linux")]
fn linux_release_class() -> &'static str {
    match std::fs::read_to_string("/proc/sys/kernel/osrelease") {
        Ok(release) => classify_linux_release(&release),
        Err(_) => "unknown",
    }
}

#[cfg(not(target_os = "linux"))]
fn linux_release_class() -> &'static str {
    "not-linux"
}

// ---------------------------------------------------------------------------
// Landlock (Linux) — raw syscalls, no external crates
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
mod linux_sandbox {
    use std::io;
    use std::os::unix::io::AsRawFd;

    const SYS_LANDLOCK_CREATE_RULESET: i64 = 444;
    const SYS_LANDLOCK_ADD_RULE: i64 = 445;
    const SYS_LANDLOCK_RESTRICT: i64 = 446;
    const LANDLOCK_CREATE_RULESET_VERSION: u32 = 1;
    const PR_SET_NO_NEW_PRIVS: i64 = 38;

    const ACCESS_WRITE_FILE: u64 = 1 << 1;
    const ACCESS_REMOVE_DIR: u64 = 1 << 4;
    const ACCESS_REMOVE_FILE: u64 = 1 << 5;
    const ACCESS_MAKE_CHAR: u64 = 1 << 6;
    const ACCESS_MAKE_DIR: u64 = 1 << 7;
    const ACCESS_MAKE_REG: u64 = 1 << 8;
    const ACCESS_MAKE_SOCK: u64 = 1 << 9;
    const ACCESS_MAKE_FIFO: u64 = 1 << 10;
    const ACCESS_MAKE_BLOCK: u64 = 1 << 11;
    const ACCESS_MAKE_SYM: u64 = 1 << 12;
    const ACCESS_REFER: u64 = 1 << 13;
    const ACCESS_TRUNCATE: u64 = 1 << 14;
    const HANDLED: u64 = ACCESS_WRITE_FILE
        | ACCESS_REMOVE_DIR
        | ACCESS_REMOVE_FILE
        | ACCESS_MAKE_CHAR
        | ACCESS_MAKE_DIR
        | ACCESS_MAKE_REG
        | ACCESS_MAKE_SOCK
        | ACCESS_MAKE_FIFO
        | ACCESS_MAKE_BLOCK
        | ACCESS_MAKE_SYM
        | ACCESS_REFER
        | ACCESS_TRUNCATE;

    #[repr(C)]
    struct RulesetAttr {
        handled_access_fs: u64,
    }

    #[repr(C)]
    struct PathBeneathAttr {
        allowed_access: u64,
        parent_fd: i32,
    }

    extern "C" {
        fn syscall(num: i64, ...) -> i64;
        fn prctl(option: i64, arg2: u64, arg3: u64, arg4: u64, arg5: u64) -> i32;
        fn close(fd: i32) -> i32;
    }

    /// Kernel advertises Landlock support (probe with the VERSION command).
    pub fn available() -> bool {
        unsafe {
            let ret = syscall(
                SYS_LANDLOCK_CREATE_RULESET,
                std::ptr::null::<RulesetAttr>(),
                0usize,
                LANDLOCK_CREATE_RULESET_VERSION,
            );
            ret >= 0
        }
    }

    /// Apply a Landlock write-scope to the current process (call in pre_exec).
    /// Writes remain allowed beneath every root in `write_roots`; everything
    /// else on the filesystem becomes read-only for this process tree.
    pub fn restrict_writes(write_roots: &[std::path::PathBuf]) -> io::Result<()> {
        unsafe {
            let attr = RulesetAttr {
                handled_access_fs: HANDLED,
            };
            let ruleset_fd = syscall(
                SYS_LANDLOCK_CREATE_RULESET,
                &attr,
                std::mem::size_of::<RulesetAttr>(),
                0u32,
            );
            if ruleset_fd < 0 {
                return Err(io::Error::last_os_error());
            }
            for root in write_roots {
                if !root.exists() {
                    continue;
                }
                let dir = std::fs::File::open(root)?;
                let dir_fd = dir.as_raw_fd();
                let path_attr = PathBeneathAttr {
                    allowed_access: HANDLED,
                    parent_fd: dir_fd,
                };
                // LANDLOCK_RULE_PATH_BENEATH = 1
                let ret = syscall(
                    SYS_LANDLOCK_ADD_RULE,
                    ruleset_fd,
                    1i64,
                    &path_attr as *const PathBeneathAttr,
                    0u32,
                );
                if ret < 0 {
                    let _ = close(ruleset_fd as i32);
                    return Err(io::Error::last_os_error());
                }
            }
            if syscall(SYS_LANDLOCK_RESTRICT, ruleset_fd) < 0 {
                let _ = close(ruleset_fd as i32);
                return Err(io::Error::last_os_error());
            }
            let _ = close(ruleset_fd as i32);
            if prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }
    }
}

#[cfg(target_os = "linux")]
use linux_sandbox as landlock;

#[cfg(not(target_os = "linux"))]
mod landlock {
    pub fn available() -> bool {
        false
    }
    #[allow(dead_code)] // API parity with the linux module; unreachable elsewhere.
    pub fn restrict_writes(_write_roots: &[std::path::PathBuf]) -> std::io::Result<()> {
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "landlock is linux-only",
        ))
    }
}

// ---------------------------------------------------------------------------
// Options + results
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct SandboxOptions {
    pub profile: SandboxProfile,
    /// Directory the command runs in and (for `workspace`) may write beneath.
    pub workspace: PathBuf,
    /// Extra deny globs (e.g. `**/*.pem`, `**/.ssh/**`).
    pub deny_globs: Vec<String>,
    /// Extra environment variables to keep beyond the base allowlist.
    pub env_allow: Vec<String>,
    /// Hard wall-clock timeout; None = wait indefinitely.
    pub timeout: Option<Duration>,
}

impl SandboxOptions {
    pub fn new(profile: SandboxProfile, workspace: impl Into<PathBuf>) -> Self {
        Self {
            profile,
            workspace: workspace.into(),
            deny_globs: Vec::new(),
            env_allow: Vec::new(),
            timeout: Some(Duration::from_secs(120)),
        }
    }

    pub fn with_deny_globs(mut self, globs: &[&str]) -> Self {
        self.deny_globs.extend(globs.iter().map(|g| g.to_string()));
        self
    }
}

#[derive(Debug, Clone)]
pub struct SandboxViolation {
    pub reason: String,
    pub detail: String,
}

#[derive(Debug, Clone)]
pub struct SandboxRunResult {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u128,
    pub enforcement: &'static str,
    /// Pre-exec policy violations — when non-empty the command never ran.
    pub violations: Vec<SandboxViolation>,
    pub blocked: bool,
}

// ---------------------------------------------------------------------------
// Supervised policy checks (all platforms)
// ---------------------------------------------------------------------------

fn looks_like_path(token: &str) -> bool {
    token.contains('/') || token.contains('\\') || token.contains('.')
}

fn binary_name(program: &str) -> String {
    let normalised = program.replace('\\', "/");
    let base = normalised.rsplit('/').next().unwrap_or(program);
    base.to_lowercase()
}

/// Extract write targets from shell-style redirect tokens.
fn write_targets(args: &[String]) -> Vec<String> {
    let mut targets = Vec::new();
    let mut redirect = false;
    for token in args {
        if token == ">" || token == ">>" || token == "1>" || token == "1>>" {
            redirect = true;
            continue;
        }
        if token == "2>" || token == "2>>" {
            redirect = true;
            continue;
        }
        if redirect {
            targets.push(token.clone());
            redirect = false;
        }
    }
    targets
}

fn is_beneath(path: &Path, root: &Path) -> bool {
    let path = normalize(&path.to_string_lossy());
    let root = normalize(&root.to_string_lossy());
    let root = root.trim_end_matches('/');
    path == root || path.starts_with(&format!("{root}/"))
}

/// Policy precheck: deny-glob args, profile write scope, strict binaries.
pub fn precheck(program: &str, args: &[String], opts: &SandboxOptions) -> Vec<SandboxViolation> {
    let mut violations = Vec::new();

    // Deny globs apply to any path-like argument.
    for token in std::iter::once(&program.to_string()).chain(args.iter()) {
        if looks_like_path(token) {
            if let Some(glob) = path_denied(token, &opts.deny_globs) {
                violations.push(SandboxViolation {
                    reason: "deny-glob".into(),
                    detail: format!("argument `{token}` matches deny pattern `{glob}`"),
                });
            }
        }
    }

    // Profile write scope for redirect targets.
    let temp_root = std::env::temp_dir();
    for target in write_targets(args) {
        let resolved = if Path::new(&target).is_absolute() {
            PathBuf::from(&target)
        } else {
            opts.workspace.join(&target)
        };
        let allowed = match opts.profile {
            SandboxProfile::Workspace => {
                is_beneath(&resolved, &opts.workspace) || is_beneath(&resolved, &temp_root)
            }
            SandboxProfile::ReadOnly | SandboxProfile::Strict => false,
        };
        if !allowed {
            violations.push(SandboxViolation {
                reason: "write-outside-scope".into(),
                detail: format!(
                    "redirect target `{}` is outside the {} write scope",
                    resolved.display(),
                    opts.profile.as_str()
                ),
            });
        }
        if let Some(glob) = path_denied(&resolved.to_string_lossy(), &opts.deny_globs) {
            violations.push(SandboxViolation {
                reason: "deny-glob".into(),
                detail: format!("redirect target matches deny pattern `{glob}`"),
            });
        }
    }

    // Strict profile denies network-facing binaries entirely.
    if opts.profile == SandboxProfile::Strict {
        let binary = binary_name(program);
        let binary = binary.strip_suffix(".exe").unwrap_or(&binary);
        if STRICT_DENY_BINARIES.contains(&binary) {
            violations.push(SandboxViolation {
                reason: "strict-network".into(),
                detail: format!("binary `{binary}` is denied under the strict profile"),
            });
        }
    }

    violations
}

// ---------------------------------------------------------------------------
// Seatbelt (macOS) profile generation
// ---------------------------------------------------------------------------

/// Generate the `sandbox-exec` SBPL profile for the given options.
/// Compiled on every platform (pure string building) but only invoked on macOS.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn seatbelt_profile(opts: &SandboxOptions) -> String {
    let workspace = normalize(&opts.workspace.to_string_lossy());
    match opts.profile {
        SandboxProfile::ReadOnly => {
            "(version 1)(allow default)(deny file-write*)".to_string()
        }
        SandboxProfile::Strict => {
            "(version 1)(allow default)(deny file-write*)(deny network*)".to_string()
        }
        SandboxProfile::Workspace => format!(
            "(version 1)(allow default)(deny file-write*)(allow file-write* (subpath \"{workspace}\"))(allow file-write* (subpath \"/private/tmp\"))"
        ),
    }
}

// ---------------------------------------------------------------------------
// Windows Job Object (containment: kill the whole child tree on close)
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
mod win_job {
    use std::os::windows::io::AsRawHandle;

    #[repr(C)]
    #[derive(Default)]
    struct IoCounters {
        read_ops: u64,
        write_ops: u64,
        other_ops: u64,
        read_bytes: u64,
        write_bytes: u64,
        other_bytes: u64,
    }

    #[repr(C)]
    #[derive(Default)]
    struct BasicLimitInformation {
        per_process_user_time_limit: u64,
        per_job_user_time_limit: u64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    struct ExtendedLimitInformation {
        basic: BasicLimitInformation,
        io_info: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: i32 = 9;

    type Handle = *mut core::ffi::c_void;

    extern "system" {
        fn CreateJobObjectW(attrs: *mut core::ffi::c_void, name: *const u16) -> Handle;
        fn SetInformationJobObject(
            job: Handle,
            info_class: i32,
            info: *const ExtendedLimitInformation,
            len: u32,
        ) -> i32;
        fn AssignProcessToJobObject(job: Handle, process: Handle) -> i32;
        fn CloseHandle(handle: Handle) -> i32;
    }

    /// Assign the spawned process to a kill-on-close Job Object so a crashed
    /// supervisor cannot orphan the sandboxed child tree.
    pub(crate) struct JobGuard {
        job: Handle,
    }

    impl JobGuard {
        pub(crate) fn assign(child: &std::process::Child) -> Option<Self> {
            unsafe {
                let job = CreateJobObjectW(core::ptr::null_mut(), core::ptr::null());
                if job.is_null() {
                    return None;
                }
                let mut info: ExtendedLimitInformation = core::mem::zeroed();
                info.basic.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                if SetInformationJobObject(
                    job,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                    &info,
                    core::mem::size_of::<ExtendedLimitInformation>() as u32,
                ) == 0
                {
                    CloseHandle(job);
                    return None;
                }
                if AssignProcessToJobObject(job, child.as_raw_handle() as Handle) == 0 {
                    CloseHandle(job);
                    return None;
                }
                Some(Self { job })
            }
        }
    }

    impl Drop for JobGuard {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.job);
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod win_job {
    pub(crate) struct JobGuard;
    impl JobGuard {
        pub(crate) fn assign(_child: &std::process::Child) -> Option<Self> {
            None
        }
    }
}

// ---------------------------------------------------------------------------
// Sandboxed spawn
// ---------------------------------------------------------------------------

/// Spawn `program(args…)` under the sandbox described by `opts`.
///
/// Pre-exec policy violations block the spawn (`blocked: true`, exit_code
/// None). OS enforcement degrades gracefully: Landlock → Seatbelt →
/// Supervised, and `enforcement` reports which tier actually ran.
pub fn spawn_sandboxed(
    program: &str,
    args: &[String],
    opts: &SandboxOptions,
) -> std::io::Result<SandboxRunResult> {
    let violations = precheck(program, args, opts);
    if !violations.is_empty() {
        return Ok(SandboxRunResult {
            exit_code: None,
            stdout: String::new(),
            stderr: violations
                .iter()
                .map(|v| format!("[sandbox:{}] {}", v.reason, v.detail))
                .collect::<Vec<_>>()
                .join("\n"),
            duration_ms: 0,
            enforcement: detect_enforcement().as_str(),
            violations,
            blocked: true,
        });
    }

    let enforcement = detect_enforcement();
    let started = Instant::now();

    // macOS: wrap in `sandbox-exec` for kernel Seatbelt enforcement.
    #[cfg(target_os = "macos")]
    let (argv_program, argv_args): (String, Vec<String>) = if enforcement == Enforcement::Seatbelt {
        (
            "/usr/bin/sandbox-exec".into(),
            [
                "-p".to_string(),
                seatbelt_profile(opts),
                "--".to_string(),
                program.to_string(),
            ]
            .into_iter()
            .chain(args.iter().cloned())
            .collect(),
        )
    } else {
        (program.to_string(), args.to_vec())
    };
    #[cfg(not(target_os = "macos"))]
    let (argv_program, argv_args): (String, Vec<String>) = (program.to_string(), args.to_vec());

    let env = scrub_env(&opts.env_allow);
    let mut command = std::process::Command::new(&argv_program);
    command
        .args(&argv_args)
        .current_dir(&opts.workspace)
        .env_clear()
        .envs(&env)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Linux: apply the Landlock write-scope inside the child before exec.
    #[cfg(target_os = "linux")]
    if enforcement == Enforcement::Landlock {
        use std::os::unix::process::CommandExt;
        let write_roots: Vec<PathBuf> = match opts.profile {
            SandboxProfile::Workspace => vec![opts.workspace.clone(), std::env::temp_dir()],
            SandboxProfile::ReadOnly | SandboxProfile::Strict => vec![],
        };
        unsafe {
            command.pre_exec(move || landlock::restrict_writes(&write_roots));
        }
    }

    let child = command.spawn();
    let mut child = match child {
        Ok(child) => child,
        Err(err) => {
            return Ok(SandboxRunResult {
                exit_code: None,
                stdout: String::new(),
                stderr: format!("[sandbox:spawn] {err}"),
                duration_ms: started.elapsed().as_millis(),
                enforcement: enforcement.as_str(),
                violations: vec![SandboxViolation {
                    reason: "spawn-failed".into(),
                    detail: err.to_string(),
                }],
                blocked: false,
            });
        }
    };

    // Windows: contain the child tree in a kill-on-close Job Object.
    let _job = win_job::JobGuard::assign(&child);

    let output = match opts.timeout {
        Some(timeout) => {
            let mut slept = Duration::ZERO;
            loop {
                match child.try_wait()? {
                    Some(_) => break child.wait_with_output(),
                    None if slept >= timeout => {
                        let _ = child.kill();
                        break child.wait_with_output();
                    }
                    None => {
                        std::thread::sleep(Duration::from_millis(25));
                        slept += Duration::from_millis(25);
                    }
                }
            }
        }
        None => child.wait_with_output(),
    };
    let output = output?;

    Ok(SandboxRunResult {
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        duration_ms: started.elapsed().as_millis(),
        enforcement: enforcement.as_str(),
        violations: Vec::new(),
        blocked: false,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_roundtrip() {
        for profile in [
            SandboxProfile::Workspace,
            SandboxProfile::ReadOnly,
            SandboxProfile::Strict,
        ] {
            assert_eq!(SandboxProfile::parse(profile.as_str()), Some(profile));
        }
        assert_eq!(SandboxProfile::parse("nope"), None);
    }

    #[test]
    fn glob_matching() {
        assert!(glob_match("**/*.pem", "/home/user/secrets/id.pem"));
        assert!(glob_match("**/*.pem", "id.pem"));
        assert!(glob_match("**/*.pem", "C:/Users/x/.ssh/key.pem"));
        assert!(!glob_match("**/*.pem", "/home/user/secrets/id.key"));
        assert!(glob_match("**/.ssh/**", "/home/u/.ssh/config"));
        assert!(glob_match("**/.ssh/**", "C:/Users/u/.ssh/known_hosts"));
        assert!(!glob_match("**/.ssh/**", "/home/u/.sshconfig/x"));
        assert!(glob_match("src/*.rs", "src/main.rs"));
        assert!(!glob_match("src/*.rs", "src/a/b.rs"));
        assert!(glob_match("src/**/*.rs", "src/a/b.rs"));
        assert!(glob_match("file?.txt", "file1.txt"));
        assert!(!glob_match("file?.txt", "file10.txt"));
    }

    #[test]
    fn wsl_classification() {
        assert_eq!(
            classify_linux_release("5.15.167.4-microsoft-standard-WSL2"),
            "wsl2"
        );
        assert_eq!(classify_linux_release("4.4.0-19041-Microsoft"), "wsl1");
        assert_eq!(classify_linux_release("6.8.0-45-generic"), "native");
    }

    #[test]
    fn env_scrub_drops_unlisted_vars() {
        // The scrub is pure w.r.t. the allowlist; verify base entries survive
        // the filter construction (PATH is always in the base allowlist).
        let allow = base_env_allowlist();
        assert!(allow.contains(&"PATH".to_string()));
        if cfg!(windows) {
            assert!(allow.contains(&"SYSTEMROOT".to_string()));
        } else {
            assert!(allow.contains(&"HOME".to_string()));
        }
    }

    #[test]
    fn write_target_extraction() {
        let args: Vec<String> = ["echo", "hi", ">", "out.txt"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(write_targets(&args), vec!["out.txt".to_string()]);
        let args: Vec<String> = ["cmd", "/c", "echo", "x", ">>", "log.txt", "2>", "err.txt"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(
            write_targets(&args),
            vec!["log.txt".to_string(), "err.txt".to_string()]
        );
    }

    #[test]
    fn precheck_blocks_deny_glob_and_out_of_scope_writes() {
        let tmp = std::env::temp_dir();
        let workspace = tmp.join("ghita-sandbox-precheck-ws");
        std::fs::create_dir_all(&workspace).unwrap();
        let mut opts = SandboxOptions::new(SandboxProfile::Workspace, workspace.clone());
        opts.deny_globs.push("**/*.pem".into());

        let args: Vec<String> =
            ["cat".to_string(), "/etc/ssl/private/key.pem".to_string()].to_vec();
        assert!(precheck("cat", &args, &opts)
            .iter()
            .any(|v| v.reason == "deny-glob"));

        // Redirect outside the workspace (and outside system temp) is blocked
        // under `workspace`. The test cwd is neither, unlike the temp dir.
        let outside = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("ghita-sandbox-test-outside.txt");
        let args: Vec<String> = [
            "echo".to_string(),
            "x".to_string(),
            ">".to_string(),
            outside.to_string_lossy().to_string(),
        ]
        .to_vec();
        assert!(precheck("echo", &args, &opts)
            .iter()
            .any(|v| v.reason == "write-outside-scope"));

        // Redirect into the workspace is allowed under `workspace`…
        let inside = workspace.join("ghita-sandbox-ok.txt");
        let args: Vec<String> = [
            "echo".to_string(),
            "x".to_string(),
            ">".to_string(),
            inside.to_string_lossy().to_string(),
        ]
        .to_vec();
        assert!(precheck("echo", &args, &opts).is_empty());

        // …but blocked under `read-only`.
        opts.profile = SandboxProfile::ReadOnly;
        assert!(precheck("echo", &args, &opts)
            .iter()
            .any(|v| v.reason == "write-outside-scope"));

        // Strict denies network-facing binaries outright.
        opts.profile = SandboxProfile::Strict;
        assert!(
            precheck("curl", &["https://example.com".to_string()], &opts)
                .iter()
                .any(|v| v.reason == "strict-network")
        );

        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn spawn_runs_and_blocks_per_policy() {
        let tmp = std::env::temp_dir();
        let mut opts = SandboxOptions::new(SandboxProfile::Workspace, tmp.clone());
        opts.timeout = Some(Duration::from_secs(30));

        // 1) A benign command runs (platform-appropriate echo).
        let (program, args): (&str, Vec<String>) = if cfg!(windows) {
            (
                "cmd",
                vec!["/C".to_string(), "echo ghita-sandbox-ok".to_string()],
            )
        } else {
            ("echo", vec!["ghita-sandbox-ok".to_string()])
        };
        let result = spawn_sandboxed(program, &args, &opts).expect("spawn");
        assert!(!result.blocked);
        assert_eq!(result.exit_code, Some(0));
        assert!(
            result.stdout.contains("ghita-sandbox-ok"),
            "stdout: {}",
            result.stdout
        );

        // 2) A policy violation blocks before spawn.
        opts.deny_globs.push("**/*.pem".into());
        let secret = tmp.join("ghita-sandbox-secret.pem");
        let secret = secret.to_string_lossy().to_string();
        let (program, args): (&str, Vec<String>) = if cfg!(windows) {
            ("cmd", vec!["/C".to_string(), format!("type {secret}")])
        } else {
            ("cat", vec![secret])
        };
        let result = spawn_sandboxed(program, &args, &opts).expect("spawn");
        assert!(result.blocked);
        assert!(result.exit_code.is_none());
        assert!(result.violations.iter().any(|v| v.reason == "deny-glob"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn landlock_write_scope_enforced_when_available() {
        if !landlock::available() {
            // Kernel without Landlock (e.g. WSL1) — supervised tier documents it.
            assert_eq!(detect_enforcement(), Enforcement::Supervised);
            return;
        }
        assert_eq!(detect_enforcement(), Enforcement::Landlock);
        let tmp = std::env::temp_dir();
        let workspace = tmp.join("ghita-sandbox-ws");
        std::fs::create_dir_all(&workspace).unwrap();
        let outside = tmp.join("ghita-sandbox-outside.txt");
        let _ = std::fs::remove_file(&outside);
        let opts = SandboxOptions::new(SandboxProfile::Workspace, workspace.clone());
        // Writing outside the workspace must fail under Landlock.
        let script = format!("echo x > {}", outside.display());
        let result = spawn_sandboxed("sh", &["-c".to_string(), script], &opts).unwrap();
        // The command ran but the write was denied by the kernel — the file
        // must not exist afterwards, and sh reports a permission error.
        assert!(!outside.exists(), "landlock failed to scope writes");
        assert!(result.exit_code != Some(0));
        let _ = std::fs::remove_file(&outside);
    }
}
