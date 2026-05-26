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
    teams: string[];
    projects: string[];
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
export declare class TeamManager {
    private teams;
    private members;
    private projects;
    private users;
    private invitations;
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
    }): User;
    /** Get user by ID */
    getUser(userId: string): User | undefined;
    /** Get user by email */
    getUserByEmail(email: string): User | undefined;
    /** List all users */
    listUsers(options?: {
        role?: 'admin' | 'user';
        isInternal?: boolean;
    }): User[];
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
    }): Team;
    /** Get team by ID */
    getTeam(teamId: string): Team | undefined;
    /** Update team */
    updateTeam(teamId: string, updates: Partial<Pick<Team, 'name' | 'description' | 'maxMembers' | 'maxBudget' | 'rateLimitTier' | 'defaultScopes' | 'metadata'>>): Team | null;
    /** Delete team */
    deleteTeam(teamId: string): boolean;
    /** List teams */
    listTeams(userId?: string): Team[];
    /** Add a member to a team */
    addMember(teamId: string, userId: string, role: TeamRole, invitedBy?: string): TeamMember | null;
    /** Remove a member from a team */
    removeMember(teamId: string, userId: string): boolean;
    /** Update member role */
    updateMemberRole(teamId: string, userId: string, role: TeamRole): TeamMember | null;
    /** Get members of a team */
    getMembers(teamId: string): TeamMember[];
    /** Get teams for a user */
    getUserTeams(userId: string): Team[];
    /** Check if user has a specific role in a team */
    hasTeamRole(teamId: string, userId: string, role: TeamRole): boolean;
    /** Create a project within a team */
    createProject(options: {
        teamId: string;
        name: string;
        description?: string;
        budget?: number;
        rateLimitTier?: string;
        metadata?: Record<string, unknown>;
    }): Project;
    /** Get project by ID */
    getProject(projectId: string): Project | undefined;
    /** Update project */
    updateProject(projectId: string, updates: Partial<Pick<Project, 'name' | 'description' | 'status' | 'budget' | 'rateLimitTier' | 'metadata'>>): Project | null;
    /** List projects for a team */
    listProjects(teamId: string): Project[];
    /** Record spending for a project */
    recordProjectSpend(projectId: string, amount: number): void;
    /** Invite a user to a team */
    inviteUser(teamId: string, email: string, role: TeamRole, invitedBy: string): Invitation;
    /** Accept an invitation */
    acceptInvitation(invitationId: string, userId: string): TeamMember | null;
    /** List pending invitations for a team */
    listInvitations(teamId: string): Invitation[];
    /** Get stats */
    getStats(): {
        totalTeams: number;
        totalProjects: number;
        totalUsers: number;
        totalInvitations: number;
    };
}
//# sourceMappingURL=teams.d.ts.map