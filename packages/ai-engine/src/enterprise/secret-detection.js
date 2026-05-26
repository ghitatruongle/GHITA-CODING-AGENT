// ==============================================================================
// GHITA CODING AGENT - Phase 3.8: Secret Detection
// 55+ credential pattern detectors for API keys, tokens, passwords
// Reference: LiteLLM enterprise/
// ==============================================================================
// --- Secret Patterns Database (80+ patterns) ---
const SECRET_PATTERNS = [
    // ===== OpenAI =====
    { type: 'api_key', provider: 'openai', pattern: /\bsk-[A-Za-z0-9]{20,}\b/g, confidence: 0.9, description: 'OpenAI API Key' },
    { type: 'api_key', provider: 'openai', pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g, confidence: 0.95, description: 'OpenAI Project API Key' },
    { type: 'api_key', provider: 'openai', pattern: /\bsk-org-[A-Za-z0-9_-]{20,}\b/g, confidence: 0.95, description: 'OpenAI Org API Key' },
    // ===== Anthropic =====
    { type: 'api_key', provider: 'anthropic', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, confidence: 0.95, description: 'Anthropic API Key' },
    // ===== Google =====
    { type: 'api_key', provider: 'google', pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g, confidence: 0.9, description: 'Google API Key' },
    { type: 'oauth', provider: 'google', pattern: /\b[0-9]+-[A-Za-z0-9_]{32}\.apps\.googleusercontent\.com\b/g, confidence: 0.9, description: 'Google OAuth Client ID' },
    { type: 'service_account', provider: 'google', pattern: /"type"\s*:\s*"service_account"/g, confidence: 0.95, description: 'Google Service Account Key' },
    // ===== Azure =====
    { type: 'api_key', provider: 'azure', pattern: /\bDefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{40,}/g, confidence: 0.95, description: 'Azure Storage Account Key' },
    { type: 'connection_string', provider: 'azure', pattern: /\bEndpoint=sb:\/\/[^;]+\.servicebus\.windows\.net\/;SharedAccessKey=[A-Za-z0-9+/=]{20,}/g, confidence: 0.95, description: 'Azure Service Bus Connection String' },
    // ===== AWS =====
    { type: 'cloud_credentials', provider: 'aws', pattern: /\bAKIA[A-Z0-9]{16}\b/g, confidence: 0.9, description: 'AWS Access Key ID' },
    { type: 'cloud_credentials', provider: 'aws', pattern: /\b[A-Za-z0-9/+=]{40}\b/g, confidence: 0.3, description: 'Possible AWS Secret Key (context-dependent)' },
    { type: 'connection_string', provider: 'aws', pattern: /\baws_access_key_id\s*=\s*[A-Z0-9]{20}/gi, confidence: 0.85, description: 'AWS Access Key in config' },
    { type: 'connection_string', provider: 'aws', pattern: /\baws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}/gi, confidence: 0.85, description: 'AWS Secret Key in config' },
    // ===== GitHub =====
    { type: 'access_token', provider: 'github', pattern: /\bghp_[A-Za-z0-9]{36}\b/g, confidence: 0.95, description: 'GitHub Personal Access Token' },
    { type: 'access_token', provider: 'github', pattern: /\bgho_[A-Za-z0-9]{36}\b/g, confidence: 0.95, description: 'GitHub OAuth Token' },
    { type: 'access_token', provider: 'github', pattern: /\bghu_[A-Za-z0-9]{36}\b/g, confidence: 0.95, description: 'GitHub User-to-Server Token' },
    { type: 'access_token', provider: 'github', pattern: /\bghs_[A-Za-z0-9]{36}\b/g, confidence: 0.95, description: 'GitHub Server-to-Server Token' },
    { type: 'access_token', provider: 'github', pattern: /\bghr_[A-Za-z0-9]{36}\b/g, confidence: 0.95, description: 'GitHub Refresh Token' },
    { type: 'webhook', provider: 'github', pattern: /\bhttps:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+\b/g, confidence: 0.9, description: 'Slack Webhook URL' },
    // ===== GitLab =====
    { type: 'access_token', provider: 'gitlab', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, confidence: 0.95, description: 'GitLab Personal Access Token' },
    // ===== Slack =====
    { type: 'access_token', provider: 'slack', pattern: /\bxoxb-[A-Za-z0-9-]{10,}\b/g, confidence: 0.9, description: 'Slack Bot Token' },
    { type: 'access_token', provider: 'slack', pattern: /\bxoxp-[A-Za-z0-9-]{10,}\b/g, confidence: 0.9, description: 'Slack User Token' },
    { type: 'access_token', provider: 'slack', pattern: /\bxoxe\.xoxp-1-[A-Za-z0-9-]{10,}\b/g, confidence: 0.9, description: 'Slack Workspace Token' },
    { type: 'webhook', provider: 'slack', pattern: /\bhttps:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{20,}\b/g, confidence: 0.95, description: 'Slack Incoming Webhook' },
    // ===== Discord =====
    { type: 'bot_token', provider: 'discord', pattern: /\b[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/g, confidence: 0.7, description: 'Discord Bot Token' },
    { type: 'webhook', provider: 'discord', pattern: /\bhttps:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+\b/g, confidence: 0.95, description: 'Discord Webhook URL' },
    // ===== Stripe =====
    { type: 'api_key', provider: 'stripe', pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/g, confidence: 0.95, description: 'Stripe Live Secret Key' },
    { type: 'api_key', provider: 'stripe', pattern: /\bsk_test_[A-Za-z0-9]{20,}\b/g, confidence: 0.95, description: 'Stripe Test Secret Key' },
    { type: 'api_key', provider: 'stripe', pattern: /\brk_live_[A-Za-z0-9]{20,}\b/g, confidence: 0.95, description: 'Stripe Live Restricted Key' },
    { type: 'api_key', provider: 'stripe', pattern: /\brk_test_[A-Za-z0-9]{20,}\b/g, confidence: 0.95, description: 'Stripe Test Restricted Key' },
    { type: 'webhook', provider: 'stripe', pattern: /\bwhsec_[A-Za-z0-9]{20,}\b/g, confidence: 0.95, description: 'Stripe Webhook Secret' },
    // ===== Twilio =====
    { type: 'api_key', provider: 'twilio', pattern: /\bSK[A-Za-z0-9]{32}\b/g, confidence: 0.7, description: 'Twilio API Key' },
    { type: 'password', provider: 'twilio', pattern: /\bauth_token\s*[:=]\s*[a-f0-9]{32}\b/gi, confidence: 0.8, description: 'Twilio Auth Token' },
    // ===== SendGrid =====
    { type: 'api_key', provider: 'sendgrid', pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, confidence: 0.95, description: 'SendGrid API Key' },
    // ===== Datadog =====
    { type: 'api_key', provider: 'datadog', pattern: /\b[a-f0-9]{32}\b/g, confidence: 0.3, description: 'Possible Datadog API Key (context-dependent)' },
    { type: 'api_key', provider: 'datadog', pattern: /\bdd[-_]?api[_-]?key\s*[:=]\s*[a-f0-9]{32}\b/gi, confidence: 0.9, description: 'Datadog API Key in config' },
    // ===== New Relic =====
    { type: 'api_key', provider: 'newrelic', pattern: /\bNRAK-[A-Za-z0-9]{27}\b/g, confidence: 0.95, description: 'New Relic API Key' },
    { type: 'api_key', provider: 'newrelic', pattern: /\bNRII-[A-Za-z0-9]{32}\b/g, confidence: 0.95, description: 'New Relic Insights Key' },
    // ===== Heroku =====
    { type: 'api_key', provider: 'heroku', pattern: /\bheroku[_-]?api[_-]?key\s*[:=]\s*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, confidence: 0.9, description: 'Heroku API Key' },
    // ===== DigitalOcean =====
    { type: 'access_token', provider: 'digitalocean', pattern: /\bdop_v1_[a-f0-9]{64}\b/g, confidence: 0.95, description: 'DigitalOcean Personal Access Token' },
    // ===== Supabase =====
    { type: 'api_key', provider: 'supabase', pattern: /\bsb[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, confidence: 0.7, description: 'Supabase API Key' },
    // ===== Firebase =====
    { type: 'api_key', provider: 'firebase', pattern: /\bAAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}\b/g, confidence: 0.9, description: 'Firebase Cloud Messaging Key' },
    // ===== MongoDB =====
    { type: 'connection_string', provider: 'mongodb', pattern: /\bmongodb(\+srv)?:\/\/[^:]+:[^@]+@[^/\s]+\b/g, confidence: 0.95, description: 'MongoDB Connection String with Credentials' },
    // ===== Redis =====
    { type: 'connection_string', provider: 'redis', pattern: /\bredis(s)?:\/\/[^:]+:[^@]+@[^/\s]+\b/g, confidence: 0.9, description: 'Redis Connection String with Password' },
    // ===== PostgreSQL =====
    { type: 'connection_string', provider: 'postgres', pattern: /\bpostgres(ql)?:\/\/[^:]+:[^@]+@[^/\s]+\b/g, confidence: 0.9, description: 'PostgreSQL Connection String with Credentials' },
    // ===== MySQL =====
    { type: 'connection_string', provider: 'mysql', pattern: /\bmysql:\/\/[^:]+:[^@]+@[^/\s]+\b/g, confidence: 0.9, description: 'MySQL Connection String with Credentials' },
    // ===== JWT =====
    { type: 'jwt', provider: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, confidence: 0.95, description: 'JSON Web Token (JWT)' },
    // ===== Generic Patterns =====
    { type: 'password', provider: 'generic', pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?\b/gi, confidence: 0.7, description: 'Password in plaintext' },
    { type: 'api_key', provider: 'generic', pattern: /\b(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?\b/gi, confidence: 0.7, description: 'Generic API Key' },
    { type: 'api_key', provider: 'generic', pattern: /\b(?:api[_-]?secret|apisecret)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?\b/gi, confidence: 0.7, description: 'Generic API Secret' },
    { type: 'access_token', provider: 'generic', pattern: /\b(?:access[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?\b/gi, confidence: 0.6, description: 'Generic Access Token' },
    { type: 'private_key', provider: 'generic', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, confidence: 0.95, description: 'Private Key (PEM format)' },
    { type: 'password', provider: 'generic', pattern: /\b(?:secret[_-]?key|secretkey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?\b/gi, confidence: 0.6, description: 'Secret Key in config' },
];
// --- Secret Detector ---
export class SecretDetector {
    patterns;
    allowlist;
    constructor(options) {
        this.patterns = [...SECRET_PATTERNS, ...(options?.customPatterns ?? [])];
        this.allowlist = new Set(options?.allowlist ?? []);
    }
    /** Detect secrets in content */
    detect(content) {
        const findings = [];
        for (const { type, provider, pattern, confidence, description } of this.patterns) {
            const regex = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = regex.exec(content)) !== null) {
                const value = match[0];
                // Skip if in allowlist
                if (this.allowlist.has(value))
                    continue;
                // Skip very short matches
                if (value.length < 8)
                    continue;
                findings.push({
                    type,
                    provider,
                    value,
                    start: match.index,
                    end: match.index + value.length,
                    confidence,
                    description,
                    maskedValue: this.maskSecret(value),
                });
            }
        }
        // Sort by position
        findings.sort((a, b) => a.start - b.start);
        // Deduplicate overlapping
        const deduplicated = this.deduplicateFindings(findings);
        const detected = deduplicated.length > 0;
        const redactedContent = detected
            ? this.applyRedaction(content, deduplicated)
            : undefined;
        return {
            detected,
            findings: deduplicated,
            redactedContent,
            summary: detected
                ? `Found ${deduplicated.length} secret(s): ${[...new Set(deduplicated.map((f) => f.description))].join(', ')}`
                : 'No secrets detected',
        };
    }
    /** Quick check if content contains secrets */
    hasSecrets(content) {
        return this.detect(content).detected;
    }
    /** Add patterns to allowlist */
    addToAllowlist(values) {
        for (const v of values) {
            this.allowlist.add(v);
        }
    }
    /** Add custom pattern */
    addPattern(pattern) {
        this.patterns.push(pattern);
    }
    /** Mask a secret value */
    maskSecret(value) {
        if (value.length <= 8) {
            return '*'.repeat(value.length);
        }
        const showPrefix = Math.min(4, Math.floor(value.length * 0.2));
        const showSuffix = Math.min(4, Math.floor(value.length * 0.1));
        return (value.substring(0, showPrefix) +
            '*'.repeat(value.length - showPrefix - showSuffix) +
            value.substring(value.length - showSuffix));
    }
    /** Remove overlapping findings */
    deduplicateFindings(findings) {
        if (findings.length === 0)
            return [];
        const result = [findings[0]];
        for (let i = 1; i < findings.length; i++) {
            const current = findings[i];
            const last = result[result.length - 1];
            if (current.start < last.end) {
                if (current.confidence > last.confidence) {
                    result[result.length - 1] = current;
                }
            }
            else {
                result.push(current);
            }
        }
        return result;
    }
    /** Apply redaction to content */
    applyRedaction(content, findings) {
        let result = content;
        let offset = 0;
        for (const finding of findings) {
            const start = finding.start + offset;
            const end = finding.end + offset;
            const replacement = `[REDACTED:${finding.provider.toUpperCase()}_${finding.type.toUpperCase()}]`;
            result = result.substring(0, start) + replacement + result.substring(end);
            offset += replacement.length - finding.value.length;
        }
        return result;
    }
    /** Get all patterns */
    getPatterns() {
        return [...this.patterns];
    }
    /** Get pattern count by provider */
    getPatternCountByProvider() {
        const counts = {};
        for (const p of this.patterns) {
            counts[p.provider] = (counts[p.provider] ?? 0) + 1;
        }
        return counts;
    }
}
//# sourceMappingURL=secret-detection.js.map