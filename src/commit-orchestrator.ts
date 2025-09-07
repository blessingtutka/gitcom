import simpleGit, { SimpleGit, StatusResult, CommitResult as GitCommitResult, LogResult } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { CommitGroup, CommitPlan, CommitResult } from './types/models';

/**
 * CommitOrchestrator manages the execution of commit plans by staging files
 * and creating commits in the correct order with proper error handling.
 * Enhanced with performance optimizations including batching and memory management.
 */
class CommitOrchestrator {
    private workspaceRoot: string;
    private git: SimpleGit;
    private currentOperation: string | null;
    private stagedFiles: string[];
    private options: Required<CommitOrchestratorOptions>;
    private stats: PerformanceStats;

    constructor(workspaceRoot?: string, options: CommitOrchestratorOptions = {}) {
        this.workspaceRoot = workspaceRoot || process.cwd();
        this.git = simpleGit(this.workspaceRoot);
        this.currentOperation = null;
        this.stagedFiles = [];

        // Performance optimization options
        this.options = {
            batchSize: options.batchSize || 50,
            enableBatching: options.enableBatching !== false,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            ...options,
        } as Required<CommitOrchestratorOptions>;

        // Performance tracking
        this.stats = {
            totalCommits: 0,
            successfulCommits: 0,
            failedCommits: 0,
            totalStagingTime: 0,
            totalCommitTime: 0,
            filesStaged: 0,
            retries: 0,
        };
    }

    /**
     * Executes a complete commit plan by processing each commit group in order
     * @param commitPlan - The plan containing commit groups to execute
     * @param options - Execution options
     * @returns Array of commit results
     */
    async executeCommitPlan(
        commitPlan: CommitPlan,
        options: { rollbackOnFailure?: boolean; continueOnError?: boolean } = {},
    ): Promise<CommitResult[]> {
        if (!commitPlan || !commitPlan.groups || commitPlan.groups.length === 0) {
            throw new Error('Invalid commit plan: no commit groups found');
        }

        const { rollbackOnFailure = true, continueOnError = false } = options;
        const results: CommitResult[] = [];
        const successfulCommits: SuccessfulCommitInfo[] = [];
        this.currentOperation = 'executing_plan';

        try {
            // Ensure we start with a clean staging area
            await this.unstageAllFiles();

            // Order commit groups based on dependencies and priority
            const orderedGroups = await this.orderCommitGroups(commitPlan.groups);

            // Execute each commit group
            for (let i = 0; i < orderedGroups.length; i++) {
                const group = orderedGroups[i];

                try {
                    // Stage files for this commit
                    await this.stageFiles(group.getFilePaths());

                    // Create the commit
                    const result = await this.createCommit(group.message);
                    result.filesCommitted = group.getFilePaths();
                    results.push(result);

                    if (result.success) {
                        successfulCommits.push({
                            commitHash: result.commitHash!,
                            group: group,
                            index: i,
                        });

                        // Clear staged files tracking after successful commit
                        this.stagedFiles = [];
                    } else {
                        // Handle commit failure (when createCommit returns failure instead of throwing)
                        if (rollbackOnFailure && successfulCommits.length > 0) {
                            await this.rollbackCommits(successfulCommits, result);
                        }

                        if (!continueOnError) {
                            break;
                        }
                    }
                } catch (error) {
                    // Handle commit failure for this group
                    const failureResult = await this.handleCommitFailure(error as Error, {
                        group,
                        commitIndex: i,
                        totalCommits: orderedGroups.length,
                        previousResults: results,
                        successfulCommits,
                    });

                    results.push(failureResult);

                    // Decide whether to continue or rollback based on options
                    if (!failureResult.success) {
                        if (rollbackOnFailure && successfulCommits.length > 0) {
                            await this.rollbackCommits(successfulCommits, failureResult);
                        }

                        if (!continueOnError) {
                            break;
                        }
                    }
                }
            }

            return results;
        } catch (error) {
            // Handle plan-level failures
            if (rollbackOnFailure && successfulCommits.length > 0) {
                try {
                    await this.rollbackCommits(successfulCommits, error as Error);
                } catch (rollbackError) {
                    console.error('Failed to rollback commits:', (rollbackError as Error).message);
                }
            }

            const planFailureResult = new CommitResult({
                success: false,
                error: `Failed to execute commit plan: ${(error as Error).message}`,
                message: 'Plan execution failed',
            });

            results.push(planFailureResult);
            return results;
        } finally {
            this.currentOperation = null;
        }
    }

    /**
     * Stages specific files for the next commit with performance optimizations
     * @param filePaths - Array of file paths to stage
     */
    async stageFiles(filePaths: string[]): Promise<void> {
        const startTime = Date.now();

        if (!filePaths || filePaths.length === 0) {
            throw new Error('No files provided to stage');
        }

        try {
            // Validate that all files exist and are in the repository
            await this.validateFiles(filePaths);

            // Use batching for large numbers of files
            if (this.options.enableBatching && filePaths.length > this.options.batchSize) {
                await this._stageFilesInBatches(filePaths);
            } else {
                await this._stageFilesSequentially(filePaths);
            }

            // Update performance statistics
            this.stats.filesStaged += filePaths.length;
            this.stats.totalStagingTime += Date.now() - startTime;
        } catch (error) {
            throw new Error(`Staging operation failed: ${(error as Error).message}`);
        }
    }

    /**
     * Stages files in batches for better performance with large changesets
     * @private
     * @param filePaths - Array of file paths to stage
     */
    private async _stageFilesInBatches(filePaths: string[]): Promise<void> {
        const batches = this._createBatches(filePaths, this.options.batchSize);
        const stagedFiles: string[] = [];

        try {
            for (const batch of batches) {
                // Stage batch using git add with multiple files
                await this.git.add(batch);
                stagedFiles.push(...batch);

                // Small delay between batches to prevent overwhelming git
                if (batches.length > 5) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }

            this.stagedFiles = stagedFiles;
        } catch (error) {
            // If batching fails, unstage any successfully staged files
            if (stagedFiles.length > 0) {
                await this.unstageFiles(stagedFiles);
            }
            throw error;
        }
    }

    /**
     * Stages files sequentially with individual error handling
     * @private
     * @param filePaths - Array of file paths to stage
     */
    private async _stageFilesSequentially(filePaths: string[]): Promise<void> {
        const stagedFiles: string[] = [];

        for (const filePath of filePaths) {
            try {
                await this.git.add(filePath);
                stagedFiles.push(filePath);
            } catch (error) {
                // If we've staged some files, unstage them before throwing
                if (stagedFiles.length > 0) {
                    await this.unstageFiles(stagedFiles);
                }
                throw new Error(`Failed to stage file '${filePath}': ${(error as Error).message}`);
            }
        }

        this.stagedFiles = stagedFiles;
    }

    /**
     * Creates batches from an array of items
     * @private
     * @param items - Items to batch
     * @param batchSize - Size of each batch
     * @returns Array of batches
     */
    private _createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Creates a git commit with the specified message with retry logic
     * @param message - The commit message
     * @returns Result of the commit operation
     */
    async createCommit(message: string): Promise<CommitResult> {
        const startTime = Date.now();

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            throw new Error('Invalid commit message: message cannot be empty');
        }

        let lastError: Error | null = null;

        // Retry logic for transient failures
        for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
            try {
                // Verify we have staged files
                const status = await this.git.status();
                if (status.staged.length === 0) {
                    const result = new CommitResult({
                        success: false,
                        error: 'Commit creation failed: No staged files found for commit',
                        message: message.trim(),
                        filesCommitted: [...this.stagedFiles],
                    });

                    this.stats.failedCommits++;
                    return result;
                }

                // Create the commit
                const commitResult = await this.git.commit(message.trim());

                // Success - update statistics
                this.stats.totalCommits++;
                this.stats.successfulCommits++;
                this.stats.totalCommitTime += Date.now() - startTime;

                return new CommitResult({
                    success: true,
                    commitHash: commitResult.commit,
                    message: message.trim(),
                    filesCommitted: [...this.stagedFiles],
                });
            } catch (error) {
                lastError = error as Error;

                // Check if this is a retryable error
                if (attempt < this.options.maxRetries && this._isRetryableError(error as Error)) {
                    this.stats.retries++;
                    console.warn(`Commit attempt ${attempt} failed, retrying in ${this.options.retryDelay}ms:`, (error as Error).message);
                    await new Promise((resolve) => setTimeout(resolve, this.options.retryDelay));
                    continue;
                }

                // Final failure
                break;
            }
        }

        // All retries exhausted
        this.stats.totalCommits++;
        this.stats.failedCommits++;
        this.stats.totalCommitTime += Date.now() - startTime;

        return new CommitResult({
            success: false,
            error: `Commit creation failed after ${this.options.maxRetries} attempts: ${lastError?.message}`,
            message: message.trim(),
            filesCommitted: [...this.stagedFiles],
        });
    }

    /**
     * Determines if an error is retryable
     * @private
     * @param error - The error to check
     * @returns True if the error is retryable
     */
    private _isRetryableError(error: Error): boolean {
        const retryablePatterns = [/network/i, /timeout/i, /connection/i, /temporary/i, /busy/i, /lock/i];

        const nonRetryablePatterns = [/not a git repository/i, /permission denied/i, /disk full/i, /nothing to commit/i, /working tree clean/i];

        const errorMessage = error.message || '';

        // Check for non-retryable errors first
        if (nonRetryablePatterns.some((pattern) => pattern.test(errorMessage))) {
            return false;
        }

        // Check for retryable errors
        return retryablePatterns.some((pattern) => pattern.test(errorMessage));
    }

    /**
     * Handles commit failures with appropriate error recovery
     * @param error - The error that occurred
     * @param context - Context information about the failed operation
     * @returns Result indicating failure and recovery actions
     */
    async handleCommitFailure(
        error: any,
        context: {
            group: CommitGroup;
            commitIndex: number;
            totalCommits: number;
            previousResults: CommitResult[];
            successfulCommits: SuccessfulCommitInfo[];
        },
    ): Promise<CommitResult> {
        const { group, commitIndex, totalCommits, previousResults, successfulCommits } = context;

        try {
            // Attempt to unstage files to clean up
            if (this.stagedFiles.length > 0) {
                await this.unstageFiles(this.stagedFiles);
                this.stagedFiles = [];
            }

            // Determine error severity and recovery strategy
            const errorAnalysis = this.analyzeCommitError(error, context);

            // Create detailed error information
            const errorDetails = {
                originalError: error.message,
                errorType: errorAnalysis.type,
                severity: errorAnalysis.severity,
                failedGroup: {
                    id: group.id,
                    type: group.type,
                    fileCount: group.getFileCount(),
                    files: group.getFilePaths(),
                },
                context: {
                    commitIndex: commitIndex + 1,
                    totalCommits,
                    successfulCommits: previousResults.filter((r) => r.success).length,
                    remainingCommits: totalCommits - commitIndex - 1,
                },
                suggestedActions: errorAnalysis.suggestedActions,
            };

            // Attempt automatic recovery if possible
            let recoveryResult = null;
            if (errorAnalysis.autoRecoverable) {
                try {
                    recoveryResult = await this.attemptAutoRecovery(error, context);
                } catch (autoRecoveryError) {
                    console.warn('Auto-recovery failed:', (autoRecoveryError as Error).message);
                }
            }

            const result = new CommitResult({
                success: false,
                error: `Commit ${commitIndex + 1}/${totalCommits} failed: ${error.message}`,
                message: group.message,
                filesCommitted: [],
            });

            result.metadata = {
                errorDetails,
                isRecoverable: errorAnalysis.recoverable,
                recoveryAction: errorAnalysis.recoveryAction,
                autoRecoveryAttempted: !!recoveryResult,
                autoRecoveryResult: recoveryResult,
                rollbackRecommended: errorAnalysis.severity === 'critical' && successfulCommits && successfulCommits.length > 0,
            };

            return result;
        } catch (recoveryError) {
            // Recovery itself failed
            const result = new CommitResult({
                success: false,
                error: `Commit failed and recovery failed: ${error.message}. Recovery error: ${(recoveryError as Error).message}`,
                message: group.message,
                filesCommitted: [],
            });

            result.metadata = {
                criticalFailure: true,
                originalError: error.message,
                recoveryError: (recoveryError as Error).message,
                rollbackRecommended: true,
            };

            return result;
        }
    }

    /**
     * Analyzes commit errors to determine recovery strategy
     * @param error - The error that occurred
     * @param context - Context information about the failed operation
     * @returns Error analysis with recovery recommendations
     */
    analyzeCommitError(
        error: Error,
        context: {
            group: CommitGroup;
            commitIndex: number;
            totalCommits: number;
            previousResults: CommitResult[];
            successfulCommits: SuccessfulCommitInfo[];
        },
    ): ErrorAnalysis {
        const errorMessage = error.message.toLowerCase();

        // Categorize error types
        let errorType = 'unknown';
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
        let recoverable = true;
        let autoRecoverable = false;
        let suggestedActions: string[] = [];
        let recoveryAction = 'Manual intervention required';

        // Nothing to commit errors
        if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes added') || errorMessage.includes('working tree clean')) {
            errorType = 'no_changes';
            severity = 'low';
            autoRecoverable = true;
            suggestedActions = ['Skip this commit group', 'Check if files were already committed'];
            recoveryAction = 'Skip commit group and continue';
        }

        // File not found errors
        else if (errorMessage.includes('file not found') || errorMessage.includes('pathspec') || errorMessage.includes('did not match')) {
            errorType = 'file_missing';
            severity = 'medium';
            autoRecoverable = true;
            suggestedActions = ['Remove missing files from commit group', 'Check file paths'];
            recoveryAction = 'Remove problematic files and retry';
        }

        // Permission errors
        else if (errorMessage.includes('permission denied') || errorMessage.includes('access denied')) {
            errorType = 'permission';
            severity = 'high';
            recoverable = false;
            suggestedActions = ['Check file permissions', 'Run with appropriate privileges'];
            recoveryAction = 'Fix permissions and retry manually';
        }

        // Repository state errors
        else if (errorMessage.includes('not a git repository') || errorMessage.includes('bad revision')) {
            errorType = 'repository_state';
            severity = 'critical';
            recoverable = false;
            suggestedActions = ['Check git repository integrity', 'Reinitialize repository if needed'];
            recoveryAction = 'Fix repository state manually';
        }

        // Merge conflicts
        else if (errorMessage.includes('conflict') || errorMessage.includes('merge')) {
            errorType = 'conflict';
            severity = 'high';
            suggestedActions = ['Resolve conflicts manually', 'Check for concurrent changes'];
            recoveryAction = 'Resolve conflicts and retry';
        }

        // Disk space errors
        else if (errorMessage.includes('disk full') || errorMessage.includes('no space')) {
            errorType = 'disk_space';
            severity = 'critical';
            recoverable = false;
            suggestedActions = ['Free up disk space', 'Check available storage'];
            recoveryAction = 'Free disk space and retry';
        }

        // Network/remote errors
        else if (errorMessage.includes('network') || errorMessage.includes('remote') || errorMessage.includes('connection')) {
            errorType = 'network';
            severity = 'medium';
            suggestedActions = ['Check network connection', 'Retry operation'];
            recoveryAction = 'Check connectivity and retry';
        }

        return {
            type: errorType,
            severity,
            recoverable,
            autoRecoverable,
            suggestedActions,
            recoveryAction,
        };
    }

    /**
     * Attempts automatic recovery from commit failures
     * @param error - The error that occurred
     * @param context - Context information about the failed operation
     * @returns Recovery result
     */
    private async attemptAutoRecovery(
        error: Error,
        context: {
            group: CommitGroup;
            commitIndex: number;
            totalCommits: number;
            previousResults: CommitResult[];
            successfulCommits: SuccessfulCommitInfo[];
        },
    ): Promise<any> {
        const { group } = context;
        const errorMessage = error.message.toLowerCase();

        // Handle "nothing to commit" errors
        if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes added') || errorMessage.includes('working tree clean')) {
            return {
                action: 'skip_commit',
                success: true,
                message: 'Skipped commit group with no changes',
                details: 'All files in this group were already committed or have no changes',
            };
        }

        // Handle file not found errors by filtering out missing files
        if (errorMessage.includes('file not found') || errorMessage.includes('pathspec') || errorMessage.includes('did not match')) {
            const validFiles: string[] = [];
            const invalidFiles: string[] = [];

            // Check each file in the group using a simpler validation
            for (const filePath of group.getFilePaths()) {
                try {
                    // Use a simpler file existence check for auto-recovery
                    const fullPath = path.resolve(this.workspaceRoot, filePath);

                    if (fs.existsSync(fullPath)) {
                        // Also check if git knows about this file
                        const status = await this.git.status();
                        const allKnownFiles = [
                            ...status.not_added,
                            ...status.conflicted,
                            ...status.created,
                            ...status.deleted,
                            ...status.modified,
                            ...status.renamed.map((r) => r.to),
                            ...status.staged,
                        ];

                        if (allKnownFiles.includes(filePath)) {
                            validFiles.push(filePath);
                        } else {
                            invalidFiles.push(filePath);
                        }
                    } else {
                        invalidFiles.push(filePath);
                    }
                } catch (validationError) {
                    invalidFiles.push(filePath);
                }
            }

            if (validFiles.length > 0) {
                // Try to commit with only valid files
                try {
                    // Stage files individually to avoid validation issues
                    const stagedFiles: string[] = [];
                    for (const filePath of validFiles) {
                        try {
                            await this.git.add(filePath);
                            stagedFiles.push(filePath);
                        } catch (stageError) {
                            console.warn(`Failed to stage ${filePath} during auto-recovery: ${(stageError as Error).message}`);
                        }
                    }

                    if (stagedFiles.length > 0) {
                        this.stagedFiles = stagedFiles;
                        const result = await this.createCommit(group.message);

                        return {
                            action: 'partial_commit',
                            success: result.success,
                            message: `Committed ${stagedFiles.length} of ${group.getFileCount()} files`,
                            details: {
                                committedFiles: stagedFiles,
                                skippedFiles: [...invalidFiles, ...validFiles.filter((f) => !stagedFiles.includes(f))],
                                commitResult: result,
                            },
                        };
                    } else {
                        return {
                            action: 'skip_commit',
                            success: true,
                            message: 'Skipped commit group - no files could be staged',
                            details: {
                                invalidFiles: [...invalidFiles, ...validFiles],
                            },
                        };
                    }
                } catch (partialCommitError) {
                    throw new Error(`Partial commit failed: ${(partialCommitError as Error).message}`);
                }
            } else {
                return {
                    action: 'skip_commit',
                    success: true,
                    message: 'Skipped commit group - no valid files found',
                    details: {
                        invalidFiles: invalidFiles,
                    },
                };
            }
        }

        throw new Error(`No auto-recovery strategy available for error: ${error.message}`);
    }

    /**
     * Validates that files exist and are within the repository
     * @param filePaths - Array of file paths to validate
     */
    async validateFiles(filePaths: string[]): Promise<void> {
        try {
            // Get repository status to check file states
            const status = await this.git.status();
            const allFiles = [
                ...status.not_added,
                ...status.conflicted,
                ...status.created,
                ...status.deleted,
                ...status.modified,
                ...status.renamed.map((r) => r.to),
                ...status.staged,
            ];

            // Check each file
            for (const filePath of filePaths) {
                // Check if file is tracked by git or is a new file
                if (!allFiles.includes(filePath)) {
                    // Check if it's an untracked file that exists
                    const fullPath = path.resolve(this.workspaceRoot, filePath);

                    if (!fs.existsSync(fullPath)) {
                        throw new Error(`File does not exist: ${filePath}`);
                    }
                }
            }
        } catch (error) {
            throw new Error(`File validation failed: ${(error as Error).message}`);
        }
    }

    /**
     * Unstages specific files
     * @param filePaths - Array of file paths to unstage
     */
    async unstageFiles(filePaths: string[]): Promise<void> {
        if (!filePaths || filePaths.length === 0) {
            return;
        }

        try {
            for (const filePath of filePaths) {
                await this.git.reset(['HEAD', filePath]);
            }
        } catch (error) {
            throw new Error(`Failed to unstage files: ${(error as Error).message}`);
        }
    }

    /**
     * Unstages all currently staged files
     */
    async unstageAllFiles(): Promise<void> {
        try {
            const status = await this.git.status();
            if (status.staged.length > 0) {
                await this.git.reset(['HEAD']);
            }
        } catch (error) {
            throw new Error(`Failed to unstage all files: ${(error as Error).message}`);
        }
    }

    /**
     * Determines if an error is recoverable
     * @param error - The error to check
     * @returns True if the error is recoverable
     */
    isRecoverableError(error: Error): boolean {
        const recoverablePatterns = [
            /nothing to commit/i,
            /no changes added to commit/i,
            /working tree clean/i,
            /file not found/i,
            /pathspec.*did not match/i,
        ];

        const nonRecoverablePatterns = [/not a git repository/i, /permission denied/i, /disk full/i, /network/i, /authentication/i];

        const errorMessage = error.message || '';

        // Check for non-recoverable errors first
        if (nonRecoverablePatterns.some((pattern) => pattern.test(errorMessage))) {
            return false;
        }

        // Check for recoverable errors
        if (recoverablePatterns.some((pattern) => pattern.test(errorMessage))) {
            return true;
        }

        // Default to recoverable for unknown errors
        return true;
    }

    /**
     * Gets the current operation status
     * @returns Current operation or null if idle
     */
    getCurrentOperation(): string | null {
        return this.currentOperation;
    }

    /**
     * Gets the list of currently staged files
     * @returns Array of staged file paths
     */
    getStagedFiles(): string[] {
        return [...this.stagedFiles];
    }

    /**
     * Gets performance statistics for the orchestrator
     * @returns Performance statistics
     */
    getPerformanceStats(): PerformanceStats & { successRate: string; averageStagingTime: string; averageCommitTime: string; retryRate: string } {
        const successRate = this.stats.totalCommits > 0 ? ((this.stats.successfulCommits / this.stats.totalCommits) * 100).toFixed(1) : 0;

        const averageStagingTime = this.stats.filesStaged > 0 ? (this.stats.totalStagingTime / this.stats.filesStaged).toFixed(2) : 0;

        const averageCommitTime = this.stats.successfulCommits > 0 ? (this.stats.totalCommitTime / this.stats.successfulCommits).toFixed(2) : 0;

        return {
            ...this.stats,
            successRate: `${successRate}%`,
            averageStagingTime: `${averageStagingTime}ms per file`,
            averageCommitTime: `${averageCommitTime}ms per commit`,
            retryRate: this.stats.totalCommits > 0 ? `${((this.stats.retries / this.stats.totalCommits) * 100).toFixed(1)}%` : '0%',
        };
    }

    /**
     * Resets performance statistics
     */
    resetStats(): void {
        this.stats = {
            totalCommits: 0,
            successfulCommits: 0,
            failedCommits: 0,
            totalStagingTime: 0,
            totalCommitTime: 0,
            filesStaged: 0,
            retries: 0,
        };
    }

    /**
     * Orders commit groups based on dependencies and priority
     * @param groups - Array of commit groups to order
     * @returns Ordered array of commit groups
     */
    async orderCommitGroups(groups: CommitGroup[]): Promise<CommitGroup[]> {
        if (!groups || groups.length === 0) {
            return [];
        }

        // Create a copy to avoid mutating the original array
        const orderedGroups = [...groups];

        // For now, use the simpler fallback sort until we can properly implement dependency detection
        // TODO: Implement proper file content analysis for dependency detection
        return this.fallbackSort(orderedGroups);
    }

    /**
     * Builds a dependency graph between commit groups
     * @param groups - Array of commit groups
     * @returns Dependency graph mapping group IDs to their dependencies
     */
    private buildDependencyGraph(groups: CommitGroup[]): Map<string, Set<string>> {
        const graph = new Map<string, Set<string>>();

        // Initialize graph with all groups
        groups.forEach((group) => {
            graph.set(group.id, new Set());
        });

        // Analyze dependencies between groups
        for (let i = 0; i < groups.length; i++) {
            for (let j = 0; j < groups.length; j++) {
                if (i !== j) {
                    const groupA = groups[i];
                    const groupB = groups[j];

                    if (this.hasDirectDependency(groupA, groupB)) {
                        // groupA depends on groupB, so groupB should come first
                        graph.get(groupA.id)!.add(groupB.id);
                    }
                }
            }
        }

        return graph;
    }

    /**
     * Checks if groupA has a direct dependency on groupB
     * @param groupA - The potentially dependent group
     * @param groupB - The potentially dependency group
     * @returns True if groupA depends on groupB
     */
    private hasDirectDependency(groupA: CommitGroup, groupB: CommitGroup): boolean {
        // Type-based dependencies
        const typeOrder = this.getCommitTypeOrder();
        const aTypeOrder = typeOrder[groupA.type] || 999;
        const bTypeOrder = typeOrder[groupB.type] || 999;

        // If groupB has a lower type order (should come first), groupA depends on it
        if (bTypeOrder < aTypeOrder) {
            return true;
        }

        // File-based dependencies
        const aFiles = groupA.getFilePaths();
        const bFiles = groupB.getFilePaths();

        // Check if any files in groupA depend on files in groupB
        for (const aFile of aFiles) {
            for (const bFile of bFiles) {
                if (this.fileHasDependency(aFile, bFile)) {
                    return true;
                }
            }
        }

        // Configuration dependencies - config files should come before code files
        const bHasConfig = bFiles.some((file) => this.isConfigFile(file));
        const aHasCode = aFiles.some((file) => !this.isConfigFile(file) && !this.isTestFile(file));

        if (bHasConfig && aHasCode) {
            return true;
        }

        // Test dependencies - tests should come after the code they test
        const aHasTests = aFiles.some((file) => this.isTestFile(file));
        const bHasCode = bFiles.some((file) => !this.isTestFile(file) && !this.isConfigFile(file));

        if (aHasTests && bHasCode) {
            // Check if tests are for the same module/feature
            const aTestModules = this.extractTestModules(aFiles);
            const bCodeModules = this.extractCodeModules(bFiles);

            if (aTestModules.some((testModule) => bCodeModules.includes(testModule))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Checks if fileA has a dependency on fileB
     * @param fileA - The potentially dependent file
     * @param fileB - The potentially dependency file
     * @returns True if fileA depends on fileB
     */
    private fileHasDependency(fileA: string, fileB: string): boolean {
        // Simple heuristics for file dependencies

        // Same directory dependencies
        const dirA = path.dirname(fileA);
        const dirB = path.dirname(fileB);

        // If fileB is an index file in the same directory, fileA likely depends on it
        if (dirA === dirB && path.basename(fileB).startsWith('index.')) {
            return true;
        }

        // If fileB is in a parent directory and is a core file, fileA likely depends on it
        if (dirA.startsWith(dirB) && this.isCoreFile(fileB)) {
            return true;
        }

        // If fileB is a utility or library file, other files likely depend on it
        if (this.isUtilityFile(fileB) && !this.isUtilityFile(fileA)) {
            return true;
        }

        return false;
    }

    /**
     * Performs topological sort on the dependency graph
     * @param groups - Array of commit groups
     * @param graph - Dependency graph
     * @returns Topologically sorted groups or null if circular dependency
     */
    private topologicalSort(groups: CommitGroup[], graph: Map<string, Set<string>>): CommitGroup[] | null {
        const result: CommitGroup[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const groupMap = new Map(groups.map((g) => [g.id, g]));

        const visit = (groupId: string): boolean => {
            if (visiting.has(groupId)) {
                // Circular dependency detected
                return false;
            }

            if (visited.has(groupId)) {
                return true;
            }

            visiting.add(groupId);

            // Visit all dependencies first
            const dependencies = graph.get(groupId) || new Set();
            for (const depId of dependencies) {
                if (!visit(depId)) {
                    return false;
                }
            }

            visiting.delete(groupId);
            visited.add(groupId);
            result.unshift(groupMap.get(groupId)!); // Add to front for correct order

            return true;
        };

        // Visit all groups
        for (const group of groups) {
            if (!visited.has(group.id)) {
                if (!visit(group.id)) {
                    return null; // Circular dependency
                }
            }
        }

        return result;
    }

    /**
     * Fallback sorting when topological sort fails
     * @param groups - Array of commit groups
     * @returns Sorted groups
     */
    private fallbackSort(groups: CommitGroup[]): CommitGroup[] {
        return [...groups].sort((a, b) => {
            // First, sort by priority (higher priority first)
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }

            // Then by commit type order
            const typeOrder = this.getCommitTypeOrder();
            const aTypeOrder = typeOrder[a.type] || 999;
            const bTypeOrder = typeOrder[b.type] || 999;

            if (aTypeOrder !== bTypeOrder) {
                return aTypeOrder - bTypeOrder;
            }

            // Finally by file count (smaller commits first)
            return a.getFileCount() - b.getFileCount();
        });
    }

    /**
     * Refines the sort order within dependency levels
     * @param groups - Topologically sorted groups
     * @returns Refined sorted groups
     */
    private refineSortOrder(groups: CommitGroup[]): CommitGroup[] {
        // For now, just maintain the topological order
        // Could be enhanced to sort within dependency levels by priority
        return groups;
    }

    /**
     * Extracts test modules from test file paths
     * @param testFiles - Array of test file paths
     * @returns Array of module names being tested
     */
    private extractTestModules(testFiles: string[]): string[] {
        return testFiles.map((file) => {
            const basename = path.basename(file);

            // Remove test suffixes and extensions
            return basename
                .replace(/\.(test|spec)\.(js|ts|jsx|tsx)$/, '')
                .replace(/\.test$/, '')
                .replace(/\.spec$/, '');
        });
    }

    /**
     * Extracts code modules from code file paths
     * @param codeFiles - Array of code file paths
     * @returns Array of module names
     */
    private extractCodeModules(codeFiles: string[]): string[] {
        return codeFiles.map((file) => {
            const basename = path.basename(file);

            // Remove extensions
            return basename.replace(/\.(js|ts|jsx|tsx)$/, '');
        });
    }

    /**
     * Checks if a file is a utility file
     * @param filePath - The file path to check
     * @returns True if it's a utility file
     */
    private isUtilityFile(filePath: string): boolean {
        const utilityPatterns = [
            /\/utils?\//,
            /\/helpers?\//,
            /\/lib\//,
            /\/common\//,
            /\/shared\//,
            /utility/i,
            /helper/i,
            /^lib\//, // Files starting with lib/
            /common\./, // Files with common in the name
        ];

        return utilityPatterns.some((pattern) => pattern.test(filePath));
    }

    /**
     * Gets the preferred order for commit types
     * @returns Mapping of commit types to order numbers
     */
    private getCommitTypeOrder(): Record<string, number> {
        return {
            chore: 1, // Infrastructure and setup changes first
            feat: 2, // New features
            refactor: 3, // Code refactoring
            fix: 4, // Bug fixes
            perf: 5, // Performance improvements
            style: 6, // Code style changes
            docs: 7, // Documentation
            test: 8, // Tests last (they depend on the code being there)
        };
    }

    /**
     * Analyzes dependencies for a commit group
     * @param group - The commit group to analyze
     * @param allGroups - All commit groups for context
     * @returns Array of dependency indicators
     */
    private analyzeDependencies(group: CommitGroup, allGroups: CommitGroup[]): string[] {
        const dependencies: string[] = [];
        const groupFiles = group.getFilePaths();

        // Check for common dependency patterns
        for (const filePath of groupFiles) {
            // Configuration files should come first
            if (this.isConfigFile(filePath)) {
                dependencies.push('config');
            }

            // Core/base files should come before dependent files
            if (this.isCoreFile(filePath)) {
                dependencies.push('core');
            }

            // Test files depend on the code they test
            if (this.isTestFile(filePath)) {
                dependencies.push('test');
            }
        }

        return dependencies;
    }

    /**
     * Checks if a file is a configuration file
     * @param filePath - The file path to check
     * @returns True if it's a configuration file
     */
    private isConfigFile(filePath: string): boolean {
        const configPatterns = [/package\.json$/, /\.config\./, /\.env/, /webpack/, /babel/, /eslint/, /prettier/, /tsconfig/, /jest\.config/];

        return configPatterns.some((pattern) => pattern.test(filePath));
    }

    /**
     * Checks if a file is a core/base file
     * @param filePath - The file path to check
     * @returns True if it's a core file
     */
    private isCoreFile(filePath: string): boolean {
        const corePatterns = [/\/index\./, /\/main\./, /\/app\./, /\/base/, /\/core/, /\/utils/, /\/lib/, /\/models/];

        return corePatterns.some((pattern) => pattern.test(filePath));
    }

    /**
     * Checks if a file is a test file
     * @param filePath - The file path to check
     * @returns True if it's a test file
     */
    private isTestFile(filePath: string): boolean {
        const testPatterns = [/\.test\./, /\.spec\./, /\/tests?\//, /\/spec\//, /__tests__/];

        return testPatterns.some((pattern) => pattern.test(filePath));
    }

    /**
     * Rolls back a series of commits with enhanced error recovery
     * @param successfulCommits - Array of successful commit information
     * @param failureContext - The failure that triggered rollback
     * @param options - Rollback options
     * @returns Rollback result with status and details
     */
    async rollbackCommits(
        successfulCommits: SuccessfulCommitInfo[],
        failureContext: Error | CommitResult,
        options: { strategy?: string; preserveWorkingDirectory?: boolean; _recoveryAttempt?: boolean } = {},
    ): Promise<RollbackResult> {
        if (!successfulCommits || successfulCommits.length === 0) {
            return {
                success: true,
                message: 'No commits to rollback',
                commitsRolledBack: 0,
            };
        }

        const { strategy = 'reset', preserveWorkingDirectory = false } = options;
        this.currentOperation = 'rolling_back';

        try {
            // Ensure we start with a clean staging area
            await this.unstageAllFiles();

            // Get the current HEAD and repository state before rollback
            const preRollbackState = await this.captureRepositoryState();

            // Calculate how many commits to rollback
            const commitsToRollback = successfulCommits.length;

            // Perform rollback based on strategy
            let rollbackResult;
            switch (strategy) {
                case 'reset':
                    rollbackResult = await this.performResetRollback(commitsToRollback, preserveWorkingDirectory);
                    break;
                case 'revert':
                    rollbackResult = await this.performRevertRollback(successfulCommits);
                    break;
                default:
                    throw new Error(`Unknown rollback strategy: ${strategy}`);
            }

            // Clear staged files tracking
            this.stagedFiles = [];

            // Log the rollback action
            const logMessage = `Rolled back ${commitsToRollback} commits using ${strategy} strategy due to failure: ${failureContext.message || (failureContext as Error).message || failureContext.toString()}`;
            console.log(logMessage);

            return {
                success: true,
                message: logMessage,
                commitsRolledBack: commitsToRollback,
                strategy: strategy,
                preRollbackState: preRollbackState,
                rollbackDetails: rollbackResult,
            };
        } catch (rollbackError) {
            // If rollback fails, try alternative recovery methods
            const recoveryResult = await this.attemptRollbackRecovery(successfulCommits, rollbackError as Error, options);

            if (!recoveryResult.success) {
                // Create manual rollback plan as last resort
                const manualPlan = this.createRollbackPlan(successfulCommits);

                const errorMessage = `Critical: Failed to rollback commits automatically. Manual intervention required. Error: ${(rollbackError as Error).message}`;
                console.error(errorMessage);
                console.error('Manual rollback plan:', manualPlan);

                return {
                    success: false,
                    error: errorMessage,
                    rollbackError: (rollbackError as Error).message,
                    manualRollbackPlan: manualPlan,
                    commitsToRollback: successfulCommits.length,
                };
            }

            return recoveryResult;
        } finally {
            this.currentOperation = null;
        }
    }

    /**
     * Captures the current repository state for rollback purposes
     * @returns Repository state information
     */
    private async captureRepositoryState(): Promise<RepositoryState> {
        try {
            const [currentHead, status, log] = await Promise.all([
                this.git.raw(['rev-parse', 'HEAD']).catch(() => 'unknown'),
                this.git.status().catch(() => ({ staged: [], modified: [], not_added: [] }) as Partial<StatusResult>),
                this.git.log(['-1', '--oneline']).catch(() => ({ latest: null }) as Partial<LogResult>),
            ]);

            return {
                head: currentHead.trim(),
                status: status,
                latestCommit: log.latest,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            return {
                head: 'unknown',
                status: { staged: [], modified: [], not_added: [] },
                latestCommit: null,
                timestamp: new Date().toISOString(),
                captureError: (error as Error).message,
            };
        }
    }

    /**
     * Performs rollback using git reset
     * @param commitsToRollback - Number of commits to rollback
     * @param preserveWorkingDirectory - Whether to preserve working directory changes
     * @returns Reset operation result
     */
    private async performResetRollback(commitsToRollback: number, preserveWorkingDirectory: boolean): Promise<any> {
        const resetMode = preserveWorkingDirectory ? '--soft' : '--hard';

        try {
            await this.git.reset([resetMode, `HEAD~${commitsToRollback}`]);

            return {
                method: 'reset',
                mode: resetMode,
                commitsReset: commitsToRollback,
                workingDirectoryPreserved: preserveWorkingDirectory,
            };
        } catch (error) {
            throw new Error(`Reset rollback failed: ${(error as Error).message}`);
        }
    }

    /**
     * Performs rollback using git revert (creates new commits that undo changes)
     * @param successfulCommits - Array of successful commit information
     * @returns Revert operation result
     */
    private async performRevertRollback(successfulCommits: SuccessfulCommitInfo[]): Promise<any> {
        const revertedCommits: any[] = [];

        try {
            // Revert commits in reverse order (most recent first)
            for (let i = successfulCommits.length - 1; i >= 0; i--) {
                const commit = successfulCommits[i];

                try {
                    await this.git.revert([commit.commitHash, '--no-edit'].join(' '));

                    const log = await this.git.log({ n: 1 });
                    const revertResult = log.latest?.hash ?? 'unknown';
                    revertedCommits.push({
                        originalCommit: commit.commitHash,
                        revertCommit: revertResult,
                    });
                } catch (revertError) {
                    // If individual revert fails, try to continue with others
                    console.warn(`Failed to revert commit ${commit.commitHash}: ${(revertError as Error).message}`);
                    revertedCommits.push({
                        originalCommit: commit.commitHash,
                        revertCommit: null,
                        error: (revertError as Error).message,
                    });
                }
            }

            return {
                method: 'revert',
                revertedCommits: revertedCommits,
                successfulReverts: revertedCommits.filter((r) => r.revertCommit).length,
                failedReverts: revertedCommits.filter((r) => !r.revertCommit).length,
            };
        } catch (error) {
            throw new Error(`Revert rollback failed: ${(error as Error).message}`);
        }
    }

    /**
     * Attempts alternative recovery methods when primary rollback fails
     * @param successfulCommits - Array of successful commit information
     * @param rollbackError - The error that occurred during rollback
     * @param options - Recovery options
     * @returns Recovery result
     */
    private async attemptRollbackRecovery(successfulCommits: SuccessfulCommitInfo[], rollbackError: Error, options: any): Promise<RollbackResult> {
        console.log('Attempting rollback recovery after primary rollback failed...');

        // Prevent infinite recursion by checking if we're already in recovery mode
        if (options._recoveryAttempt) {
            console.log('Already in recovery mode, skipping to partial recovery...');
            try {
                return await this.attemptPartialRecovery(successfulCommits, rollbackError);
            } catch (partialRecoveryError) {
                return {
                    success: false,
                    error: 'All recovery attempts failed',
                    originalError: rollbackError.message,
                    partialRecoveryError: (partialRecoveryError as Error).message,
                };
            }
        }

        try {
            // Try alternative rollback strategy
            const alternativeStrategy = options.strategy === 'reset' ? 'revert' : 'reset';

            console.log(`Trying alternative rollback strategy: ${alternativeStrategy}`);

            const recoveryOptions = {
                ...options,
                strategy: alternativeStrategy,
                preserveWorkingDirectory: true, // Be more conservative in recovery
                _recoveryAttempt: true, // Mark as recovery attempt to prevent recursion
            };

            return await this.rollbackCommits(successfulCommits, rollbackError, recoveryOptions);
        } catch (recoveryError) {
            // If alternative strategy also fails, try partial recovery
            try {
                console.log('Attempting partial recovery...');
                return await this.attemptPartialRecovery(successfulCommits, recoveryError as Error);
            } catch (partialRecoveryError) {
                return {
                    success: false,
                    error: 'All recovery attempts failed',
                    originalError: rollbackError.message,
                    recoveryError: (recoveryError as Error).message,
                    partialRecoveryError: (partialRecoveryError as Error).message,
                };
            }
        }
    }

    /**
     * Attempts partial recovery by rolling back only some commits
     * @param successfulCommits - Array of successful commit information
     * @param error - The error that occurred
     * @returns Partial recovery result
     */
    private async attemptPartialRecovery(successfulCommits: SuccessfulCommitInfo[], error: Error): Promise<RollbackResult> {
        // Try to rollback commits one by one from most recent
        const partiallyRolledBack: SuccessfulCommitInfo[] = [];
        const failedRollbacks: any[] = [];

        for (let i = successfulCommits.length - 1; i >= 0; i--) {
            try {
                await this.git.reset(['--hard', 'HEAD~1']);
                partiallyRolledBack.push(successfulCommits[i]);
            } catch (singleRollbackError) {
                failedRollbacks.push({
                    commit: successfulCommits[i],
                    error: (singleRollbackError as Error).message,
                });
                break; // Stop on first failure to avoid making things worse
            }
        }

        if (partiallyRolledBack.length > 0) {
            return {
                success: true,
                message: `Partial recovery successful: rolled back ${partiallyRolledBack.length} of ${successfulCommits.length} commits`,
                commitsRolledBack: partiallyRolledBack.length,
                partiallyRolledBack: partiallyRolledBack,
                failedRollbacks: failedRollbacks,
                requiresManualIntervention: failedRollbacks.length > 0,
            };
        } else {
            throw new Error('Partial recovery failed: could not rollback any commits');
        }
    }

    /**
     * Creates a rollback plan for manual recovery
     * @param successfulCommits - Array of successful commit information
     * @returns Rollback plan with instructions
     */
    private createRollbackPlan(successfulCommits: SuccessfulCommitInfo[]): any {
        const plan = {
            commitsToRollback: successfulCommits.length,
            commits: successfulCommits.map((commit) => ({
                hash: commit.commitHash,
                message: commit.group.message,
                files: commit.group.getFilePaths(),
            })),
            instructions: [
                `Run: git reset --hard HEAD~${successfulCommits.length}`,
                'This will undo the last ' + successfulCommits.length + ' commits',
                'All changes will be lost, make sure this is what you want',
                'Alternative: Use git revert for each commit hash listed above',
            ],
        };

        return plan;
    }
}

export { CommitOrchestrator };
