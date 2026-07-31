use ghita_coding_agent_lib::{
    build_proxy_url, clamp_command_timeout, command_is_blocked, find_free_port,
    generate_session_token, resolve_shell_for_platform,
};
use std::collections::HashSet;

#[test]
fn session_tokens_are_unique_and_strongly_sized() {
    let mut seen = HashSet::new();
    for _ in 0..1_000 {
        let token = generate_session_token();
        assert_eq!(token.len(), 32);
        assert!(token.is_ascii());
        assert!(seen.insert(token), "duplicate session token");
    }
}

#[test]
fn proxy_url_rejects_injection_and_traversal() {
    for path in [
        "../etc/passwd",
        "..%2F..%2Fetc%2Fpasswd",
        "https://evil.example/",
        "user@example.com/",
        r"C:\Windows\System32",
    ] {
        assert!(
            build_proxy_url(8081, path).is_err(),
            "{path} must be rejected"
        );
    }
}

#[test]
fn proxy_url_accepts_safe_relative_paths() {
    for path in ["", "api/chat", "sessions/abc123", "health"] {
        let url = build_proxy_url(8081, path).expect("safe path");
        assert!(url.starts_with("http://127.0.0.1:8081/"));
        assert!(!url.contains(".."));
    }
}

#[test]
fn free_port_is_immediately_bindable() {
    let chosen = find_free_port(45_000).expect("expected a free port");
    assert!(chosen >= 45_000);
    let listener = std::net::TcpListener::bind(("127.0.0.1", chosen))
        .expect("returned port should remain bindable");
    drop(listener);
}

#[test]
fn shell_resolution_matches_the_target_platform() {
    assert_eq!(resolve_shell_for_platform("powershell"), "powershell.exe");
    assert_eq!(resolve_shell_for_platform("cmd"), "cmd.exe");
    if cfg!(target_os = "windows") {
        assert_eq!(resolve_shell_for_platform("bash"), "powershell.exe");
        assert_eq!(resolve_shell_for_platform("sh"), "powershell.exe");
    } else {
        assert_eq!(resolve_shell_for_platform("bash"), "bash");
        assert_eq!(resolve_shell_for_platform("sh"), "sh");
    }
}

#[test]
fn native_command_gate_blocks_destructive_commands() {
    for command in [
        "rm -rf /",
        "rm -rf ~",
        "mkfs.ext4 /dev/sda",
        "dd if=image.iso of=/dev/sda",
        "format C:",
        "Remove-Item C:\\ -Recurse",
        "shutdown /s",
    ] {
        assert!(command_is_blocked(command), "{command} must be blocked");
    }
    for command in ["git status", "pnpm test", "echo hello"] {
        assert!(
            !command_is_blocked(command),
            "{command} should remain available"
        );
    }
}

#[test]
fn native_command_timeout_is_bounded() {
    assert_eq!(clamp_command_timeout(None), 120_000);
    assert_eq!(clamp_command_timeout(Some(10)), 1_000);
    assert_eq!(clamp_command_timeout(Some(30_000)), 30_000);
    assert_eq!(clamp_command_timeout(Some(999_999)), 300_000);
}
