/** Semver version components */
export interface SemverVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

/** Bump kind */
export type BumpKind = 'major' | 'minor' | 'patch' | 'prerelease';

/** Pipeline step status */
export type PipelineStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

/** Pipeline step */
export interface PipelineStep {
  /** Step name */
  name: string;
  /** Status */
  status: PipelineStatus;
  /** Duration in ms */
  durationMs: number;
  /** Optional message */
  message?: string;
  /** Error if failed */
  error?: string;
  /** Started timestamp */
  startedAt: number;
  /** Completed timestamp */
  completedAt?: number;
}

/** Full publish pipeline run */
export interface PipelineRun {
  /** Run ID */
  id: string;
  /** Skill ID */
  skillId: string;
  /** Source directory */
  sourceDir: string;
  /** Target version */
  version: string;
  /** All steps */
  steps: PipelineStep[];
  /** Overall status */
  status: PipelineStatus;
  /** Start timestamp */
  startedAt: number;
  /** Complete timestamp */
  completedAt?: number;
  /** Generated artifacts (paths) */
  artifacts: string[];
}

/** Conversion options (skill → npm package) */
export interface ConvertOptions {
  /** Package name (default: @ghita/skills/<id>) */
  packageName?: string;
  /** Author name */
  author?: string;
  /** License */
  license?: string;
  /** Repository URL */
  repository?: string;
  /** Include source maps */
  sourceMaps?: boolean;
}

/** npm package.json output */
export interface NpmPackageJson {
  name: string;
  version: string;
  description: string;
  main: string;
  types?: string;
  files: string[];
  scripts?: Record<string, string>;
  keywords?: string[];
  author?: string;
  license?: string;
  repository?: { type: string; url: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** README generation options */
export interface ReadmeOptions {
  /** Include badges */
  badges?: boolean;
  /** Include install snippet */
  install?: boolean;
  /** Include usage example */
  usage?: boolean;
  /** Include contributing section */
  contributing?: boolean;
  /** Include license section */
  license?: boolean;
}

/** Generated README content */
export interface ReadmeResult {
  /** Markdown content */
  content: string;
  /** Title extracted */
  title: string;
  /** Sections found */
  sections: string[];
}

/** Changelog entry */
export interface ChangelogEntry {
  /** Version */
  version: string;
  /** Date ISO */
  date: string;
  /** Category → list of changes */
  changes: {
    added: string[];
    changed: string[];
    fixed: string[];
    removed: string[];
  };
}

/** CI/CD workflow result */
export interface CicdResult {
  /** Workflow file path */
  workflowPath: string;
  /** Workflow file content (YAML) */
  content: string;
  /** Jobs defined */
  jobs: string[];
}
