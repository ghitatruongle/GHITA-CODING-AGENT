//! ghita-secscan — Secret detection module
//! Replaces ai-engine/src/enterprise/secret-detection.ts (651 lines JS regex)
//! with native pattern matching. Uses the same Rule/scan_lines infrastructure
//! from lib.rs but with secret-specific patterns.

use crate::{scan_lines, Finding, Rule};

/// Extended secret detection rules beyond the DEFAULT_RULES in lib.rs.
/// These cover additional credential types commonly found in codebases.
pub const SECRET_RULES: &[Rule] = &[
    // AWS
    Rule {
        id: "aws-access-key",
        pattern: "AKIA",
        negative: None,
    },
    Rule {
        id: "aws-secret-key",
        pattern: "aws_secret_access_key",
        negative: None,
    },
    // GitHub
    Rule {
        id: "github-token",
        pattern: "ghp_",
        negative: None,
    },
    Rule {
        id: "github-oauth",
        pattern: "gho_",
        negative: None,
    },
    Rule {
        id: "github-app-token",
        pattern: "ghu_",
        negative: None,
    },
    Rule {
        id: "github-refresh",
        pattern: "ghr_",
        negative: None,
    },
    // GitLab
    Rule {
        id: "gitlab-token",
        pattern: "glpat-",
        negative: None,
    },
    // OpenAI
    Rule {
        id: "openai-key",
        pattern: "sk-proj-",
        negative: None,
    },
    Rule {
        id: "openai-org",
        pattern: "org-",
        negative: Some("organization"),
    },
    // Anthropic
    Rule {
        id: "anthropic-key",
        pattern: "sk-ant-",
        negative: None,
    },
    // Google
    Rule {
        id: "gcp-service-account",
        pattern: "\"type\": \"service_account\"",
        negative: None,
    },
    Rule {
        id: "google-api-key",
        pattern: "AIzaSy",
        negative: None,
    },
    // Generic
    Rule {
        id: "generic-api-key",
        pattern: "api_key =",
        negative: Some("example"),
    },
    Rule {
        id: "generic-secret",
        pattern: "secret =",
        negative: Some("example"),
    },
    Rule {
        id: "password-assignment",
        pattern: "password =",
        negative: Some("placeholder"),
    },
    // Private keys
    Rule {
        id: "private-key-pem",
        pattern: "PRIVATE KEY",
        negative: None,
    },
    Rule {
        id: "rsa-private-key",
        pattern: "BEGIN RSA PRIVATE KEY",
        negative: None,
    },
    // Connection strings
    Rule {
        id: "connection-string",
        pattern: "Server=",
        negative: Some("localhost"),
    },
    Rule {
        id: "mongodb-uri",
        pattern: "mongodb+srv://",
        negative: None,
    },
    // Slack
    Rule {
        id: "slack-webhook",
        pattern: "hooks.slack.com/services/",
        negative: None,
    },
    Rule {
        id: "slack-token",
        pattern: "xoxb-",
        negative: None,
    },
    // Stripe
    Rule {
        id: "stripe-key",
        pattern: "sk_live_",
        negative: None,
    },
    // Heroku
    Rule {
        id: "heroku-api-key",
        pattern: "HEROKU_API_KEY",
        negative: None,
    },
];

/// Scan content specifically for secrets using the extended rule set.
pub fn scan_secrets(content: &str) -> Vec<Finding> {
    scan_lines(content, SECRET_RULES)
}

/// Combine default rules + secret rules for comprehensive scanning.
pub fn scan_all(content: &str) -> Vec<Finding> {
    let mut all_rules: Vec<Rule> =
        Vec::with_capacity(crate::DEFAULT_RULES.len() + SECRET_RULES.len());
    all_rules.extend_from_slice(crate::DEFAULT_RULES);
    all_rules.extend_from_slice(SECRET_RULES);
    scan_lines(content, &all_rules)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_aws_keys() {
        let content = "const key = 'AKIAIOSFODNN7EXAMPLE';\n";
        let findings = scan_secrets(content);
        assert!(findings.iter().any(|f| f.rule_id == "aws-access-key"));
    }

    #[test]
    fn detects_github_tokens() {
        let content = "token = 'ghp_abc123def456'\n";
        let findings = scan_secrets(content);
        assert!(findings.iter().any(|f| f.rule_id == "github-token"));
    }

    #[test]
    fn detects_openai_keys() {
        let content = "OPENAI_KEY='sk-proj-abcdef123456'\n";
        let findings = scan_secrets(content);
        assert!(findings.iter().any(|f| f.rule_id == "openai-key"));
    }

    #[test]
    fn detects_private_keys() {
        let content = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADA...\n-----END PRIVATE KEY-----\n";
        let findings = scan_secrets(content);
        assert!(findings.iter().any(|f| f.rule_id == "private-key-pem"));
    }

    #[test]
    fn detects_mongodb_uris() {
        let content = "MONGO_URI='mongodb+srv://user:pass@cluster.mongodb.net/db'\n";
        let findings = scan_secrets(content);
        assert!(findings.iter().any(|f| f.rule_id == "mongodb-uri"));
    }

    #[test]
    fn negative_pattern_suppresses_examples() {
        let content = "// api_key = example_value_for_docs\n";
        let findings = scan_secrets(content);
        let api_hits: Vec<_> = findings
            .iter()
            .filter(|f| f.rule_id == "generic-api-key")
            .collect();
        assert_eq!(api_hits.len(), 0);
    }

    #[test]
    fn scan_all_combines_both_rule_sets() {
        let content = "sk-proj-test123\nAKIAEXAMPLE\n";
        let findings = scan_all(content);
        assert!(findings.iter().any(|f| f.rule_id == "openai-key"));
        assert!(findings.iter().any(|f| f.rule_id == "aws-access-key"));
    }

    #[test]
    fn empty_content_returns_no_findings() {
        assert!(scan_secrets("").is_empty());
    }

    /// Track 5 P5.3 — parity fixtures mirrored from
    /// packages/ai-engine/tests/secret-parity.test.ts. Keep the two lists in
    /// sync: adding a fixture on one side must add it to the other so drift
    /// between the Rust literal rules and the TS regex engines surfaces as a
    /// test failure.
    #[test]
    fn secret_parity_fixtures_match_ts_corpus() {
        let fixtures: &[(&str, &str, &str)] = &[
            // (fixture name, sample, expected rule id)
            (
                "openai_key",
                "Authorization: Bearer sk-proj-abcdefghij0123456789ABCDE",
                "openai-key",
            ),
            (
                "github_pat",
                "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789",
                "github-token",
            ),
            (
                "aws_access_key",
                "aws_access_key_id = AKIAIOSFODNN7EXAMPLE",
                "aws-access-key",
            ),
            (
                "private_key_block",
                "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----",
                "rsa-private-key",
            ),
        ];
        for (name, sample, expected_rule) in fixtures {
            let findings = scan_secrets(sample);
            assert!(
                findings.iter().any(|f| f.rule_id == *expected_rule),
                "parity fixture {name}: expected rule {expected_rule} to fire"
            );
        }
    }
}
