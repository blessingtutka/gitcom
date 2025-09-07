import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { ChangeAnalysis } from './types/models';
import * as path from 'path';

/**
 * Git repository analyzer and operations manager
 * Provides comprehensive Git status analysis, diff parsing, and commit operations
 * Handles staged file detection, change categorization, and complexity assessment
 */
class GitAnalyzer {
    private workspaceRoot: string;
    git: SimpleGit;

    /**
     * Initializes Git analyzer with workspace root directory
     * @param workspaceRoot - Path to Git repository root (defaults to current working directory)
     */
    constructor(workspaceRoot?: string) {
        this.workspaceRoot = workspaceRoot || process.cwd();
        this.git = simpleGit(this.workspaceRoot);
    }

    /**
     * Retrieves and analyzes all currently staged Git changes
     * Extracts file metadata, diffs, and line change statistics for each staged file
     * @returns Array of GitChange objects or null if no staged changes exist
     * @throws Error if Git operations fail
     */
    async getChanges(): Promise<GitChange[] | null> {
        try {
            const status = await this.git.status();
            const staged = status.staged;

            if (staged.length === 0) {
                return null;
            }

            const changes: GitChange[] = [];
            for (const file of staged) {
                const diff = await this.git.diff(['--cached', file]);
                changes.push({
                    file: file,
                    status: this.getChangeType(status, file),
                    diff: diff,
                    lines: this.parseDiffStats(diff),
                });
            }

            return changes;
        } catch (error) {
            throw new Error(`Failed to analyze git changes: ${(error as Error).message}`);
        }
    }

    /**
     * Determines the change type for a specific file from Git status
     * Categorizes changes as added, deleted, modified, or renamed
     * @param status - Git status result object
     * @param file - File path to analyze
     * @returns Change type classification
     */
    private getChangeType(status: StatusResult, file: string): 'added' | 'deleted' | 'modified' | 'renamed' {
        if (status.created.includes(file)) return 'added';
        if (status.deleted.includes(file)) return 'deleted';
        if (status.modified.includes(file)) return 'modified';
        if (status.renamed.some((r: RenamedFile) => r.to === file)) return 'renamed';
        return 'modified';
    }

    /**
     * Parses Git diff output to calculate line change statistics
     * Counts actual content additions and removals while ignoring metadata lines
     * @param diff - Raw Git diff output string
     * @returns Object containing added and removed line counts
     */
    private parseDiffStats(diff: string): { added: number; removed: number } {
        const lines = diff.split('\n');
        let added = 0,
            removed = 0;

        for (const line of lines) {
            if (line.startsWith('+') && !line.startsWith('+++')) added++;
            if (line.startsWith('-') && !line.startsWith('---')) removed++;
        }

        return { added, removed };
    }

    /**
     * Performs comprehensive analysis of Git changes for commit message generation
     * Aggregates statistics across multiple files and determines change complexity
     * @param changes - Array of GitChange objects to analyze
     * @returns ChangeAnalysis object with aggregated metrics or null if no changes
     */
    async analyzeChanges(changes: GitChange[] | null): Promise<ChangeAnalysis | null> {
        if (!changes) return null;

        const analysis: ChangeAnalysis = {
            totalFiles: changes.length,
            changeTypes: {},
            fileCategories: {},
            totalLines: { added: 0, removed: 0 },
            // scope: this.detectScope(changes),
            complexity: 'low',
            detectedFeatures: [],
        };

        for (const change of changes) {
            // Count change types
            analysis.changeTypes[change.status] = (analysis.changeTypes[change.status] || 0) + 1;

            // Count file types
            const ext = path.extname(change.file) || 'no-extension';
            analysis.fileCategories[ext] = (analysis.fileCategories[ext] || 0) + 1;

            // Sum line changes
            analysis.totalLines.added += change.lines.added;
            analysis.totalLines.removed += change.lines.removed;
        }

        // Determine complexity
        const totalLineChanges = analysis.totalLines.added + analysis.totalLines.removed;
        if (totalLineChanges > 100 || analysis.totalFiles > 5) {
            analysis.complexity = 'high';
        } else if (totalLineChanges > 20 || analysis.totalFiles > 2) {
            analysis.complexity = 'medium';
        }

        return analysis;
    }

    /**
     * Detects the semantic scope of changes by analyzing file path patterns
     * Identifies common project structures and functional areas from file paths
     * @param changes - Array of GitChange objects to analyze for scope patterns
     * @returns Scope identifier string or null if no clear scope detected
     */
    private detectScope(changes: GitChange[]): string | null {
        const paths = changes.map((c) => c.file);
        const commonPrefixes = ['src/', 'lib/', 'components/', 'utils/', 'api/', 'tests/', 'docs/'];

        for (const prefix of commonPrefixes) {
            if (paths.some((p) => p.startsWith(prefix))) {
                return prefix.replace('/', '');
            }
        }

        // Try to detect by file patterns
        if (paths.some((p) => p.includes('test') || p.includes('spec'))) return 'tests';
        if (paths.some((p) => p.includes('doc') || p.includes('readme'))) return 'docs';
        if (paths.some((p) => p.includes('config') || p.includes('setting'))) return 'config';

        return null;
    }

    /**
     * Executes Git commit operation with the provided commit message
     * Commits all currently staged changes to the repository
     * @param message - Commit message string to use for the commit
     * @throws Error if commit operation fails
     */
    async commit(message: string): Promise<void> {
        try {
            await this.git.commit(message);
        } catch (error) {
            throw new Error(`Failed to create commit: ${(error as Error).message}`);
        }
    }
}

export { GitAnalyzer };
