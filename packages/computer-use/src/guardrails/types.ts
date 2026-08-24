// Type definitions for Shell Command Blacklist Security Guardrails

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ThreatType =
  | 'destructive-command' // rm -rf, mkfs, dd
  | 'fork-bomb' // :(){ :|:& };:
  | 'remote-execution' // curl|sh, wget|sh
  | 'obfuscated-command' // base64 encoded, hex encoded
  | 'binary-execution' // chmod +x unknown binary, ./unknown
  | 'privilege-escalation' // sudo su, chmod 777 /
  | 'network-exfiltration' // nc -l, reverse shells
  | 'custom-blacklist'; // User-defined in YAML

export interface SecurityValidationResult {
  
  safe: boolean;
  
  command: string;
  
  threats: ThreatDetection[];
  
  requiresApproval: boolean;
  
  errorCode?: string;
}

export interface ThreatDetection {
  
  type: ThreatType;
  
  severity: ThreatSeverity;
  
  description: string;
  
  matchedPattern: string;
  
  position?: number;
}

export interface SecurityLogEntry {
  
  id: string;
  
  command: string;
  
  result: SecurityValidationResult;
  
  approved?: boolean;
  /** Timestamp */
  timestamp: Date;
  
  source: 'local' | 'remote-olt';
}

export interface SecurityBlacklistConfig {
  
  customPatterns: CustomPatternEntry[];
  
  whitelist: string[];
  
  detectBase64: boolean;
  
  detectBinaryExecution: boolean;
  
  requireApprovalForHigh: boolean;
  
  executionMode?: 'dev' | 'auto';
}

export interface CustomPatternEntry {
  
  name: string;
  /** Regex pattern */
  pattern: string;
  
  severity: ThreatSeverity;
  
  description: string;
}

/**
 * Callback interface cho approval modal (Tauri GUI / OLT remote)
 */
export interface ApprovalCallback {
  
  requestApproval(command: string, threats: ThreatDetection[]): Promise<boolean>;
}

export const DEFAULT_SECURITY_CONFIG: SecurityBlacklistConfig = {
  customPatterns: [],
  whitelist: [],
  detectBase64: true,
  detectBinaryExecution: true,
  requireApprovalForHigh: true,
  executionMode: 'auto',
};

export const SECURITY_ERROR_PREFIX = 'GHITA-SEC';
