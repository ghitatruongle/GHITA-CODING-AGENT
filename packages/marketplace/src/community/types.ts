/** Forum thread */
export interface ForumThread {
  /** Thread ID */
  id: string;
  /** Product/plugin this thread is about */
  productId: string;
  /** Title */
  title: string;
  /** Author user ID */
  authorId: string;
  /** Body markdown */
  body: string;
  /** Tags */
  tags: string[];
  /** Reply count */
  replyCount: number;
  /** View count */
  viewCount: number;
  /** Upvotes */
  upvotes: number;
  /** Whether pinned */
  pinned: boolean;
  /** Whether locked */
  locked: boolean;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp (last activity) */
  updatedAt: number;
}

/** Forum reply */
export interface ForumReply {
  /** Reply ID */
  id: string;
  /** Thread ID */
  threadId: string;
  /** Author user ID */
  authorId: string;
  /** Body markdown */
  body: string;
  /** Upvotes */
  upvotes: number;
  /** Whether this is the accepted answer */
  accepted: boolean;
  /** Created timestamp */
  createdAt: number;
}

/** Bug report */
export interface BugReport {
  /** Report ID */
  id: string;
  /** Product ID */
  productId: string;
  /** Reporter user ID */
  reporterId: string;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Steps to reproduce */
  steps: string[];
  /** Expected behaviour */
  expected: string;
  /** Actual behaviour */
  actual: string;
  /** Environment (OS, version) */
  environment: {
    os: string;
    productVersion: string;
    runtime?: string;
  };
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Status */
  status: 'open' | 'triaged' | 'in-progress' | 'resolved' | 'closed' | 'wontfix';
  /** Attachments (URLs) */
  attachments: string[];
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

/** Feature request */
export interface FeatureRequest {
  /** Request ID */
  id: string;
  /** Product ID */
  productId: string;
  /** Author user ID */
  authorId: string;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Use case */
  useCase: string;
  /** Vote count */
  votes: number;
  /** Voters (userId → vote weight, 1=up, -1=down) */
  voters: Map<string, 1 | -1>;
  /** Status */
  status: 'under-review' | 'planned' | 'in-progress' | 'shipped' | 'declined';
  /** Created timestamp */
  createdAt: number;
}

/** Contributor entry */
export interface Contributor {
  /** User ID */
  userId: string;
  /** Display name */
  name: string;
  /** Avatar URL */
  avatar?: string;
  /** Reputation score */
  score: number;
  /** Counters per activity */
  counts: {
    threads: number;
    replies: number;
    bugReports: number;
    featureRequests: number;
    acceptedAnswers: number;
  };
  /** Last activity */
  lastActiveAt: number;
}
