//! ghita-secscan — streaming security scanner core
//! Multi-pattern line scanner: scans content in blocks without materializing
//! the whole line array (the JS hot-path problem: `split('\n')` on 100MB repos
//! costs hundreds of MB). Std-only core so `cargo test` runs offline; the
//! production addon (feature "addon") swaps the naive byte-search for
//! memchr + regex + rayon and exposes napi bindings.

#[cfg(feature = "addon")]
mod napi;

/// SARIF 2.1.0 output with sticky partialFingerprints (Track 5.2 / 8.2).
pub mod sarif;
/// Extended secret-detection rules (Track 8.2).
pub mod secrets;

/// One scanner rule: an id + a literal pattern + optional negative literal.
#[derive(Debug, Clone)]
pub struct Rule {
    pub id: &'static str,
    /// Case-sensitive literal to look for.
    pub pattern: &'static str,
    /// If present, a match is suppressed when this literal is in the line.
    pub negative: Option<&'static str>,
}

/// A finding: rule id + 1-based line number + matched evidence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub rule_id: String,
    pub line: u32,
    pub evidence: String,
}

pub const DEFAULT_RULES: &[Rule] = &[
    Rule {
        id: "sk-key",
        pattern: "sk-",
        negative: None,
    },
    Rule {
        id: "aws-key",
        pattern: "AKIA",
        negative: None,
    },
    Rule {
        id: "ghp-token",
        pattern: "ghp_",
        negative: None,
    },
    Rule {
        id: "private-key",
        pattern: "PRIVATE KEY",
        negative: None,
    },
    Rule {
        id: "bearer",
        pattern: "Bearer ",
        negative: None,
    },
    Rule {
        id: "env-file",
        pattern: ".env",
        negative: Some("node_modules"),
    },
];

/// Scan a full buffer streaming-wise: iterate lines lazily (no Vec<String>),
/// one pass, linear per rule. Memory = O(1) beyond the input buffer.
pub fn scan_lines(content: &str, rules: &[Rule]) -> Vec<Finding> {
    let mut findings = Vec::new();
    let mut line_no: u32 = 1;
    let mut start = 0usize;
    let bytes = content.as_bytes();

    while start <= content.len() {
        let end = match memchr_newline(bytes, start) {
            Some(idx) => idx,
            None => content.len(),
        };
        let line = &content[start..end];
        if line.len() <= 2000 {
            for rule in rules {
                if !find_literal(line, rule.pattern) {
                    continue;
                }
                if let Some(neg) = rule.negative {
                    if find_literal(line, neg) {
                        continue;
                    }
                }
                let evidence = line.trim().chars().take(200).collect::<String>();
                findings.push(Finding {
                    rule_id: rule.id.to_string(),
                    line: line_no,
                    evidence,
                });
            }
        }
        if end >= content.len() {
            break;
        }
        start = end + 1;
        line_no += 1;
    }
    findings
}

/// memchr-style newline search (std-only; swap for `memchr` crate in addon).
fn memchr_newline(bytes: &[u8], from: usize) -> Option<usize> {
    bytes[from..]
        .iter()
        .position(|&b| b == b'\n')
        .map(|i| from + i)
}

/// Byte-wise literal search (std-only; swap for memchr in addon).
fn find_literal(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }
    let h = haystack.as_bytes();
    let n = needle.as_bytes();
    if n.len() > h.len() {
        return false;
    }
    let mut i = 0;
    while i + n.len() <= h.len() {
        if &h[i..i + n.len()] == n {
            return true;
        }
        i += 1;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_known_patterns_with_line_numbers() {
        let content = "const key = 'sk-proj-abc';\npassword = 'x';\nBEGIN PRIVATE KEY\n";
        let findings = scan_lines(content, DEFAULT_RULES);
        assert!(findings
            .iter()
            .any(|f| f.rule_id == "sk-key" && f.line == 1));
        assert!(findings
            .iter()
            .any(|f| f.rule_id == "private-key" && f.line == 3));
    }

    #[test]
    fn negative_pattern_suppresses() {
        let content = "const a = '.env.example';\n// node_modules/.env\n";
        let findings = scan_lines(content, DEFAULT_RULES);
        let env_hits: Vec<_> = findings
            .iter()
            .filter(|f| f.rule_id == "env-file")
            .collect();
        assert_eq!(env_hits.len(), 1); // second line suppressed by "node_modules"
        assert_eq!(env_hits[0].line, 1);
    }

    #[test]
    fn skips_minified_long_lines() {
        let long = "x".repeat(5000);
        let content = format!("{long}\nsk-abcdef\n");
        let findings = scan_lines(&content, DEFAULT_RULES);
        assert!(findings
            .iter()
            .any(|f| f.rule_id == "sk-key" && f.line == 2));
    }

    #[test]
    fn empty_and_short_inputs() {
        assert!(scan_lines("", DEFAULT_RULES).is_empty());
        assert!(scan_lines("plain text only\n", DEFAULT_RULES).is_empty());
    }
}
