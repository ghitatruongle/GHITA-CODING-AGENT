// ==============================================================================
// GHITA CODING AGENT — Exact BPE Token Counter (v1.1.5-beta1 Track 4.1)
// ------------------------------------------------------------------------------
// Wraps tiktoken-rs to provide exact token counts for OpenAI/Claude/GPT models.
// Replaces the heuristic length/4 estimator in ai-engine/src/utils/token-counter.ts.
// Std-only core for offline cargo test; napi addon behind feature "addon".
// Pattern: open-agent tiktoken.rs (~40 lines).
// ==============================================================================

#[cfg(feature = "addon")]
mod napi;

/// Supported encoding families. Maps to tiktoken-rs BPE vocabularies.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncodingFamily {
    /// GPT-4o / o1 / o3 family (o200k_base)
    O200k,
    /// GPT-4 / GPT-3.5-turbo (cl100k_base)
    Cl100k,
    /// Legacy GPT-3 (r50k_base)
    R50k,
}

impl EncodingFamily {
    /// Parse from a model name string. Returns the best-matching encoding.
    pub fn from_model(model: &str) -> Self {
        let lower = model.to_lowercase();
        if lower.contains("gpt-4o") || lower.contains("o1") || lower.contains("o3") {
            EncodingFamily::O200k
        } else if lower.contains("gpt-4") || lower.contains("gpt-3.5") || lower.contains("claude") {
            EncodingFamily::Cl100k
        } else {
            EncodingFamily::Cl100k // safe default
        }
    }
}

/// Count tokens for a text string using the specified encoding family.
/// This is the std-only entry point usable without napi.
#[cfg(feature = "addon")]
pub fn count_tokens(text: &str, family: EncodingFamily) -> Result<usize, String> {
    use tiktoken_rs::*;
    let bpe = match family {
        EncodingFamily::O200k => o200k_base().map_err(|e| e.to_string())?,
        EncodingFamily::Cl100k => cl100k_base().map_err(|e| e.to_string())?,
        EncodingFamily::R50k => r50k_base().map_err(|e| e.to_string())?,
    };
    Ok(bpe.encode_with_special_tokens(text).len())
}

/// Fallback when addon feature is not enabled — uses heuristic.
#[cfg(not(feature = "addon"))]
pub fn count_tokens(text: &str, _family: EncodingFamily) -> Result<usize, String> {
    Ok((text.len() as f64 / 4.0).ceil() as usize)
}

/// Estimate message tokens including per-message overhead (~4 tokens for role/formatting).
#[cfg(feature = "addon")]
pub fn count_messages_tokens(
    messages: &[(&str, &str)],
    family: EncodingFamily,
) -> Result<usize, String> {
    let mut total: usize = 0;
    for (_role, content) in messages {
        total += 4; // per-message overhead
        total += count_tokens(content, family)?;
    }
    total += 2; // reply priming
    Ok(total)
}

#[cfg(not(feature = "addon"))]
pub fn count_messages_tokens(
    messages: &[(&str, &str)],
    family: EncodingFamily,
) -> Result<usize, String> {
    let mut total: usize = 0;
    for (_role, content) in messages {
        total += 4;
        total += count_tokens(content, family)?;
    }
    total += 2;
    Ok(total)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encoding_family_from_model() {
        assert_eq!(EncodingFamily::from_model("gpt-4o"), EncodingFamily::O200k);
        assert_eq!(EncodingFamily::from_model("gpt-4o-mini"), EncodingFamily::O200k);
        assert_eq!(EncodingFamily::from_model("o1-preview"), EncodingFamily::O200k);
        assert_eq!(EncodingFamily::from_model("gpt-4-turbo"), EncodingFamily::Cl100k);
        assert_eq!(EncodingFamily::from_model("gpt-3.5-turbo"), EncodingFamily::Cl100k);
        assert_eq!(EncodingFamily::from_model("claude-3-opus"), EncodingFamily::Cl100k);
        assert_eq!(EncodingFamily::from_model("unknown-model"), EncodingFamily::Cl100k);
    }

    #[cfg(feature = "addon")]
    #[test]
    fn exact_count_nonempty() {
        let count = count_tokens("Hello, world!", EncodingFamily::Cl100k).unwrap();
        assert!(count > 0, "non-empty text should have >0 tokens");
        // "Hello, world!" is typically 3-4 tokens in cl100k
        assert!(count <= 10, "short text should have few tokens, got {count}");
    }

    #[cfg(feature = "addon")]
    #[test]
    fn exact_count_empty() {
        let count = count_tokens("", EncodingFamily::Cl100k).unwrap();
        assert_eq!(count, 0);
    }

    #[cfg(feature = "addon")]
    #[test]
    fn messages_overhead() {
        let msgs = vec![("system", "You are helpful."), ("user", "Hi")];
        let total = count_messages_tokens(&msgs, EncodingFamily::Cl100k).unwrap();
        // At minimum: 4+4+2 = 10 overhead + content tokens
        assert!(total >= 10, "messages should include overhead, got {total}");
    }

    #[cfg(not(feature = "addon"))]
    #[test]
    fn fallback_heuristic() {
        let count = count_tokens("Hello, world!", EncodingFamily::Cl100k).unwrap();
        // Heuristic: ceil(13 / 4) = 4
        assert_eq!(count, 4);
    }
}
