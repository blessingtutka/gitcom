import * as path from 'path';
import * as crypto from 'crypto';
import { CommitGroup, CommitPlan } from './types/models';
import { AnalyzedChange } from './change-analyzer';
import { determineScope } from './utils';
/**
 * Intelligent commit grouping system that analyzes changes and groups them into logical commits
 * Enhanced with performance optimizations including parallel processing and caching
 */
class CommitGrouper {
    protected options: Required<CommitGrouperOptions>;
    private stats: GroupingPerformanceStats;
    private featureNameCache?: Map<string, string>;

    constructor(options: CommitGrouperOptions = {}) {
        this.options = {
            maxFilesPerCommit: options.maxFilesPerCommit || 10,
            separateTestCommits: options.separateTestCommits !== false,
            separateDocCommits: options.separateDocCommits !== false,
            groupingStrategy: options.groupingStrategy || 'intelligent',
            enableParallelProcessing: options.enableParallelProcessing !== false,
            maxConcurrency: options.maxConcurrency || 3,
            batchSize: options.batchSize || 20,
            ...options,
        } as Required<CommitGrouperOptions>;

        // Performance tracking
        this.stats = {
            groupingTime: 0,
            featureDetectionTime: 0,
            relationshipAnalysisTime: 0,
            filesProcessed: 0,
        };
    }

    /**
     * Main entry point for grouping changes into logical commits with performance optimizations
     * @param analyzedChanges - Array of analyzed changes
     * @returns Complete commit plan
     */
    async groupChanges(analyzedChanges: AnalyzedChange[]): Promise<CommitPlan> {
        const startTime = Date.now();

        if (!analyzedChanges || analyzedChanges.length === 0) {
            return new CommitPlan({
                groups: [],
                totalFiles: 0,
                estimatedTime: 0,
                warnings: ['No changes to commit'],
            });
        }

        try {
            this.stats.filesProcessed = analyzedChanges.length;

            // Pre-process changes for better performance
            const preprocessedChanges = this._preprocessChanges(analyzedChanges);

            // Step 1: Detect feature groups
            const featureDetectionStart = Date.now();
            const featureGroups = await this._detectFeatureGroups(preprocessedChanges);
            this.stats.featureDetectionTime = Date.now() - featureDetectionStart;

            // Step 2: Separate different change types (parallel processing)
            const separatedGroups = await this._separateChangeTypesOptimized(featureGroups, preprocessedChanges);

            // Step 3: Order commit groups for optimal sequence
            const orderedGroups = await this.orderCommitGroups(separatedGroups);

            // Create commit plan
            const commitPlan = new CommitPlan({
                groups: orderedGroups,
                totalFiles: analyzedChanges.length,
                estimatedTime: this._estimateCommitTime(orderedGroups),
                warnings: [],
            });

            // Add warnings for large commits
            this._addSizeWarnings(commitPlan);

            this.stats.groupingTime = Date.now() - startTime;
            return commitPlan;
        } catch (error) {
            throw new Error(`Failed to group changes: ${(error as Error).message}`);
        }
    }

    /**
     * Pre-processes changes to build lookup structures for better performance
     * @private
     * @param changes - Array of analyzed changes
     * @returns Preprocessed data structures
     */
    protected _preprocessChanges(changes: AnalyzedChange[]): PreprocessedData {
        const fileMap = new Map<string, AnalyzedChange>();
        const categoryMap = new Map<string, AnalyzedChange[]>();
        const featureMap = new Map<string, AnalyzedChange[]>();
        const directoryMap = new Map<string, AnalyzedChange[]>();

        for (const change of changes) {
            fileMap.set(change.filePath, change);

            // Group by category
            if (!categoryMap.has(change.fileCategory)) {
                categoryMap.set(change.fileCategory, []);
            }
            categoryMap.get(change.fileCategory)!.push(change);

            // Group by features
            for (const feature of change.detectedFeatures) {
                if (!featureMap.has(feature)) {
                    featureMap.set(feature, []);
                }
                featureMap.get(feature)!.push(change);
            }

            // Group by directory
            const dir = path.dirname(change.filePath);
            if (!directoryMap.has(dir)) {
                directoryMap.set(dir, []);
            }
            directoryMap.get(dir)!.push(change);
        }

        return {
            changes,
            fileMap,
            categoryMap,
            featureMap,
            directoryMap,
        };
    }

    /**
     * Groups files that belong to the same feature based on relationships and patterns (legacy method)
     * @param changes - Array of analyzed changes
     * @returns Map of feature names to changes
     */
    // async detectFeatureGroups(changes: AnalyzedChange[]): Promise<Map<string, AnalyzedChange[]>> {
    //     const preprocessed = this._preprocessChanges(changes);
    //     return this._detectFeatureGroups(preprocessed);
    // }

    /**
     * Feature group detection using preprocessed data
     * @private
     * @param preprocessed - Preprocessed data structures
     |* @returns Map of feature names to changes
     */
    private async _detectFeatureGroups(preprocessed: PreprocessedData): Promise<Map<string, AnalyzedChange[]>> {
        const { changes } = preprocessed;
        const featureGroups = new Map<string, AnalyzedChange[]>();
        const processedFiles = new Set<string>();

        // Process changes in batches for better performance
        const batches = this._createBatches(changes, this.options.batchSize);

        for (const batch of batches) {
            // Process batch items in parallel if enabled
            if (this.options.enableParallelProcessing) {
                await this._processBatchParallel(batch, featureGroups, processedFiles, preprocessed);
            } else {
                await this._processBatchSequential(batch, featureGroups, processedFiles, preprocessed);
            }
        }

        return featureGroups;
    }

    /**
     * Processes a batch of changes in parallel
     * @private
     */
    private async _processBatchParallel(
        batch: AnalyzedChange[],
        featureGroups: Map<string, AnalyzedChange[]>,
        processedFiles: Set<string>,
        preprocessed: PreprocessedData,
    ): Promise<void> {
        const batchPromises = batch
            .filter((change) => !processedFiles.has(change.filePath))
            .map((change) => this._processChangeForGrouping(change, preprocessed));

        const results = await this._limitConcurrency(batchPromises, this.options.maxConcurrency);

        // Merge results into feature groups
        for (const result of results) {
            if (result) {
                const { featureName, groupFiles } = result;

                // Check if any files are already processed
                const unprocessedFiles = groupFiles.filter((f) => !processedFiles.has(f.filePath));

                if (unprocessedFiles.length > 0) {
                    if (featureGroups.has(featureName)) {
                        featureGroups.get(featureName)!.push(...unprocessedFiles);
                    } else {
                        featureGroups.set(featureName, unprocessedFiles);
                    }

                    // Mark files as processed
                    unprocessedFiles.forEach((file) => processedFiles.add(file.filePath));
                }
            }
        }
    }

    /**
     * Processes a batch of changes sequentially
     * @private
     */
    private async _processBatchSequential(
        batch: AnalyzedChange[],
        featureGroups: Map<string, AnalyzedChange[]>,
        processedFiles: Set<string>,
        preprocessed: PreprocessedData,
    ): Promise<void> {
        for (const change of batch) {
            if (processedFiles.has(change.filePath)) {
                continue;
            }

            const result = await this._processChangeForGrouping(change, preprocessed);
            if (result) {
                const { featureName, groupFiles } = result;

                const unprocessedFiles = groupFiles.filter((f) => !processedFiles.has(f.filePath));

                if (unprocessedFiles.length > 0) {
                    if (featureGroups.has(featureName)) {
                        featureGroups.get(featureName)!.push(...unprocessedFiles);
                    } else {
                        featureGroups.set(featureName, unprocessedFiles);
                    }

                    unprocessedFiles.forEach((file) => processedFiles.add(file.filePath));
                }
            }
        }
    }

    /**
     * Processes a single change for grouping
     * @private
     */
    private async _processChangeForGrouping(change: AnalyzedChange, preprocessed: PreprocessedData): Promise<FeatureGroupResult | null> {
        try {
            const relatedFiles = this._findRelatedFilesOptimized(change, preprocessed);
            const featureName = this._determineFeatureNameOptimized(change, relatedFiles, preprocessed);
            const groupFiles = [change, ...relatedFiles];

            return { featureName, groupFiles };
        } catch (error) {
            console.warn(`Failed to process change ${change.filePath} for grouping:`, (error as Error).message);
            return null;
        }
    }

    /**
     * Creates batches from an array of items
     * @private
     */
    private _createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Limits concurrency of promise execution
     * @private
     */
    private async _limitConcurrency<T>(promises: Promise<T>[], maxConcurrency: number): Promise<T[]> {
        const results: Promise<T>[] = [];
        const executing: Promise<T>[] = [];

        for (const promise of promises) {
            const p = Promise.resolve(promise).then((result) => {
                executing.splice(executing.indexOf(p), 1);
                return result;
            });

            results.push(p);
            executing.push(p);

            if (executing.length >= maxConcurrency) {
                await Promise.race(executing);
            }
        }

        return Promise.all(results);
    }

    /**
     * Separating different types of changes with parallel processing
     * @private
     * @param featureGroups - Feature groups from detectFeatureGroups
     * @param preprocessed - Preprocessed data structures
     * @returns Array of commit groups
     */
    private async _separateChangeTypesOptimized(
        featureGroups: Map<string, AnalyzedChange[]>,
        preprocessed: PreprocessedData,
    ): Promise<CommitGroup[]> {
        const commitGroups: CommitGroup[] = [];
        let groupId = 1;

        // Convert feature groups to array for parallel processing
        const featureGroupEntries = Array.from(featureGroups.entries());

        if (this.options.enableParallelProcessing && featureGroupEntries.length > 1) {
            // Process feature groups in parallel
            const groupPromises = featureGroupEntries.map(([featureName, files]) =>
                this._processFeatureGroupForSeparation(featureName, files, groupId, preprocessed),
            );

            const results = await this._limitConcurrency(groupPromises, this.options.maxConcurrency);

            // Flatten results and assign proper group IDs
            for (const result of results) {
                if (result && result.groups) {
                    for (const group of result.groups) {
                        group.id = `group-${groupId++}`;
                        commitGroups.push(group);
                    }
                }
            }
        } else {
            // Process sequentially for small numbers of groups
            for (const [featureName, files] of featureGroupEntries) {
                const result = await this._processFeatureGroupForSeparation(featureName, files, groupId, preprocessed);
                if (result && result.groups) {
                    for (const group of result.groups) {
                        group.id = `group-${groupId++}`;
                        commitGroups.push(group);
                    }
                }
            }
        }

        return commitGroups;
    }

    /**
     * Processes a single feature group for change type separation
     * @private
     */
    private async _processFeatureGroupForSeparation(
        featureName: string,
        files: AnalyzedChange[],
        startingGroupId: number,
        preprocessed: PreprocessedData,
    ): Promise<ProcessFeatureGroupResult> {
        try {
            const groups: CommitGroup[] = [];

            // Separate files by category (optimized)
            const categorizedFiles = this._categorizeFilesOptimized(files, preprocessed);

            // Create separate commits for different categories if configured
            if (this.options.separateDocCommits && categorizedFiles.docs.length > 0) {
                groups.push(
                    new CommitGroup({
                        id: `temp-${startingGroupId}`, // Will be reassigned later
                        type: 'docs',
                        scope: determineScope(categorizedFiles.docs),
                        files: categorizedFiles.docs,
                        priority: this._calculatePriority('docs', categorizedFiles.docs),
                    }),
                );
            }

            if (this.options.separateTestCommits && categorizedFiles.test.length > 0) {
                groups.push(
                    new CommitGroup({
                        id: `temp-${startingGroupId}`,
                        type: 'test',
                        scope: determineScope(categorizedFiles.test),
                        files: categorizedFiles.test,
                        priority: this._calculatePriority('test', categorizedFiles.test),
                    }),
                );
            }

            // Handle config files separately as chore commits
            if (categorizedFiles.config.length > 0) {
                groups.push(
                    new CommitGroup({
                        id: `temp-${startingGroupId}`,
                        type: 'chore',
                        scope: determineScope(categorizedFiles.config),
                        files: categorizedFiles.config,
                        priority: this._calculatePriority('chore', categorizedFiles.config),
                    }),
                );
            }

            // Handle style files separately as style commits
            if (categorizedFiles.style.length > 0) {
                groups.push(
                    new CommitGroup({
                        id: `temp-${startingGroupId}`,
                        type: 'style',
                        scope: determineScope(categorizedFiles.style),
                        files: categorizedFiles.style,
                        priority: this._calculatePriority('style', categorizedFiles.style),
                    }),
                );
            }

            // Group remaining files by change intent (feature vs fix)
            const mainFiles = [
                ...categorizedFiles.feature,
                ...(this.options.separateTestCommits ? [] : categorizedFiles.test),
                ...(this.options.separateDocCommits ? [] : categorizedFiles.docs),
            ];

            if (mainFiles.length > 0) {
                const changeType = this._detectChangeIntent(mainFiles, featureName);

                // Split large groups if they exceed maxFilesPerCommit
                const splitGroups = this._splitLargeGroup(mainFiles, changeType, featureName, startingGroupId);
                groups.push(...splitGroups);
            }

            return { groups };
        } catch (error) {
            console.warn(`Failed to process feature group ${featureName}:`, (error as Error).message);
            return { groups: [] };
        }
    }

    /**
     * Optimized version of file categorization using preprocessed data
     * @private
     */
    protected _categorizeFilesOptimized(
        files: AnalyzedChange[],
        preprocessed: PreprocessedData,
    ): {
        feature: AnalyzedChange[];
        test: AnalyzedChange[];
        docs: AnalyzedChange[];
        config: AnalyzedChange[];
        style: AnalyzedChange[];
    } {
        const categories = {
            feature: [] as AnalyzedChange[],
            test: [] as AnalyzedChange[],
            docs: [] as AnalyzedChange[],
            config: [] as AnalyzedChange[],
            style: [] as AnalyzedChange[],
        };

        // Use preprocessed category map if available
        if (preprocessed && preprocessed.categoryMap) {
            for (const file of files) {
                const category = file.fileCategory;
                if (categories.hasOwnProperty(category)) {
                    categories[category as keyof typeof categories].push(file);
                } else {
                    categories.feature.push(file); // Default to feature
                }
            }
        } else {
            // Fallback to original categorization
            for (const file of files) {
                if (categories.hasOwnProperty(file.fileCategory)) {
                    categories[file.fileCategory as keyof typeof categories].push(file);
                } else {
                    categories.feature.push(file);
                }
            }
        }

        return categories;
    }

    /**
     * Separates different types of changes (features, fixes, docs, tests) - legacy method
     * @param featureGroups - Feature groups from detectFeatureGroups
     * @param allChanges - All changes for context
     * @returns Array of commit groups
     */
    async separateChangeTypes(featureGroups: Map<string, AnalyzedChange[]>, allChanges: AnalyzedChange[]): Promise<CommitGroup[]> {
        const preprocessed = this._preprocessChanges(allChanges);
        return this._separateChangeTypesOptimized(featureGroups, preprocessed);
    }

    /**
     * Gets performance statistics for the grouper
     * @returns Performance statistics
     */
    getPerformanceStats(): GroupingPerformanceStats {
        const cacheHitRate =
            this.stats.filesProcessed > 0 ? (this.stats.groupingTime / this.stats.filesProcessed).toFixed(2) + 'ms per file' : '0ms per file';
        const featureDetectionPercentage =
            this.stats.groupingTime > 0 ? ((this.stats.featureDetectionTime / this.stats.groupingTime) * 100).toFixed(1) + '%' : '0%';

        return {
            ...this.stats,
            averageGroupingTime: cacheHitRate,
            featureDetectionPercentage,
        };
    }

    /**
     * Orders commit groups to determine optimal commit sequence
     * @param groups - Array of commit groups
     * @returns Ordered array of commit groups
     */
    async orderCommitGroups(groups: CommitGroup[]): Promise<CommitGroup[]> {
        // Sort by priority first, then by dependencies
        const sortedGroups = [...groups].sort((a, b) => {
            // Higher priority first
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }

            // Then by type preference: chore -> feature -> fix -> refactor -> test -> docs -> style
            const typeOrder: { [key: string]: number } = { chore: 0, feat: 1, fix: 2, refactor: 3, test: 4, docs: 5, style: 6 };
            const aOrder = typeOrder[a.type] || 999;
            const bOrder = typeOrder[b.type] || 999;

            return aOrder - bOrder;
        });

        // Check for dependency conflicts and reorder if necessary
        return this._resolveDependencyOrder(sortedGroups);
    }

    /**
     * Optimized version of finding related files using preprocessed data
     * @private
     * @param change - The change to find relations for
     * @param preprocessed - Preprocessed data structures
     * @returns Array of related changes
     */
    private _findRelatedFilesOptimized(change: AnalyzedChange, preprocessed: PreprocessedData): AnalyzedChange[] {
        const { fileMap, featureMap, directoryMap } = preprocessed;
        const related = new Set<AnalyzedChange>(); // Use Set to automatically handle duplicates

        // Add explicitly declared dependencies (optimized lookup)
        for (const depPath of change.dependencies) {
            const depChange = fileMap.get(depPath);
            if (depChange) {
                related.add(depChange);
            }
        }

        // Add files that depend on this change (reverse lookup)
        for (const otherChange of preprocessed.changes) {
            if (otherChange.filePath === change.filePath) continue;

            if (otherChange.dependencies.includes(change.filePath)) {
                related.add(otherChange);
            }
        }

        // Add files with shared features (optimized using feature map)
        for (const feature of change.detectedFeatures) {
            const featuredFiles = featureMap.get(feature);
            if (featuredFiles) {
                for (const file of featuredFiles) {
                    if (file.filePath !== change.filePath) {
                        related.add(file);
                    }
                }
            }
        }

        // Add files in the same directory (optimized using directory map)
        const changeDir = path.dirname(change.filePath);
        const sameDirFiles = directoryMap.get(changeDir);
        if (sameDirFiles) {
            for (const file of sameDirFiles) {
                if (file.filePath !== change.filePath) {
                    related.add(file);
                }
            }
        }

        return Array.from(related);
    }

    /**
     * Finds files related to the given change based on dependencies and patterns (legacy method
     * @private
     * @param change - The change to find relations for
     * @param allChanges - All changes to search through
     * @returns Array of related changes
     */
    private _findRelatedFiles(change: AnalyzedChange, allChanges: AnalyzedChange[]): AnalyzedChange[] {
        // Create temporary preprocessed data for compatibility
        const preprocessed = this._preprocessChanges(allChanges);
        return this._findRelatedFilesOptimized(change, preprocessed);
    }

    /**
     * Optimized version of determining feature name using cached analysis
     * @private
     * @param primaryChange - The primary change in the group
     * @param relatedFiles - Related files in the group
     * @param preprocessed - Preprocessed data structures
     * @returns Feature name
     */
    private _determineFeatureNameOptimized(primaryChange: AnalyzedChange, relatedFiles: AnalyzedChange[], preprocessed: PreprocessedData): string {
        const allFiles = [primaryChange, ...relatedFiles];

        // Use cached feature analysis if available
        const cacheKey = this._generateFeatureCacheKey(allFiles);
        if (this.featureNameCache && this.featureNameCache.has(cacheKey)) {
            return this.featureNameCache.get(cacheKey)!;
        }

        // Advanced feature name detection based on multiple factors
        const featureAnalysis = this._analyzeFeatureContextOptimized(allFiles);

        let featureName;

        // Priority 1: Domain-specific feature names from imports/exports
        if (featureAnalysis.domainFeatures.length > 0) {
            featureName = featureAnalysis.domainFeatures[0];
        }
        // Priority 2: Most common meaningful feature across files
        else if (featureAnalysis.meaningfulFeatures && featureAnalysis.meaningfulFeatures.length > 0) {
            featureName = featureAnalysis.meaningfulFeatures[0][0];
        }
        // Priority 3: Directory-based naming with context
        else {
            const contextualDirName = this._getContextualDirectoryNameOptimized(allFiles);
            if (contextualDirName) {
                featureName = contextualDirName;
            } else {
                // Priority 4: Function/class name extraction
                const extractedNames = this._extractEntityNamesOptimized(allFiles);
                if (extractedNames.length > 0) {
                    featureName = extractedNames[0];
                } else {
                    // Final fallback to filename
                    featureName = path.basename(primaryChange.filePath, path.extname(primaryChange.filePath));
                }
            }
        }

        // Cache the result
        if (!this.featureNameCache) {
            this.featureNameCache = new Map();
        }
        this.featureNameCache.set(cacheKey, featureName);

        return featureName;
    }

    /**
     * Generates a cache key for feature name determination
     * @private
     */
    private _generateFeatureCacheKey(files: AnalyzedChange[]): string {
        const filePaths = files
            .map((f) => f.filePath)
            .sort()
            .join('|');
        return crypto.createHash('md5').update(filePaths).digest('hex');
    }

    /**
     * Optimized version of feature context analysis
     * @private
     */
    private _analyzeFeatureContextOptimized(files: AnalyzedChange[]): FeatureAnalysisResult {
        const featureCounts: { [key: string]: number } = {};
        const domainFeatures: string[] = [];

        for (const file of files) {
            // Count detected features
            for (const feature of file.detectedFeatures) {
                featureCounts[feature] = (featureCounts[feature] || 0) + 1;
            }

            // Extract domain features from imports (only process added lines for performance)
            const addedLines = file.diff.split('\n').filter((line) => line.startsWith('+'));
            for (const line of addedLines) {
                if (line.includes('import') || line.includes('require')) {
                    const domainFeature = this._extractDomainFeatureFromLine(line);
                    if (domainFeature) {
                        domainFeatures.push(domainFeature);
                    }
                }
            }
        }

        const commonFeatures = Object.entries(featureCounts).sort(([, a], [, b]) => b - a);
        const meaningfulFeatures = commonFeatures.filter(
            ([name]) => name.length > 2 && !['src', 'lib', 'utils', 'common', 'index'].includes(name.toLowerCase()),
        );

        return {
            commonFeatures,
            meaningfulFeatures,
            domainFeatures: [...new Set(domainFeatures)],
        };
    }

    /**
     * Extracts domain feature from a single line (optimized)
     * @private
     */
    private _extractDomainFeatureFromLine(line: string): string | null {
        const importMatch = line.match(/import.*from\s+['"`]([^'"`]+)['"`]/);
        const requireMatch = line.match(/require\(['"`]([^'"`]+)['"`]\)/);

        const modulePath = importMatch ? importMatch[1] : requireMatch ? requireMatch[1] : null;

        if (modulePath && !modulePath.startsWith('.') && !['react', 'vue', 'angular', 'lodash', 'axios', 'express'].includes(modulePath)) {
            const parts = modulePath.split('/').filter((part) => part && !['@', 'lib', 'src', 'dist', 'build'].includes(part));

            if (parts.length > 0) {
                return parts[parts.length - 1];
            }
        }

        return null;
    }

    /**
     * Optimized version of contextual directory name extraction
     * @private
     */
    private _getContextualDirectoryNameOptimized(files: AnalyzedChange[]): string | null {
        const directories = files.map((f) => path.dirname(f.filePath));
        const commonDir = this._findCommonDirectory(directories);

        if (commonDir && commonDir !== '.' && commonDir !== '') {
            const dirParts = commonDir.split(path.sep).filter((part) => part);
            const meaningfulParts = dirParts.filter(
                (part) => !['src', 'lib', 'components', 'modules', 'services', 'utils'].includes(part.toLowerCase()),
            );

            if (meaningfulParts.length > 0) {
                return meaningfulParts[meaningfulParts.length - 1];
            }
        }

        return null;
    }

    /**
     * Optimized version of entity name extraction
     * @private
     */
    private _extractEntityNamesOptimized(files: AnalyzedChange[]): string[] {
        const entityNames = new Set<string>();

        for (const file of files) {
            // Only process added lines for performance
            const addedLines = file.diff.split('\n').filter((line) => line.startsWith('+'));

            for (const line of addedLines) {
                // Extract function names (optimized regex)
                const functionMatches = line.match(
                    /(?:function\s+(\w+)|const\s+(\w+)\s*=|(\w+)\s*:\s*function|class\s+(\w+)|export\s+(?:const|let|var|function|class)\s+(\w+))/g,
                );

                if (functionMatches) {
                    for (const match of functionMatches) {
                        const nameMatch = match.match(/(\w+)/);
                        if (nameMatch && nameMatch[1].length > 2) {
                            entityNames.add(nameMatch[1]);
                        }
                    }
                }
            }
        }

        return Array.from(entityNames).sort((a, b) => b.length - a.length);
    }

    /**
     * Extracts domain feature from module path
     * @private
     * @param modulePath - Module path from import/require
     * @returns Domain feature name
     */
    private _extractDomainFeature(modulePath: string): string | null {
        // Skip relative imports and common libraries
        if (modulePath.startsWith('.') || ['react', 'vue', 'angular', 'lodash', 'axios', 'express'].includes(modulePath)) {
            return null;
        }

        // Extract meaningful parts from module paths
        const parts = modulePath.split('/').filter((part) => part && !['@', 'lib', 'src', 'dist', 'build'].includes(part));

        if (parts.length > 0) {
            return parts[parts.length - 1];
        }

        return null;
    }

    /**
     * Gets contextual directory name considering the project structure
     * @private
     * @param files - Files to analyze
     * @returns Contextual directory name
     */
    private _getContextualDirectoryName(files: AnalyzedChange[]): string | null {
        const directories = files.map((f) => path.dirname(f.filePath));
        const commonDir = this._findCommonDirectory(directories);

        if (commonDir && commonDir !== '.' && commonDir !== '') {
            const dirParts = commonDir.split(path.sep).filter((part) => part);

            // Skip generic directory names
            const meaningfulParts = dirParts.filter(
                (part) => !['src', 'lib', 'components', 'modules', 'services', 'utils'].includes(part.toLowerCase()),
            );

            if (meaningfulParts.length > 0) {
                return meaningfulParts[meaningfulParts.length - 1];
            }
        }

        return null;
    }

    /**
     * Extracts entity names (functions, classes, etc.) from file changes
     * @private
     * @param files - Files to analyze
     * @returns Array of extracted entity names
     */
    private _extractEntityNames(files: AnalyzedChange[]): string[] {
        const entityNames: string[] = [];

        for (const file of files) {
            const addedLines = file.diff.split('\n').filter((line) => line.startsWith('+'));

            for (const line of addedLines) {
                // Extract function names
                const functionMatch = line.match(/function\s+(\w+)|const\s+(\w+)\s*=.*=>|(\w+)\s*:\s*function/);
                if (functionMatch) {
                    const name = functionMatch[1] || functionMatch[2] || functionMatch[3];
                    if (name && name.length > 2) {
                        entityNames.push(name);
                    }
                }

                // Extract class names
                const classMatch = line.match(/class\s+(\w+)/);
                if (classMatch && classMatch[1].length > 2) {
                    entityNames.push(classMatch[1]);
                }

                // Extract exported names
                const exportMatch = line.match(/export\s+(?:const|let|var|function|class)\s+(\w+)/);
                if (exportMatch && exportMatch[1].length > 2) {
                    entityNames.push(exportMatch[1]);
                }
            }
        }

        // Return unique names, prioritizing longer/more specific names
        return [...new Set(entityNames)].sort((a, b) => b.length - a.length);
    }

    /**
     * Categorizes files by their category type
     * @private
     * @param files - Files to categorize
     * @returns Object with categorized file arrays
     */
    private _categorizeFiles(files: AnalyzedChange[]): {
        feature: AnalyzedChange[];
        test: AnalyzedChange[];
        docs: AnalyzedChange[];
        config: AnalyzedChange[];
        style: AnalyzedChange[];
    } {
        const categories = {
            feature: [] as AnalyzedChange[],
            test: [] as AnalyzedChange[],
            docs: [] as AnalyzedChange[],
            config: [] as AnalyzedChange[],
            style: [] as AnalyzedChange[],
        };

        for (const file of files) {
            if (categories.hasOwnProperty(file.fileCategory)) {
                categories[file.fileCategory as keyof typeof categories].push(file);
            } else {
                categories.feature.push(file); // Default to feature
            }
        }

        return categories;
    }

    /**
     * Detects the intent of changes (feature addition vs bug fix)
     * @private
     * @param files - Files to analyze
     * @param featureName - Name of the feature
     * @returns Change type ('feat' or 'fix')
     */
    protected _detectChangeIntent(files: AnalyzedChange[], featureName: string): CommitType {
        // Advanced heuristics for detecting fixes vs features
        const fixKeywords = ['fix', 'bug', 'error', 'issue', 'patch', 'hotfix', 'repair', 'correct', 'resolve'];
        const featureKeywords = ['add', 'new', 'create', 'implement', 'feature', 'enhance', 'improve', 'extend'];
        const refactorKeywords = ['refactor', 'restructure', 'reorganize', 'cleanup', 'optimize'];

        const featureNameLower = featureName.toLowerCase();

        // Check if feature name suggests a fix
        if (fixKeywords.some((keyword) => featureNameLower.includes(keyword))) {
            return 'fix';
        }

        // Check if feature name suggests a refactor
        if (refactorKeywords.some((keyword) => featureNameLower.includes(keyword))) {
            return 'refactor';
        }

        // Check if feature name suggests a new feature
        if (featureKeywords.some((keyword) => featureNameLower.includes(keyword))) {
            return 'feat';
        }

        // Analyze diff content for fix patterns
        const fixPatterns = this._analyzeFixPatterns(files);
        if (fixPatterns.score > 0.6) {
            return 'fix';
        }

        // Analyze file changes for clues
        const changeAnalysis = this._analyzeChangePatterns(files);

        if (changeAnalysis.isRefactor) {
            return 'refactor';
        }

        if (changeAnalysis.isFix) {
            return 'fix';
        }

        if (changeAnalysis.isFeature) {
            return 'feat';
        }

        // Handle empty or very small changes first (before other analysis)
        const totalLines = files.reduce((sum, f) => sum + f.linesAdded + f.linesRemoved, 0);
        if (totalLines === 0) {
            return 'feat'; // Empty changes are likely placeholders for features
        }

        // Default to feature
        return 'feat';
    }

    /**
     * Analyzes diff content for patterns that suggest bug fixes
     * @private
     * @param files - Files to analyze
     * @returns Analysis result with score and patterns found
     */
    private _analyzeFixPatterns(files: AnalyzedChange[]): FixPatternAnalysis {
        let score = 0;
        const patterns: string[] = [];

        for (const file of files) {
            const diffLines = file.diff.split('\n');

            for (const line of diffLines) {
                if (line.startsWith('+') || line.startsWith('-')) {
                    // Look for common fix patterns
                    if (/\b(null|undefined)\b/.test(line) && /check|validate|guard/.test(line)) {
                        score += 0.3;
                        patterns.push('null_check');
                    }

                    if (/try\s*{|catch\s*\(/.test(line)) {
                        score += 0.2;
                        patterns.push('error_handling');
                    }

                    if (/===?\s*(null|undefined|false|0|""|'')|!==?\s*(null|undefined)/.test(line)) {
                        score += 0.2;
                        patterns.push('condition_fix');
                    }

                    if (/\b(fix|bug|error|issue)\b/i.test(line)) {
                        score += 0.1;
                        patterns.push('fix_comment');
                    }

                    // Look for off-by-one errors
                    if (/[<>]=?\s*\d+|[+-]\s*1\b/.test(line)) {
                        score += 0.1;
                        patterns.push('boundary_fix');
                    }
                }
            }
        }

        return { score: Math.min(score, 1.0), patterns };
    }

    /**
     * Analyzes change patterns to determine the type of change
     * @private
     * @param files - Files to analyze
     * @returns Analysis result with change type indicators
     */
    private _analyzeChangePatterns(files: AnalyzedChange[]): ChangePatternAnalysis {
        const hasNewFiles = files.some((f) => f.changeType === 'added');
        const hasOnlyModifications = files.every((f) => f.changeType === 'modified');
        const hasDeletedFiles = files.some((f) => f.changeType === 'deleted');
        const smallChanges = files.every((f) => f.linesAdded + f.linesRemoved < 50);
        const mediumChanges = files.some((f) => f.linesAdded + f.linesRemoved > 50 && f.linesAdded + f.linesRemoved < 200);
        const largeChanges = files.some((f) => f.linesAdded + f.linesRemoved > 200);

        // Calculate change ratios
        const totalAdded = files.reduce((sum, f) => sum + f.linesAdded, 0);
        const totalRemoved = files.reduce((sum, f) => sum + f.linesRemoved, 0);
        const changeRatio = totalRemoved > 0 ? totalAdded / totalRemoved : totalAdded > 0 ? Infinity : 0;

        // Refactor indicators
        const isRefactor =
            hasOnlyModifications && changeRatio > 0.5 && changeRatio < 2.0 && (mediumChanges || largeChanges) && !this._hasNewFunctionality(files);

        // Fix indicators (but not for empty changes)
        const isFix =
            totalAdded + totalRemoved > 0 &&
            ((hasOnlyModifications && smallChanges) || (changeRatio < 0.5 && totalRemoved > totalAdded) || this._hasErrorHandlingChanges(files));

        // Feature indicators
        const isFeature = hasNewFiles || (changeRatio > 2.0 && totalAdded > 20) || this._hasNewFunctionality(files);

        return {
            isRefactor,
            isFix,
            isFeature,
            hasNewFiles,
            hasOnlyModifications,
            hasDeletedFiles,
            smallChanges,
            changeRatio,
        };
    }

    /**
     * Checks if changes include new functionality
     * @private
     * @param files - Files to analyze
     * @returns True if new functionality is detected
     */
    private _hasNewFunctionality(files: AnalyzedChange[]): boolean {
        for (const file of files) {
            const addedLines = file.diff.split('\n').filter((line) => line.startsWith('+'));

            for (const line of addedLines) {
                // Look for new function/method/class definitions
                if (/^\+.*\b(function|class|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=)/.test(line)) {
                    return true;
                }

                // Look for new API endpoints or routes
                if (/^\+.*\b(app\.|router\.|@\w+Mapping|@RequestMapping)/.test(line)) {
                    return true;
                }

                // Look for new exports
                if (/^\+.*\b(export|module\.exports)/.test(line)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Checks if changes include error handling improvements
     * @private
     * @param files - Files to analyze
     * @returns True if error handling changes are detected
     */
    private _hasErrorHandlingChanges(files: AnalyzedChange[]): boolean {
        for (const file of files) {
            const diffLines = file.diff.split('\n');

            for (const line of diffLines) {
                if (line.startsWith('+')) {
                    if (/\b(try|catch|throw|error|exception|validate|check)\b/i.test(line)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Splits large groups that exceed maxFilesPerCommit
     * @private
     * @param files - Files to potentially split
     * @param changeType - Type of change
     * @param featureName - Feature name
     * @param startingId - Starting ID for groups
     * @returns Array of commit groups
     */
    protected _splitLargeGroup(files: AnalyzedChange[], changeType: CommitType, featureName: string, startingId: number): CommitGroup[] {
        if (files.length <= this.options.maxFilesPerCommit) {
            return [
                new CommitGroup({
                    id: `group-${startingId}`,
                    type: changeType,
                    scope: determineScope(files),
                    files: files,
                    priority: this._calculatePriority(changeType, files),
                }),
            ];
        }

        // Split into multiple groups
        const groups: CommitGroup[] = [];
        for (let i = 0; i < files.length; i += this.options.maxFilesPerCommit) {
            const groupFiles = files.slice(i, i + this.options.maxFilesPerCommit);
            const groupNumber = Math.floor(i / this.options.maxFilesPerCommit) + 1;

            groups.push(
                new CommitGroup({
                    id: `group-${startingId + groups.length}`,
                    type: changeType,
                    scope: determineScope(groupFiles),
                    files: groupFiles,
                    priority: this._calculatePriority(changeType, groupFiles),
                }),
            );
        }

        return groups;
    }

    /**
     * Calculates priority for a commit group
     * @private
     * @param type - Commit type
     * @param files - Files in the commit
     * @returns Priority score (higher = more important)
     */
    protected _calculatePriority(type: string, files: AnalyzedChange[]): number {
        let priority = 0;

        // Base priority by type
        const typePriorities: { [key: string]: number } = { chore: 100, fix: 80, feat: 60, refactor: 50, test: 40, docs: 20, style: 10 };
        priority += typePriorities[type] || 0;

        // Boost priority for files with many dependencies
        const avgDependencies = files.reduce((sum, f) => sum + f.dependencies.length, 0) / files.length;
        priority += avgDependencies * 5;

        // Boost priority for larger changes
        const totalLines = files.reduce((sum, f) => sum + f.linesAdded + f.linesRemoved, 0);
        priority += Math.min(totalLines / 10, 20); // Cap at 20 points

        return Math.round(priority);
    }

    /**
     * Finds the common directory path among multiple directories
     * @private
     * @param dirs - Array of directory paths
     * @returns Common directory path
     */
    private _findCommonDirectory(dirs: string[]): string {
        if (dirs.length === 0) return '';
        if (dirs.length === 1) return dirs[0];

        const pathParts = dirs.map((dir) => dir.split(path.sep));
        const minLength = Math.min(...pathParts.map((parts) => parts.length));

        let commonParts: string[] = [];
        for (let i = 0; i < minLength; i++) {
            const part = pathParts[0][i];
            if (pathParts.every((parts) => parts[i] === part)) {
                commonParts.push(part);
            } else {
                break;
            }
        }

        return commonParts.join(path.sep);
    }

    /**
     * Resolves dependency order conflicts in commit groups using topological sorting
     * @private
     * @param groups - Array of commit groups
     * @returns Reordered array of commit groups
     */
    private _resolveDependencyOrder(groups: CommitGroup[]): CommitGroup[] {
        // Build dependency graph between commit groups
        const dependencyGraph = this._buildCommitDependencyGraph(groups);

        // Perform topological sort
        const sortedGroups = this._topologicalSort(groups, dependencyGraph);

        return sortedGroups;
    }

    /**
     * Builds a dependency graph between commit groups
     * @private
     * @param groups - Array of commit groups
     * @returns Dependency graph (group ID -> dependent group IDs)
     */
    private _buildCommitDependencyGraph(groups: CommitGroup[]): Map<string, Set<string>> {
        const graph = new Map<string, Set<string>>();

        // Initialize graph
        for (const group of groups) {
            graph.set(group.id, new Set());
        }

        // Build dependencies between groups
        for (const group of groups) {
            const groupFiles = new Set(group.files.map((f) => f.filePath));

            for (const otherGroup of groups) {
                if (group.id === otherGroup.id) continue;

                // Check if any file in this group depends on files in the other group
                const hasDependency = group.files.some((file) =>
                    file.dependencies.some((dep: any) => otherGroup.files.some((otherFile) => otherFile.filePath === dep)),
                );

                if (hasDependency) {
                    graph.get(otherGroup.id)!.add(group.id);
                }
            }
        }

        return graph;
    }

    /**
     * Performs topological sort on commit groups
     * @private
     * @param groups - Array of commit groups
     * @param graph - Dependency graph
     * @returns Topologically sorted groups
     */
    private _topologicalSort(groups: CommitGroup[], graph: Map<string, Set<string>>): CommitGroup[] {
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const result: CommitGroup[] = [];
        const groupMap = new Map(groups.map((g) => [g.id, g]));

        const visit = (groupId: string) => {
            if (visiting.has(groupId)) {
                // Circular dependency detected - break it by priority
                return;
            }

            if (visited.has(groupId)) {
                return;
            }

            visiting.add(groupId);

            // Visit all dependencies first
            for (const dependentId of graph.get(groupId) || []) {
                visit(dependentId);
            }

            visiting.delete(groupId);
            visited.add(groupId);
            result.push(groupMap.get(groupId)!);
        };

        // Visit all groups
        for (const group of groups) {
            visit(group.id);
        }

        return result;
    }

    /**
     * Estimates the time needed to create all commits
     * @private
     * @param groups - Array of commit groups
     * @returns Estimated time in seconds
     */
    protected _estimateCommitTime(groups: CommitGroup[]): number {
        // Rough estimate: 5 seconds per commit + 1 second per file
        const baseTime = groups.length * 5;
        const fileTime = groups.reduce((sum, group) => sum + group.files.length, 0);
        return baseTime + fileTime;
    }

    /**
     * Adds warnings for large commits or potential issues
     * @private
     * @param commitPlan - The commit plan to add warnings to
     */
    protected _addSizeWarnings(commitPlan: CommitPlan): void {
        for (const group of commitPlan.groups) {
            if (group.files.length > this.options.maxFilesPerCommit) {
                commitPlan.addWarning(
                    `Commit "${group.id}" contains ${group.files.length} files, which exceeds the recommended maximum of ${this.options.maxFilesPerCommit}`,
                );
            }

            const totalLines = group.getLineStats();
            if (totalLines.added + totalLines.removed > 500) {
                commitPlan.addWarning(
                    `Commit "${group.id}" contains ${totalLines.added + totalLines.removed} line changes, consider splitting into smaller commits`,
                );
            }
        }

        if (commitPlan.groups.length > 10) {
            commitPlan.addWarning(
                `This commit plan contains ${commitPlan.groups.length} commits, which may be excessive. Consider grouping related changes together.`,
            );
        }

        // Add warning for complex dependency chains
        const filesWithManyDeps = commitPlan.groups.flatMap((g) => g.files).filter((f) => f.dependencies.length > 3);
        if (filesWithManyDeps.length > 0) {
            commitPlan.addWarning(`Found ${filesWithManyDeps.length} files with complex dependencies, review commit order carefully`);
        }
    }
}

export { CommitGrouper };
