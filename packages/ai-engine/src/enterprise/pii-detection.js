// ==============================================================================
// GHITA CODING AGENT - Phase 3.6: PII Detection
// Personally Identifiable Information detection and redaction
// Reference: LiteLLM Presidio-based PII detection
// ==============================================================================
// --- PII Patterns ---
const PII_PATTERNS = {
    email: [
        { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, confidence: 0.95 },
    ],
    phone: [
        // US format
        { pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, confidence: 0.8 },
        // International
        { pattern: /\+\d{1,3}[-.\s]?\d{4,14}\b/g, confidence: 0.7 },
    ],
    ssn: [
        { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, confidence: 0.85 },
    ],
    credit_card: [
        // Visa
        { pattern: /\b4\d{3}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g, confidence: 0.9 },
        // Mastercard
        { pattern: /\b5[1-5]\d{2}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g, confidence: 0.9 },
        // Amex
        { pattern: /\b3[47]\d{2}[-.\s]?\d{6}[-.\s]?\d{5}\b/g, confidence: 0.9 },
        // Generic 16-digit
        { pattern: /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g, confidence: 0.6 },
    ],
    ip_address: [
        // IPv4
        { pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, confidence: 0.85 },
        // IPv6
        { pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, confidence: 0.9 },
    ],
    date_of_birth: [
        { pattern: /\b(?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/g, confidence: 0.6 },
        { pattern: /\b(?:19|20)\d{2}[\/\-](?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])\b/g, confidence: 0.6 },
    ],
    passport: [
        // US passport
        { pattern: /\b[A-Z]\d{8}\b/g, confidence: 0.7 },
        // Generic passport number
        { pattern: /\b(?:passport|passport\s*(?:no|number|#))\s*:?\s*[A-Z0-9]{6,12}\b/gi, confidence: 0.8 },
    ],
    driver_license: [
        { pattern: /\b(?:driver'?s?\s*(?:license|lic|licence)(?:\s*(?:no|number|#))?)\s*:?\s*[A-Z0-9]{5,15}\b/gi, confidence: 0.7 },
    ],
    bank_account: [
        { pattern: /\b(?:account|acct)(?:\s*(?:no|number|#))?\s*:?\s*\d{8,17}\b/gi, confidence: 0.6 },
        // IBAN
        { pattern: /\b[A-Z]{2}\d{2}\s?(?:\d{4}\s?){3,7}\d{1,4}\b/g, confidence: 0.85 },
    ],
    name: [
        // Common pattern: "My name is John Doe"
        { pattern: /\b(?:my\s+name\s+is|i'm|i\s+am|call\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g, confidence: 0.5 },
    ],
    address: [
        { pattern: /\b\d{1,5}\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/gi, confidence: 0.7 },
        { pattern: /\b(?:zip|postal)\s*(?:code)?\s*:?\s*\d{5}(?:-\d{4})?\b/gi, confidence: 0.75 },
    ],
    url: [
        { pattern: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g, confidence: 0.9 },
    ],
    api_key: [
        // OpenAI
        { pattern: /\bsk-[A-Za-z0-9]{20,}\b/g, confidence: 0.9 },
        // GitHub
        { pattern: /\bghp_[A-Za-z0-9]{36}\b/g, confidence: 0.95 },
        // AWS
        { pattern: /\bAKIA[A-Z0-9]{16}\b/g, confidence: 0.9 },
        // Generic API key patterns
        { pattern: /\b(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?\b/gi, confidence: 0.8 },
    ],
    jwt_token: [
        { pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, confidence: 0.95 },
    ],
    custom: [],
};
// --- PII Detector ---
export class PIIDetector {
    config;
    allPatterns;
    constructor(config) {
        this.config = {
            enabledTypes: config?.enabledTypes ?? [
                'email', 'phone', 'ssn', 'credit_card', 'ip_address',
                'api_key', 'jwt_token',
            ],
            defaultAction: config?.defaultAction ?? 'redact',
            customPatterns: config?.customPatterns,
            confidenceThreshold: config?.confidenceThreshold ?? 0.6,
            preserveFormat: config?.preserveFormat ?? true,
        };
        // Build pattern map
        this.allPatterns = new Map();
        for (const [type, patterns] of Object.entries(PII_PATTERNS)) {
            this.allPatterns.set(type, patterns);
        }
        // Add custom patterns
        if (this.config.customPatterns) {
            for (const cp of this.config.customPatterns) {
                const existing = this.allPatterns.get(cp.type) ?? [];
                existing.push({ pattern: cp.pattern, confidence: cp.confidence });
                this.allPatterns.set(cp.type, existing);
            }
        }
    }
    /** Detect PII in content */
    detect(content) {
        const findings = [];
        const threshold = this.config.confidenceThreshold ?? 0.6;
        for (const piiType of this.config.enabledTypes) {
            const patterns = this.allPatterns.get(piiType);
            if (!patterns)
                continue;
            for (const { pattern, confidence } of patterns) {
                if (confidence < threshold)
                    continue;
                // Reset regex state for global patterns
                const regex = new RegExp(pattern.source, pattern.flags);
                let match;
                while ((match = regex.exec(content)) !== null) {
                    const value = match[0];
                    // Skip very short matches that are likely false positives
                    if (value.length < 4)
                        continue;
                    findings.push({
                        type: piiType,
                        value,
                        start: match.index,
                        end: match.index + value.length,
                        confidence,
                        action: this.config.defaultAction,
                    });
                }
            }
        }
        // Sort by position
        findings.sort((a, b) => a.start - b.start);
        // Remove overlapping detections (keep highest confidence)
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
                ? `Found ${deduplicated.length} PII item(s): ${[...new Set(deduplicated.map((f) => f.type))].join(', ')}`
                : 'No PII detected',
        };
    }
    /** Quick check if content contains PII */
    hasPII(content) {
        return this.detect(content).detected;
    }
    /** Remove overlapping findings, keep highest confidence */
    deduplicateFindings(findings) {
        if (findings.length === 0)
            return [];
        const result = [findings[0]];
        for (let i = 1; i < findings.length; i++) {
            const current = findings[i];
            const last = result[result.length - 1];
            if (current.start < last.end) {
                // Overlapping — keep higher confidence
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
    /** Apply redaction to content based on findings */
    applyRedaction(content, findings) {
        let result = content;
        let offset = 0;
        for (const finding of findings) {
            const start = finding.start + offset;
            const end = finding.end + offset;
            let replacement;
            switch (this.config.defaultAction) {
                case 'redact':
                    replacement = `[REDACTED:${finding.type.toUpperCase()}]`;
                    break;
                case 'mask':
                    replacement = this.maskValue(finding.value, finding.type);
                    break;
                case 'hash':
                    replacement = `[HASH:${this.simpleHash(finding.value)}]`;
                    break;
                default:
                    replacement = `[REDACTED:${finding.type.toUpperCase()}]`;
            }
            result = result.substring(0, start) + replacement + result.substring(end);
            offset += replacement.length - finding.value.length;
        }
        return result;
    }
    /** Mask a value, preserving format */
    maskValue(value, type) {
        if (this.config.preserveFormat) {
            switch (type) {
                case 'email': {
                    const parts = value.split('@');
                    const local = parts[0] ?? '';
                    const domain = parts[1] ?? '';
                    return `${local[0] ?? ''}${'*'.repeat(Math.max(0, local.length - 1))}@${domain}`;
                }
                case 'credit_card':
                    return `****-****-****-${value.slice(-4)}`;
                case 'phone':
                    return `***-***-${value.slice(-4)}`;
                case 'ssn':
                    return `***-**-${value.slice(-4)}`;
                default:
                    return '*'.repeat(value.length);
            }
        }
        return '*'.repeat(value.length);
    }
    /** Simple hash for non-reversible redaction */
    simpleHash(value) {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            const char = value.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }
    /** Get enabled PII types */
    getEnabledTypes() {
        return [...this.config.enabledTypes];
    }
    /** Update config */
    updateConfig(updates) {
        Object.assign(this.config, updates);
    }
}
//# sourceMappingURL=pii-detection.js.map