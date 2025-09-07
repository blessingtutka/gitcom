import { CommitGroup, Resolution, ResolutionHistory, ResolutionResult } from './types';

/**
 * Smart conflict resolution system for complex dependency scenarios
 * Handles situations where files have circular dependencies or complex relationships
 */
class SmartConflictResolver {
    private options: Required<SmartConflictResolverOptions>;
    private strategies: Record<string, (conflict: Conflict, groups: CommitGroup[], context: any) => Promise<Resolution>>;
    private resolutionHistory: ResolutionHistory[];

    constructor(options: SmartConflictResolverOptions = {}) {
        this.options = {
            maxResolutionAttempts: options.maxResolutionAttempts || 5,
            enableHeuristics: options.enableHeuristics !== false,
            prioritizeUserIntent: options.prioritizeUserIntent !== false,
            conflictResolutionStrategy: options.conflictResolutionStrategy || 'balanced',
            ...options,
        } as Required<SmartConflictResolverOptions>;

        // Conflict resolution strategies
        this.strategies = {
            conservative: this._conservativeResolution.bind(this),
            aggressive: this._aggressiveResolution.bind(this),
            balanced: this._balancedResolution.bind(this),
            user_guided: this._userGuidedResolution.bind(this),
        };

        // Track resolution history for learning
        this.resolutionHistory = [];
    }

    /**
     * Resolves conflicts in commit grouping
     * @param groups - Commit groups with potential conflicts
     * @param context - Context information
     * @returns Resolution result
     */
    async resolveConflicts(groups: CommitGroup[], context: any = {}): Promise<ResolutionResult> {
        const conflicts = this._detectConflicts(groups);

        if (conflicts.length === 0) {
            return {
                success: true,
                resolvedGroups: groups,
                conflicts: [],
                resolutions: [],
                warnings: [],
            };
        }

        const resolutionResult: ResolutionResult = {
            success: false,
            resolvedGroups: [...groups],
            conflicts: conflicts,
            resolutions: [],
            warnings: [],
        };

        // Attempt to resolve each conflict
        for (const conflict of conflicts) {
            const resolution = await this._resolveConflict(conflict, resolutionResult.resolvedGroups, context);
            resolutionResult.resolutions.push(resolution);

            if (resolution.success) {
                // Apply the resolution
                resolutionResult.resolvedGroups = resolution.modifiedGroups;
            } else {
                resolutionResult.warnings.push(`Failed to resolve conflict: ${conflict.description}`);
            }
        }

        // Final validation
        const remainingConflicts = this._detectConflicts(resolutionResult.resolvedGroups);
        resolutionResult.success = remainingConflicts.length === 0;

        // Record resolution attempt for learning
        this._recordResolutionAttempt(conflicts, resolutionResult, context);

        return resolutionResult;
    }

    /**
     * Detects conflicts in commit groups
     * @private
     * @param groups - Commit groups to analyze
     * @returns Detected conflicts
     */
    private _detectConflicts(groups: CommitGroup[]): Conflict[] {
        const conflicts: Conflict[] = [];

        // Detect circular dependencies
        const circularDeps = this._detectCircularDependencies(groups);
        conflicts.push(...circularDeps);

        // Detect file ownership conflicts
        const ownershipConflicts = this._detectFileOwnershipConflicts(groups);
        conflicts.push(...ownershipConflicts);

        // Detect logical inconsistencies
        const logicalConflicts = this._detectLogicalInconsistencies(groups);
        conflicts.push(...logicalConflicts);

        // Detect dependency ordering conflicts
        const orderingConflicts = this._detectDependencyOrderingConflicts(groups);
        conflicts.push(...orderingConflicts);

        return conflicts;
    }

    /**
     * Detects circular dependencies between groups
     * @private
     * @param groups - Commit groups to analyze
     * @returns Circular dependency conflicts
     */
    private _detectCircularDependencies(groups: CommitGroup[]): Conflict[] {
        const conflicts: Conflict[] = [];
        const dependencyGraph = this._buildDependencyGraph(groups);

        // Use DFS to detect cycles
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        for (const groupId of dependencyGraph.keys()) {
            if (!visited.has(groupId)) {
                const cycle = this._detectCycleFromNode(groupId, dependencyGraph, visited, recursionStack, []);
                if (cycle.length > 0) {
                    conflicts.push({
                        type: 'circular_dependency',
                        severity: 'high',
                        description: `Circular dependency detected: ${cycle.join(' -> ')}`,
                        involvedGroups: cycle,
                        suggestedResolution: 'break_cycle',
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Detects file ownership conflicts (same file in multiple groups)
     * @private
     * @param groups - Commit groups to analyze
     * @returns File ownership conflicts
     */
    private _detectFileOwnershipConflicts(groups: CommitGroup[]): Conflict[] {
        const conflicts: Conflict[] = [];
        const fileOwnership = new Map<string, string[]>();

        // Track which groups contain each file
        for (const group of groups) {
            for (const file of group.files) {
                if (!fileOwnership.has(file.filePath)) {
                    fileOwnership.set(file.filePath, []);
                }
                fileOwnership.get(file.filePath)!.push(group.id);
            }
        }

        // Find files that appear in multiple groups
        for (const [filePath, owningGroups] of fileOwnership) {
            if (owningGroups.length > 1) {
                conflicts.push({
                    type: 'file_ownership',
                    severity: 'medium',
                    description: `File ${filePath} appears in multiple groups: ${owningGroups.join(', ')}`,
                    involvedGroups: owningGroups,
                    conflictedFile: filePath,
                    suggestedResolution: 'assign_to_primary_group',
                });
            }
        }

        return conflicts;
    }

    /**
     * Detects logical inconsistencies in grouping
     * @private
     * @param groups - Commit groups to analyze
     * @returns Logical inconsistency conflicts
     */
    private _detectLogicalInconsistencies(groups: CommitGroup[]): Conflict[] {
        const conflicts: Conflict[] = [];

        for (const group of groups) {
            // Check for mixed change types that shouldn't be together
            const changeTypes = new Set(group.files.map((f) => f.changeType));
            if (changeTypes.has('deleted') && (changeTypes.has('added') || changeTypes.has('modified'))) {
                conflicts.push({
                    type: 'logical_inconsistency',
                    severity: 'medium',
                    description: `Group ${group.id} mixes file deletions with additions/modifications`,
                    involvedGroups: [group.id],
                    suggestedResolution: 'separate_deletions',
                });
            }

            // Check for mixed file categories that might not belong together
            const categories = new Set(group.files.map((f) => f.fileCategory));
            if (categories.has('test') && categories.has('docs') && categories.size === 2) {
                conflicts.push({
                    type: 'logical_inconsistency',
                    severity: 'low',
                    description: `Group ${group.id} mixes tests and documentation without code changes`,
                    involvedGroups: [group.id],
                    suggestedResolution: 'separate_categories',
                });
            }
        }

        return conflicts;
    }

    /**
     * Detects dependency ordering conflicts
     * @private
     * @param groups - Commit groups to analyze
     * @returns Dependency ordering conflicts
     */
    private _detectDependencyOrderingConflicts(groups: CommitGroup[]): Conflict[] {
        const conflicts: Conflict[] = [];
        const dependencyGraph = this._buildDependencyGraph(groups);

        // Check if groups are ordered correctly based on dependencies
        for (let i = 0; i < groups.length; i++) {
            const currentGroup = groups[i];
            const dependencies = dependencyGraph.get(currentGroup.id) || new Set();

            for (let j = i + 1; j < groups.length; j++) {
                const laterGroup = groups[j];

                if (dependencies.has(laterGroup.id)) {
                    conflicts.push({
                        type: 'dependency_ordering',
                        severity: 'high',
                        description: `Group ${currentGroup.id} depends on ${laterGroup.id} but is ordered before it`,
                        involvedGroups: [currentGroup.id, laterGroup.id],
                        suggestedResolution: 'reorder_groups',
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Resolves a single conflict
     * @private
     * @param conflict - Conflict to resolve
     * @param groups - Current commit groups
     * @param context - Context information
     * @returns Resolution result
     */
    private async _resolveConflict(conflict: Conflict, groups: CommitGroup[], context: any): Promise<Resolution> {
        const strategy = this.strategies[this.options.conflictResolutionStrategy];

        if (!strategy) {
            return {
                success: false,
                error: `Unknown resolution strategy: ${this.options.conflictResolutionStrategy}`,
                modifiedGroups: groups,
            };
        }

        try {
            return await strategy(conflict, groups, context);
        } catch (error) {
            return {
                success: false,
                error: `Resolution failed: ${(error as Error).message}`,
                modifiedGroups: groups,
            };
        }
    }

    /**
     * Conservative resolution strategy - minimal changes
     * @private
     * @param conflict - Conflict to resolve
     * @param groups - Current commit groups
     * @param context - Context information
     * @returns Resolution result
     */
    private async _conservativeResolution(conflict: Conflict, groups: CommitGroup[], context: any): Promise<Resolution> {
        const modifiedGroups = [...groups];

        switch (conflict.type) {
            case 'circular_dependency':
                return this._breakCircularDependencyConservatively(conflict, modifiedGroups);

            case 'file_ownership':
                return this._resolveFileOwnershipConservatively(conflict, modifiedGroups);

            case 'logical_inconsistency':
                return this._resolveLogicalInconsistencyConservatively(conflict, modifiedGroups);

            case 'dependency_ordering':
                return this._resolveDependencyOrderingConservatively(conflict, modifiedGroups);

            default:
                return { success: false, error: 'Unknown conflict type', modifiedGroups };
        }
    }

    /**
     * Aggressive resolution strategy - makes significant changes for optimal grouping
     * @private
     * @param conflict - Conflict to resolve
     * @param groups - Current commit groups
     * @param context - Context information
     * @returns Resolution result
     */
    private async _aggressiveResolution(conflict: Conflict, groups: CommitGroup[], context: any): Promise<Resolution> {
        const modifiedGroups = [...groups];

        switch (conflict.type) {
            case 'circular_dependency':
                return this._breakCircularDependencyAggressively(conflict, modifiedGroups);

            case 'file_ownership':
                return this._resolveFileOwnershipAggressively(conflict, modifiedGroups);

            case 'logical_inconsistency':
                return this._resolveLogicalInconsistencyAggressively(conflict, modifiedGroups);

            case 'dependency_ordering':
                return this._resolveDependencyOrderingAggressively(conflict, modifiedGroups);

            default:
                return { success: false, error: 'Unknown conflict type', modifiedGroups };
        }
    }

    /**
     * Balanced resolution strategy - compromise between conservative and aggressive
     * @private
     * @param conflict - Conflict to resolve
     * @param groups - Current commit groups
     * @param context - Context information
     * @returns Resolution result
     */
    private async _balancedResolution(conflict: Conflict, groups: CommitGroup[], context: any): Promise<Resolution> {
        // Try conservative first, fall back to aggressive if needed
        const conservativeResult = await this._conservativeResolution(conflict, groups, context);

        if (conservativeResult.success) {
            return conservativeResult;
        }

        return this._aggressiveResolution(conflict, groups, context);
    }

    /**
     * User-guided resolution strategy - provides options for user to choose
     * @private
     * @param conflict - Conflict to resolve
     * @param groups - Current commit groups
     * @param context - Context information
     * @returns Resolution result
     */
    private async _userGuidedResolution(conflict: Conflict, groups: CommitGroup[], context: any): Promise<Resolution> {
        // This would typically present options to the user
        // For now, we'll use balanced resolution as fallback
        return this._balancedResolution(conflict, groups, context);
    }

    /**
     * Builds a dependency graph from commit groups
     * @private
     * @param groups - Commit groups
     * @returns Dependency graph
     */
    private _buildDependencyGraph(groups: CommitGroup[]): Map<string, Set<string>> {
        const graph = new Map<string, Set<string>>();

        // Initialize graph
        for (const group of groups) {
            graph.set(group.id, new Set());
        }

        // Build dependencies based on file relationships
        for (const group of groups) {
            for (const file of group.files) {
                for (const depPath of file.dependencies || []) {
                    // Find which group contains the dependency
                    const depGroup = groups.find((g) => g.files.some((f) => f.filePath === depPath));

                    if (depGroup && depGroup.id !== group.id) {
                        graph.get(group.id)!.add(depGroup.id);
                    }
                }
            }
        }

        return graph;
    }

    /**
     * Detects cycles in dependency graph using DFS
     * @private
     * @param node - Current node
     * @param graph - Dependency graph
     * @param visited - Visited nodes
     * @param recursionStack - Current recursion stack
     * @param path - Current path
     * @returns Cycle path if found, empty array otherwise
     */
    private _detectCycleFromNode(
        node: string,
        graph: Map<string, Set<string>>,
        visited: Set<string>,
        recursionStack: Set<string>,
        path: string[],
    ): string[] {
        visited.add(node);
        recursionStack.add(node);
        path.push(node);

        const neighbors = graph.get(node) || new Set();

        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                const cycle = this._detectCycleFromNode(neighbor, graph, visited, recursionStack, [...path]);
                if (cycle.length > 0) {
                    return cycle;
                }
            } else if (recursionStack.has(neighbor)) {
                // Found a cycle
                const cycleStart = path.indexOf(neighbor);
                return path.slice(cycleStart).concat([neighbor]);
            }
        }

        recursionStack.delete(node);
        return [];
    }

    /**
     * Breaks circular dependency conservatively
     * @private
     * @param conflict - Circular dependency conflict
     * @param groups - Commit groups
     * @returns Resolution result
     */
    private _breakCircularDependencyConservatively(conflict: Conflict, groups: CommitGroup[]): Resolution {
        // Find the weakest link in the cycle and break it
        const cycle = conflict.involvedGroups;

        // For conservative approach, merge the groups in the cycle
        const primaryGroup = groups.find((g) => g.id === cycle[0]);
        const groupsToMerge = groups.filter((g) => cycle.includes(g.id) && g.id !== cycle[0]);

        if (!primaryGroup) {
            return { success: false, error: 'Primary group not found', modifiedGroups: groups };
        }

        // Merge files from other groups into primary group
        for (const group of groupsToMerge) {
            primaryGroup.files.push(...group.files);
        }

        // Remove merged groups
        const modifiedGroups = groups.filter((g) => !cycle.slice(1).includes(g.id));

        return {
            success: true,
            action: 'merged_circular_groups',
            modifiedGroups: modifiedGroups,
            details: `Merged ${groupsToMerge.length} groups to break circular dependency`,
        };
    }

    /**
     * Resolves file ownership conflict conservatively
     * @private
     * @param conflict - File ownership conflict
     * @param groups - Commit groups
     * @returns Resolution result
     */
    private _resolveFileOwnershipConservatively(conflict: Conflict, groups: CommitGroup[]): Resolution {
        const filePath = conflict.conflictedFile!;
        const involvedGroupIds = conflict.involvedGroups;

        // Find the primary group (first one or largest one)
        const involvedGroups = groups.filter((g) => involvedGroupIds.includes(g.id));
        const primaryGroup = involvedGroups.reduce((largest, current) => (current.files.length > largest.files.length ? current : largest));

        // Remove file from other groups
        for (const group of involvedGroups) {
            if (group.id !== primaryGroup.id) {
                group.files = group.files.filter((f) => f.filePath !== filePath);
            }
        }

        return {
            success: true,
            action: 'assigned_to_primary_group',
            modifiedGroups: groups,
            details: `Assigned ${filePath} to group ${primaryGroup.id}`,
        };
    }

    /**
     * Resolves logical inconsistency conservatively
     * @private
     * @param conflict - Logical inconsistency conflict
     * @param groups - Commit groups
     * @returns Resolution result
     */
    private _resolveLogicalInconsistencyConservatively(conflict: Conflict, groups: CommitGroup[]): Resolution {
        // For conservative approach, just add a warning but don't change structure
        return {
            success: true,
            action: 'added_warning',
            modifiedGroups: groups,
            details: `Added warning for logical inconsistency in group ${conflict.involvedGroups[0]}`,
            warning: conflict.description,
        };
    }

    /**
     * Resolves dependency ordering conflict conservatively
     * @private
     * @param conflict - Dependency ordering conflict
     * @param groups - Commit groups
     * @returns Resolution result
     */
    private _resolveDependencyOrderingConservatively(conflict: Conflict, groups: CommitGroup[]): Resolution {
        const [dependentId, dependencyId] = conflict.involvedGroups;

        // Find the groups
        const dependentIndex = groups.findIndex((g) => g.id === dependentId);
        const dependencyIndex = groups.findIndex((g) => g.id === dependencyId);

        if (dependentIndex === -1 || dependencyIndex === -1) {
            return { success: false, error: 'Groups not found', modifiedGroups: groups };
        }

        // Swap the groups to fix ordering
        const modifiedGroups = [...groups];
        [modifiedGroups[dependentIndex], modifiedGroups[dependencyIndex]] = [modifiedGroups[dependencyIndex], modifiedGroups[dependentIndex]];

        return {
            success: true,
            action: 'reordered_groups',
            modifiedGroups: modifiedGroups,
            details: `Reordered groups to resolve dependency conflict`,
        };
    }

    /**
     * Records resolution attempt for learning purposes
     * @private
     * @param conflicts - Original conflicts
     * @param result - Resolution result
     * @param context - Context information
     */
    private _recordResolutionAttempt(conflicts: Conflict[], result: ResolutionResult, context: any): void {
        this.resolutionHistory.push({
            timestamp: Date.now(),
            conflicts: conflicts,
            strategy: this.options.conflictResolutionStrategy,
            success: result.success,
            resolutions: result.resolutions,
            context: context,
        });

        // Keep only recent history
        if (this.resolutionHistory.length > 100) {
            this.resolutionHistory = this.resolutionHistory.slice(-100);
        }
    }

    /**
     * Gets conflict resolution statistics
     * @returns Resolution statistics
     */
    getResolutionStats(): {
        totalAttempts: number;
        successfulAttempts: number;
        successRate: string;
        conflictTypes: Record<string, number>;
        mostCommonConflict: string;
    } {
        const totalAttempts = this.resolutionHistory.length;
        const successfulAttempts = this.resolutionHistory.filter((h) => h.success).length;

        const conflictTypes: Record<string, number> = {};
        for (const history of this.resolutionHistory) {
            for (const conflict of history.conflicts) {
                conflictTypes[conflict.type] = (conflictTypes[conflict.type] || 0) + 1;
            }
        }

        return {
            totalAttempts,
            successfulAttempts,
            successRate: totalAttempts > 0 ? ((successfulAttempts / totalAttempts) * 100).toFixed(1) + '%' : '0%',
            conflictTypes,
            mostCommonConflict: Object.keys(conflictTypes).reduce((a, b) => (conflictTypes[a] > conflictTypes[b] ? a : b), 'none'),
        };
    }

    // Aggressive resolution methods
    private _breakCircularDependencyAggressively(conflict: Conflict, groups: CommitGroup[]): Resolution {
        return this._breakCircularDependencyConservatively(conflict, groups);
    }

    private _resolveFileOwnershipAggressively(conflict: Conflict, groups: CommitGroup[]): Resolution {
        return this._resolveFileOwnershipConservatively(conflict, groups);
    }

    private _resolveLogicalInconsistencyAggressively(conflict: Conflict, groups: CommitGroup[]): Resolution {
        return this._resolveLogicalInconsistencyConservatively(conflict, groups);
    }

    private _resolveDependencyOrderingAggressively(conflict: Conflict, groups: CommitGroup[]): Resolution {
        return this._resolveDependencyOrderingConservatively(conflict, groups);
    }
}

export { SmartConflictResolver };
