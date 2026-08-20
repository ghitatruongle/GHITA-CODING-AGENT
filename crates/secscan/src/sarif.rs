// ==============================================================================
// ghita-secscan — SARIF 2.1.0 output with partialFingerprints (Track 8.2/5.2)
// ==============================================================================
// Generates SARIF JSON with sticky class-hash fingerprints so dismissed
// findings don't reappear after code movement. Std-only core.
// ==============================================================================

use std::fmt::Write;

/// A single SARIF finding for serialization.
#[derive(Debug, Clone)]
pub struct SarifFinding {
    pub rule_id: String,
    pub message: String,
    pub file_path: String,
    pub line: u32,
    pub level: SarifLevel,
    /// Context lines for class-hash computation.
    pub context_lines: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SarifLevel {
    Error,
    Warning,
    Note,
}

impl SarifLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            SarifLevel::Error => "error",
            SarifLevel::Warning => "warning",
            SarifLevel::Note => "note",
        }
    }
}

/// FNV-1a 32-bit hash — deterministic, no crypto dependency.
fn fnv1a32(data: &[u8]) -> u32 {
    let mut hash: u32 = 0x811c9dc5;
    for &b in data {
        hash ^= b as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    hash
}

/// Escape a string for embedding inside a JSON string literal.
/// Handles all JSON-required escapes: quote, backslash, and every control
/// character U+0000–U+001F (including \n, \r, \t, \b, \f).
fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0C}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out
}

/// Compute a class-hash fingerprint stable across line shifts.
pub fn compute_class_hash(rule_id: &str, file_path: &str, context_lines: &[String]) -> String {
    let normalized: String = context_lines
        .iter()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("|");
    let raw = format!("{}:{}:{}", rule_id, file_path, normalized);
    format!("{:08x}", fnv1a32(raw.as_bytes()))
}

/// Build a minimal SARIF 2.1.0 JSON string from findings.
pub fn build_sarif_json(findings: &[SarifFinding], tool_name: &str, tool_version: &str) -> String {
    let mut out = String::with_capacity(1024);
    out.push_str(r#"{"$schema":"https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json","version":"2.1.0","runs":[{"#);
    write!(
        out,
        r#""tool":{{"driver":{{"name":"{}","version":"{}"}}}}"#,
        json_escape(tool_name),
        json_escape(tool_version)
    )
    .unwrap();
    out.push_str(r#","results":["#);

    for (i, f) in findings.iter().enumerate() {
        if i > 0 { out.push(','); }
        let class_hash = compute_class_hash(&f.rule_id, &f.file_path, &f.context_lines);
        let rule_and_path = format!("{:08x}", fnv1a32(format!("{}:{}", f.rule_id, f.file_path).as_bytes()));
        // Normalize path separators for the URI, then escape for JSON.
        let path = json_escape(&f.file_path.replace('\\', "/"));
        write!(out,
            r#"{{"ruleId":"{}","level":"{}","message":{{"text":"{}"}},"locations":[{{"physicalLocation":{{"artifactLocation":{{"uri":"{}"}},"region":{{"startLine":{}}}}}],"partialFingerprints":{{"classHash":"{}","ruleAndPath":"{}"}}}}"#,
            json_escape(&f.rule_id), f.level.as_str(), json_escape(&f.message), path, f.line, class_hash, rule_and_path
        ).unwrap();
    }

    out.push_str(r#"],"invocations":[{"executionSuccessful":true}]}]}"#);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn class_hash_is_deterministic() {
        let h1 = compute_class_hash("sqli", "api.ts", &["const q = req.query.id".into(), "db.exec(q)".into()]);
        let h2 = compute_class_hash("sqli", "api.ts", &["const q = req.query.id".into(), "db.exec(q)".into()]);
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 8);
    }

    #[test]
    fn class_hash_differs_on_rule_change() {
        let h1 = compute_class_hash("sqli", "f.ts", &["line1".into()]);
        let h2 = compute_class_hash("xss", "f.ts", &["line1".into()]);
        assert_ne!(h1, h2);
    }

    #[test]
    fn sarif_json_is_valid_structure() {
        let findings = vec![
            SarifFinding {
                rule_id: "sk-key".into(),
                message: "API key found".into(),
                file_path: "config.ts".into(),
                line: 42,
                level: SarifLevel::Error,
                context_lines: vec!["const key = 'sk-abc'".into()],
            },
        ];
        let json = build_sarif_json(&findings, "ghita-secscan", "1.1.5-beta1");
        assert!(json.contains("\"version\":\"2.1.0\""));
        assert!(json.contains("\"classHash\""));
        assert!(json.contains("\"ruleId\":\"sk-key\""));
        assert!(json.contains("\"startLine\":42"));
    }

    #[test]
    fn empty_findings_produces_valid_json() {
        let json = build_sarif_json(&[], "test", "0.0.1");
        assert!(json.contains("\"results\":[]"));
    }

    #[test]
    fn json_escape_handles_special_chars() {
        assert_eq!(json_escape("a\"b"), "a\\\"b");
        assert_eq!(json_escape("a\\b"), "a\\\\b");
        assert_eq!(json_escape("a\nb"), "a\\nb");
        assert_eq!(json_escape("a\rb"), "a\\rb");
        assert_eq!(json_escape("a\tb"), "a\\tb");
        assert_eq!(json_escape("a\u{01}b"), "a\\u0001b");
    }

    #[test]
    fn message_with_quotes_and_newlines_stays_valid() {
        let findings = vec![SarifFinding {
            rule_id: "xss".into(),
            message: "Found \"bad\"\tinput\nline2".into(),
            file_path: "src\\app.ts".into(),
            line: 7,
            level: SarifLevel::Warning,
            context_lines: vec![],
        }];
        let json = build_sarif_json(&findings, "tool \"x\"", "1.0");
        assert!(json.contains("Found \\\"bad\\\"\\tinput\\nline2"));
        assert!(json.contains("tool \\\"x\\\""));
        // Backslash path normalized to forward slash
        assert!(json.contains("src/app.ts"));
    }
}
