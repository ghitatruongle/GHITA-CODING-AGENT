// ==============================================================================
// GHITA CODING AGENT - Phase 3.4: Teams & Projects Management
// Team-based access control, internal users, project management
// Reference: LiteLLM proxy/management/
// ==============================================================================

import { randomBytes } from 'node:crypto';

// --- Types ---

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ProjectStatus = 'active' | 'archived' | 'suspended';

export interface Team {
  teamId: string;
  name: string;
  description?: string;
  ownerId: string;
  maxMembers?: number;
  maxBudget?: number;
  rateLimitTier?: string;
  defaultScopes?: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  userId: string;
  teamId: string;
  role: TeamRole;
  joinedAt: Date;
  invitedBy?: string;
}

export interface Project {
  projectId: string;
  teamId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  budget?: number;
  spent: number;
  rateLimitTier?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  userId: string;
  email: string;
  name?: string;
  ssoProvider?: string;
  ssoUserId?: string;
  isInternal: boolean;
  globalRole?: 'admin' | 'user';
  teams: string[];         // team IDs
  projects: string[];      // project IDs
  metadata?: Record<string, unknown>;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface Invitation {
  invitationId: string;
  teamId: string;
  email: string;
  role: TeamRole;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
}

// --- Team Manager ---

export class TeamManager {
  private teams: Map<string, Team> = new Map();
  private members: Map<string, TeamMember[]> = new Map(); // teamId -> members
  private projects: Map<string, Project> = new Map();
  private users: Map<string, User> = new Map();
  private invitations: Map<string, Invitation> = new Map();

  // --- User Management ---

  /** Create or update a user (from SSO or internal) */
  upsertUser(options: {
    userId?: string;
    email: string;
    name?: string;
    ssoProvider?: string;
    ssoUserId?: string;
    isInternal?: boolean;
    globalRole?: 'admin' | 'user';
    metadata?: Record<string, unknown>;
  }): User {
    // Check if user exists by email
    let existingUser = [...this.users.values()].find(
      (u) => u.email === options.email
    );

    if (existingUser) {
      // Update
      existingUser.name = options.name ?? existingUser.name;
      existingUser.ssoProvider = options.ssoProvider ?? existingUser.ssoProvider;
      existingUser.ssoUserId = options.ssoUserId ?? existingUser.ssoUserId;
      existingUser.lastLoginAt = new Date();
      existingUser.metadata = { ...existingUser.metadata, ...options.metadata };
      return existingUser;
    }

    // Create new
    const userId = options.userId ?? `usr_${randomBytes(12).toString('hex')}`;
    const user: User = {
      userId,
      email: options.email,
      name: options.name,
      ssoProvider: options.ssoProvider,
      ssoUserId: options.ssoUserId,
      isInternal: options.isInternal ?? false,
      globalRole: options.globalRole ?? 'user',
      teams: [],
      projects: [],
      metadata: options.metadata,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    };

    this.users.set(userId, user);
    return user;
  }

  /** Get user by ID */
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  /** Get user by email */
  getUserByEmail(email: string): User | undefined {
    return [...this.users.values()].find((u) => u.email === email);
  }

  /** List all users */
  listUsers(options?: { role?: 'admin' | 'user'; isInternal?: boolean }): User[] {
    let users = [...this.users.values()];
    if (options?.role) {
      users = users.filter((u) => u.globalRole === options.role);
    }
    if (options?.isInternal !== undefined) {
      users = users.filter((u) => u.isInternal === options.isInternal);
    }
    return users;
  }

  // --- Team Operations ---

  /** Create a new team */
  createTeam(options: {
    name: string;
    description?: string;
    ownerId: string;
    maxMembers?: number;
    maxBudget?: number;
    rateLimitTier?: string;
    defaultScopes?: string[];
    metadata?: Record<string, unknown>;
  }): Team {
    const teamId = `team_${randomBytes(12).toString('hex')}`;
    const now = new Date();

    const team: Team = {
      teamId,
      name: options.name,
      description: options.description,
      ownerId: options.ownerId,
      maxMembers: options.maxMembers,
      maxBudget: options.maxBudget,
      rateLimitTier: options.rateLimitTier,
      defaultScopes: options.defaultScopes,
      metadata: options.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.teams.set(teamId, team);
    this.members.set(teamId, []);

    // Add owner as member
    this.addMember(teamId, options.ownerId, 'owner', options.ownerId);

    // Add to user's teams
    const owner = this.users.get(options.ownerId);
    if (owner) {
      owner.teams.push(teamId);
    }

    return team;
  }

  /** Get team by ID */
  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  /** Update team */
  updateTeam(teamId: string, updates: Partial<Pick<Team, 'name' | 'description' | 'maxMembers' | 'maxBudget' | 'rateLimitTier' | 'defaultScopes' | 'metadata'>>): Team | null {
    const team = this.teams.get(teamId);
    if (!team) return null;

    Object.assign(team, updates, { updatedAt: new Date() });
    return team;
  }

  /** Delete team */
  deleteTeam(teamId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;

    // Remove team from all members' user records
    const members = this.members.get(teamId) ?? [];
    for (const member of members) {
      const user = this.users.get(member.userId);
      if (user) {
        user.teams = user.teams.filter((t) => t !== teamId);
      }
    }

    this.teams.delete(teamId);
    this.members.delete(teamId);

    return true;
  }

  /** List teams */
  listTeams(userId?: string): Team[] {
    const allTeams = [...this.teams.values()];
    if (!userId) return allTeams;
    return allTeams.filter((t) => {
      const members = this.members.get(t.teamId) ?? [];
      return members.some((m) => m.userId === userId);
    });
  }

  // --- Member Management ---

  /** Add a member to a team */
  addMember(teamId: string, userId: string, role: TeamRole, invitedBy?: string): TeamMember | null {
    const team = this.teams.get(teamId);
    if (!team) return null;

    const members = this.members.get(teamId)!;

    // Check if already a member
    if (members.some((m) => m.userId === userId)) {
      return members.find((m) => m.userId === userId)!;
    }

    // Check max members
    if (team.maxMembers && members.length >= team.maxMembers) {
      throw new Error(`Team "${team.name}" has reached maximum members (${team.maxMembers})`);
    }

    const member: TeamMember = {
      userId,
      teamId,
      role,
      joinedAt: new Date(),
      invitedBy,
    };

    members.push(member);

    // Add to user's teams
    const user = this.users.get(userId);
    if (user && !user.teams.includes(teamId)) {
      user.teams.push(teamId);
    }

    return member;
  }

  /** Remove a member from a team */
  removeMember(teamId: string, userId: string): boolean {
    const members = this.members.get(teamId);
    if (!members) return false;

    const index = members.findIndex((m) => m.userId === userId);
    if (index === -1) return false;

    // Cannot remove owner
    if (members[index]?.role === 'owner') {
      throw new Error('Cannot remove team owner');
    }

    members.splice(index, 1);

    // Remove from user's teams
    const user = this.users.get(userId);
    if (user) {
      user.teams = user.teams.filter((t) => t !== teamId);
    }

    return true;
  }

  /** Update member role */
  updateMemberRole(teamId: string, userId: string, role: TeamRole): TeamMember | null {
    const members = this.members.get(teamId);
    if (!members) return null;

    const member = members.find((m) => m.userId === userId);
    if (!member) return null;

    member.role = role;
    return member;
  }

  /** Get members of a team */
  getMembers(teamId: string): TeamMember[] {
    return this.members.get(teamId) ?? [];
  }

  /** Get teams for a user */
  getUserTeams(userId: string): Team[] {
    const user = this.users.get(userId);
    if (!user) return [];
    return user.teams
      .map((tid) => this.teams.get(tid))
      .filter((t): t is Team => t !== undefined);
  }

  /** Check if user has a specific role in a team */
  hasTeamRole(teamId: string, userId: string, role: TeamRole): boolean {
    const members = this.members.get(teamId);
    if (!members) return false;
    const member = members.find((m) => m.userId === userId);
    if (!member) return false;

    const roleHierarchy: Record<TeamRole, number> = {
      owner: 4,
      admin: 3,
      member: 2,
      viewer: 1,
    };

    return roleHierarchy[member.role] >= roleHierarchy[role];
  }

  // --- Project Management ---

  /** Create a project within a team */
  createProject(options: {
    teamId: string;
    name: string;
    description?: string;
    budget?: number;
    rateLimitTier?: string;
    metadata?: Record<string, unknown>;
  }): Project {
    const team = this.teams.get(options.teamId);
    if (!team) throw new Error(`Team not found: ${options.teamId}`);

    const projectId = `proj_${randomBytes(12).toString('hex')}`;
    const now = new Date();

    const project: Project = {
      projectId,
      teamId: options.teamId,
      name: options.name,
      description: options.description,
      status: 'active',
      budget: options.budget,
      spent: 0,
      rateLimitTier: options.rateLimitTier ?? team.rateLimitTier,
      metadata: options.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(projectId, project);
    return project;
  }

  /** Get project by ID */
  getProject(projectId: string): Project | undefined {
    return this.projects.get(projectId);
  }

  /** Update project */
  updateProject(projectId: string, updates: Partial<Pick<Project, 'name' | 'description' | 'status' | 'budget' | 'rateLimitTier' | 'metadata'>>): Project | null {
    const project = this.projects.get(projectId);
    if (!project) return null;

    Object.assign(project, updates, { updatedAt: new Date() });
    return project;
  }

  /** List projects for a team */
  listProjects(teamId: string): Project[] {
    return [...this.projects.values()].filter((p) => p.teamId === teamId);
  }

  /** Record spending for a project */
  recordProjectSpend(projectId: string, amount: number): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.spent += amount;
      project.updatedAt = new Date();
    }
  }

  // --- Invitation System ---

  /** Invite a user to a team */
  inviteUser(teamId: string, email: string, role: TeamRole, invitedBy: string): Invitation {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team not found: ${teamId}`);

    const invitationId = `inv_${randomBytes(12).toString('hex')}`;
    const invitation: Invitation = {
      invitationId,
      teamId,
      email,
      role,
      invitedBy,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      createdAt: new Date(),
    };

    this.invitations.set(invitationId, invitation);
    return invitation;
  }

  /** Accept an invitation */
  acceptInvitation(invitationId: string, userId: string): TeamMember | null {
    const invitation = this.invitations.get(invitationId);
    if (!invitation) return null;

    if (invitation.acceptedAt) {
      throw new Error('Invitation already accepted');
    }

    if (invitation.expiresAt < new Date()) {
      throw new Error('Invitation has expired');
    }

    invitation.acceptedAt = new Date();

    return this.addMember(invitation.teamId, userId, invitation.role, invitation.invitedBy);
  }

  /** List pending invitations for a team */
  listInvitations(teamId: string): Invitation[] {
    return [...this.invitations.values()].filter(
      (inv) => inv.teamId === teamId && !inv.acceptedAt && inv.expiresAt > new Date()
    );
  }

  /** Get stats */
  getStats(): {
    totalTeams: number;
    totalProjects: number;
    totalUsers: number;
    totalInvitations: number;
  } {
    return {
      totalTeams: this.teams.size,
      totalProjects: this.projects.size,
      totalUsers: this.users.size,
      totalInvitations: [...this.invitations.values()].filter(
        (inv) => !inv.acceptedAt && inv.expiresAt > new Date()
      ).length,
    };
  }
}
