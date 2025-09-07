import { AnalyzedChange } from "../change-analyzer";
/**
 * Represents a group of related changes that should be committed together
 */
export class CommitGroup {
    id: string;
    type: ChangeType;
    scope: string | null;
    description: string;
    files: AnalyzedChange[];
    message: string;
    priority: number;

    constructor({
        id,
        type,
        scope = null,
        description,
        files = [],
        message = '',
        priority = 0,
    }: {
        id: string;
        type: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore';
        scope?: string | null;
        description: string;
        files?: AnalyzedChange[];
        message?: string;
        priority?: number;
    }) {
        this.id = id;
        this.type = type;
        this.scope = scope;
        this.description = description;
        this.files = files;
        this.message = message;
        this.priority = priority;
    }

    /** Gets the total number of files in this commit group */
    getFileCount(): number {
        return this.files.length;
    }

    /** Gets the total lines changed in this commit group */
    getLineStats(): { added: number; removed: number } {
        return this.files.reduce(
            (stats, file) => ({
                added: stats.added + file.linesAdded,
                removed: stats.removed + file.linesRemoved,
            }),
            { added: 0, removed: 0 },
        );
    }

    /** Gets all file paths in this commit group */
    getFilePaths(): string[] {
        return this.files.map((file) => file.filePath);
    }
}

/**
 * Represents a complete plan for creating multiple commits
 */
export class CommitPlan {
    groups: CommitGroup[];
    totalFiles: number;
    estimatedTime: number; // in seconds
    warnings: string[];

    constructor({
        groups = [],
        totalFiles = 0,
        estimatedTime = 0,
        warnings = [],
    }: {
        groups?: CommitGroup[];
        totalFiles?: number;
        estimatedTime?: number;
        warnings?: string[];
    }) {
        this.groups = groups;
        this.totalFiles = totalFiles;
        this.estimatedTime = estimatedTime;
        this.warnings = warnings;
    }

    getCommitCount(): number {
        return this.groups.length;
    }

    getTotalFileCount(): number {
        return this.groups.reduce((total, group) => total + group.getFileCount(), 0);
    }

    getTotalLineStats(): { added: number; removed: number } {
        return this.groups.reduce(
            (stats, group) => {
                const groupStats = group.getLineStats();
                return {
                    added: stats.added + groupStats.added,
                    removed: stats.removed + groupStats.removed,
                };
            },
            { added: 0, removed: 0 },
        );
    }

    addWarning(warning: string): void {
        this.warnings.push(warning);
    }

    sortByPriority(): void {
        this.groups.sort((a, b) => b.priority - a.priority);
    }
}

/**
 * Represents the result of a commit operation
 */
export class CommitResult {
    success: boolean;
    commitHash?: string | null;
    message: string;
    error: string | null;
    filesCommitted: string[];
    metadata?: FailureMetadata;

    constructor({
        success = false,
        commitHash = null,
        message = '',
        error = null,
        filesCommitted = [],
    }: {
        success?: boolean;
        commitHash?: string | null;
        message?: string;
        error?: string | null;
        filesCommitted?: string[];
    }) {
        this.success = success;
        this.commitHash = commitHash;
        this.message = message;
        this.error = error;
        this.filesCommitted = filesCommitted;
    }
}

/**
 * Represents analysis results for a set of changes
 */
export class ChangeAnalysis {
    totalFiles: number;
    changeTypes: Record<string, number>;
    fileCategories: Record<string, number>;
    totalLines: { added: number; removed: number };
    detectedFeatures: string[];
    complexity: 'low' | 'medium' | 'high';
    estimatedCommits?: number;

    constructor({
        totalFiles = 0,
        changeTypes = {},
        fileCategories = {},
        totalLines = { added: 0, removed: 0 },
        detectedFeatures = [],
        complexity = 'low',
        estimatedCommits = 1,
    }: {
        totalFiles?: number;
        changeTypes?: Record<string, number>;
        fileCategories?: Record<string, number>;
        totalLines?: { added: number; removed: number };
        detectedFeatures?: string[];
        complexity?: 'low' | 'medium' | 'high';
        estimatedCommits?: number;
    }) {
        this.totalFiles = totalFiles;
        this.changeTypes = changeTypes;
        this.fileCategories = fileCategories;
        this.totalLines = totalLines;
        this.detectedFeatures = detectedFeatures;
        this.complexity = complexity;
        this.estimatedCommits = estimatedCommits;
    }
}
