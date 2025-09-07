import simpleGit, { StatusResult } from 'simple-git';
import path from 'path';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import { AdvancedFeatureDetector } from './advanced-feature-detector';

/**
 * Cache for storing analysis results to avoid reprocessing unchanged files
 */
class AnalysisCache {
    private cache: Map<string, any>;
    private maxSize: number;
    private accessOrder: string[];

    constructor(maxSize: number = 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.accessOrder = [];
    }

    get(key: string): any {
        if (this.cache.has(key)) {
            // Move to end of access order (most recently used)
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
            this.accessOrder.push(key);
            return this.cache.get(key);
        }
        return null;
    }

    set(key: string, value: any): void {
        // Remove oldest entries if cache is full
        while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
            const oldestKey = this.accessOrder.shift()!;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, value);
        this.accessOrder.push(key);
    }

    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
    }

    size(): number {
        return this.cache.size;
    }
}

/**
 * Data structure representing an analyzed change
 */
class AnalyzedChange {
    filePath: string;
    changeType: string; // 'added' | 'modified' | 'deleted' | 'renamed'
    diff: string;
    linesAdded: number;
    linesRemoved: number;
    fileCategory: string; // 'feature' | 'test' | 'docs' | 'config' | 'style'
    detectedFeatures: string[];
    dependencies: string[];
    advancedFeatures: Feature[];

    constructor({
        filePath,
        changeType,
        diff,
        linesAdded = 0,
        linesRemoved = 0,
        fileCategory = 'feature',
        detectedFeatures = [],
        dependencies = [],
    }: {
        filePath: string;
        changeType: string;
        diff: string;
        linesAdded?: number;
        linesRemoved?: number;
        fileCategory?: string;
        detectedFeatures?: string[];
        dependencies?: string[];
    }) {
        this.filePath = filePath;
        this.changeType = changeType;
        this.diff = diff;
        this.linesAdded = linesAdded;
        this.linesRemoved = linesRemoved;
        this.fileCategory = fileCategory;
        this.detectedFeatures = detectedFeatures;
        this.dependencies = dependencies;
        this.advancedFeatures = [];
    }
}

interface ChangeAnalyzerOptions {
    enableCache?: boolean;
    maxCacheSize?: number;
    batchSize?: number;
    maxConcurrency?: number;
    maxDiffSize?: number;
    [key: string]: any;
}

interface PerformanceStats {
    cacheHits: number;
    cacheMisses: number;
    filesProcessed: number;
    batchesProcessed: number;
    totalProcessingTime: number;
}

/**
 * Core analysis infrastructure for intelligent commit generation
 * Analyzes unstaged files and their changes to prepare for intelligent grouping
 * Enhanced with performance optimizations including caching, parallel processing, and batching
 */
class ChangeAnalyzer {
    private workspaceRoot: string;
    private git: ReturnType<typeof simpleGit>;
    private options: Required<ChangeAnalyzerOptions>;
    private cache: AnalysisCache | null;
    private stats: PerformanceStats;

    constructor(workspaceRoot?: string, options: ChangeAnalyzerOptions = {}) {
        this.workspaceRoot = workspaceRoot || process.cwd();
        this.git = simpleGit(this.workspaceRoot);

        // Performance optimization options
        this.options = {
            enableCache: options.enableCache !== false,
            maxCacheSize: options.maxCacheSize || 1000,
            batchSize: options.batchSize || 10,
            maxConcurrency: options.maxConcurrency || 5,
            maxDiffSize: options.maxDiffSize || 1024 * 1024, // 1MB
            ...options,
        } as Required<ChangeAnalyzerOptions>;

        // Initialize cache if enabled
        this.cache = this.options.enableCache ? new AnalysisCache(this.options.maxCacheSize) : null;

        // Track processing statistics
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            filesProcessed: 0,
            batchesProcessed: 0,
            totalProcessingTime: 0,
        };
    }

    /**
     * Analyzes all unstaged changes in the repository with performance optimizations
     * @returns {Promise<AnalyzedChange[]>} Array of analyzed changes
     */
    async analyzeUnstagedChanges(): Promise<AnalyzedChange[]> {
        const startTime = Date.now();

        try {
            const status = await this.git.status();
            const unstagedFiles = [...status.not_added, ...status.modified, ...status.deleted, ...status.renamed.map((r: any) => r.to)];

            if (unstagedFiles.length === 0) {
                return [];
            }

            // Process files in batches with parallel processing
            const analyzedChanges = await this._processFilesInBatches(unstagedFiles, status);

            // Analyze relationships between files (optimized)
            await this._analyzeFileRelationshipsOptimized(analyzedChanges);

            // Update statistics
            this.stats.filesProcessed += unstagedFiles.length;
            this.stats.totalProcessingTime += Date.now() - startTime;

            return analyzedChanges;
        } catch (error) {
            throw new Error(`Failed to analyze unstaged changes: ${(error as Error).message}`);
        }
    }

    /**
     * Processes files in batches with parallel processing for better performance
     * @private
     * @param {string[]} filePaths - Array of file paths to process
     * @param {Object} status - Git status object
     * @returns {Promise<AnalyzedChange[]>} Array of analyzed changes
     */
    private async _processFilesInBatches(filePaths: string[], status: StatusResult): Promise<AnalyzedChange[]> {
        const analyzedChanges: AnalyzedChange[] = [];
        const batches = this._createBatches(filePaths, this.options.batchSize);

        for (const batch of batches) {
            const batchStartTime = Date.now();

            // Process batch with limited concurrency
            const batchPromises = batch.map((filePath) =>
                this._analyzeFileWithCache(filePath, status).catch((error) => {
                    console.warn(`Failed to analyze file ${filePath}:`, (error as Error).message);
                    return null; // Continue with other files
                }),
            );

            // Limit concurrency to prevent overwhelming the system
            const batchResults = await this._limitConcurrency(batchPromises, this.options.maxConcurrency);

            // Filter out null results and add to analyzed changes
            analyzedChanges.push(...batchResults.filter((result): result is AnalyzedChange => result !== null));

            this.stats.batchesProcessed++;

            // Optional: Add small delay between batches to prevent system overload
            if (batches.length > 10 && Date.now() - batchStartTime < 50) {
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }

        return analyzedChanges;
    }

    /**
     * Creates batches from an array of items
     * @private
     * @param {Array} items - Items to batch
     * @param {number} batchSize - Size of each batch
     * @returns {Array[]} Array of batches
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
     * @param {Promise[]} promises - Array of promises
     * @param {number} maxConcurrency - Maximum concurrent executions
     * @returns {Promise<Array>} Results array
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
     * Analyzes a file with caching support
     * @private
     * @param {string} filePath - Path to the file
     * @param {Object} status - Git status object
     * @returns {Promise<AnalyzedChange>} Analyzed change object
     */
    private async _analyzeFileWithCache(filePath: string, status: StatusResult): Promise<AnalyzedChange> {
        if (!this.cache) {
            return this._analyzeFile(filePath, status);
        }

        // Generate cache key based on file path and modification time
        const cacheKey = await this._generateCacheKey(filePath);

        // Check cache first
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.stats.cacheHits++;
            return cached;
        }

        // Cache miss - analyze file
        this.stats.cacheMisses++;
        const result = await this._analyzeFile(filePath, status);

        // Store in cache
        if (result) {
            this.cache.set(cacheKey, result);
        }

        return result;
    }

    /**
     * Generates a cache key for a file based on its path and modification time
     * @private
     * @param {string} filePath - Path to the file
     * @returns {Promise<string>} Cache key
     */
    private async _generateCacheKey(filePath: string): Promise<string> {
        try {
            const fullPath = path.resolve(this.workspaceRoot, filePath);
            const stats = await fs.stat(fullPath);
            const content = `${filePath}:${stats.mtime.getTime()}:${stats.size}`;
            return crypto.createHash('md5').update(content).digest('hex');
        } catch (error) {
            // If we can't get file stats, use just the file path
            return crypto.createHash('md5').update(filePath).digest('hex');
        }
    }

    /**
     * Gets the diff content for a specific file with memory management
     * @param {string} filePath - Path to the file
     * @returns {Promise<string>} Diff content (truncated if too large)
     */
    async getFileChanges(filePath: string): Promise<string> {
        try {
            // For unstaged changes, we don't use --cached
            const diff = await this.git.diff([filePath]);

            // Truncate very large diffs to prevent memory issues
            if (diff.length > this.options.maxDiffSize) {
                const truncatedDiff = diff.substring(0, this.options.maxDiffSize);
                console.warn(`Diff for ${filePath} truncated due to size (${diff.length} bytes)`);
                return truncatedDiff + '\n... [diff truncated due to size]';
            }

            return diff;
        } catch (error) {
            throw new Error(`Failed to get changes for file ${filePath}: ${(error as Error).message}`);
        }
    }

    /**
     * Detects the type of change for a file
     * @param {string} filePath - Path to the file
     * @param {string} diff - Diff content
     * @param {Object} status - Git status object
     * @returns {Promise<string>} Change type
     */
    async detectChangeType(filePath: string, diff: string, status: StatusResult): Promise<string> {
        if (status.not_added.includes(filePath)) return 'added';
        if (status.deleted.includes(filePath)) return 'deleted';
        if (status.modified.includes(filePath)) return 'modified';
        if (status.renamed.find((r: any) => r.to === filePath)) return 'renamed';
        return 'modified';
    }

    /**
     * Analyzes relationships between files (legacy method for compatibility)
     * @param {AnalyzedChange[]} changes - Array of analyzed changes
     * @returns {Promise<void>}
     */
    async analyzeFileRelationships(changes: AnalyzedChange[]): Promise<void> {
        return this._analyzeFileRelationshipsOptimized(changes);
    }

    /**
     * Optimized version of file relationship analysis with parallel processing
     * @private
     * @param {AnalyzedChange[]} changes - Array of analyzed changes
     * @returns {Promise<void>}
     */
    private async _analyzeFileRelationshipsOptimized(changes: AnalyzedChange[]): Promise<void> {
        if (changes.length === 0) return;

        // Pre-build lookup maps for faster dependency resolution
        const fileMap = new Map<string, AnalyzedChange>();
        const pathMap = new Map<string, AnalyzedChange>();

        for (const change of changes) {
            fileMap.set(change.filePath, change);

            // Create normalized path variations for faster lookup
            const normalizedPath = change.filePath.replace(/\\/g, '/');
            pathMap.set(normalizedPath, change);
            pathMap.set(normalizedPath + '.js', change);
            pathMap.set(normalizedPath + '.ts', change);
            pathMap.set(normalizedPath + '.jsx', change);
            pathMap.set(normalizedPath + '.tsx', change);
            pathMap.set(normalizedPath + '/index.js', change);
            pathMap.set(normalizedPath + '/index.ts', change);
        }

        // Process dependencies in parallel batches
        const dependencyPromises = changes.map((change) => this._findFileDependenciesOptimized(change, changes, fileMap, pathMap));

        // Limit concurrency for dependency analysis
        const dependencyResults = await this._limitConcurrency(dependencyPromises, this.options.maxConcurrency);

        // Assign dependencies back to changes
        for (let i = 0; i < changes.length; i++) {
            changes[i].dependencies = dependencyResults[i] || [];
        }
    }

    /**
     * Analyzes a single file and creates an AnalyzedChange object
     * @private
     * @param {string} filePath - Path to the file
     * @param {Object} status - Git status object
     * @returns {Promise<AnalyzedChange>} Analyzed change object
     */
    private async _analyzeFile(filePath: string, status: StatusResult): Promise<AnalyzedChange> {
        const diff = await this.getFileChanges(filePath);
        const changeType = await this.detectChangeType(filePath, diff, status);
        const { linesAdded, linesRemoved } = this._parseDiffStats(diff);
        const fileCategory = this._detectFileCategory(filePath, diff);
        const detectedFeatures = this._detectFeatures(filePath, diff);

        return new AnalyzedChange({
            filePath,
            changeType,
            diff,
            linesAdded,
            linesRemoved,
            fileCategory,
            detectedFeatures,
            dependencies: [], // Will be populated by analyzeFileRelationships
        });
    }

    /**
     * Parses diff statistics to count added and removed lines
     * @private
     * @param {string} diff - Diff content
     * @returns {Object} Object with linesAdded and linesRemoved counts
     */
    private _parseDiffStats(diff: string): { linesAdded: number; linesRemoved: number } {
        const lines = diff.split('\n');
        let linesAdded = 0;
        let linesRemoved = 0;

        for (const line of lines) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
                linesAdded++;
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                linesRemoved++;
            }
        }

        return { linesAdded, linesRemoved };
    }

    /**
     * Detects the category of a file based on its path and content
     * @private
     * @param {string} filePath - Path to the file
     * @param {string} diff - Diff content
     * @returns {string} File category
     */
    private _detectFileCategory(filePath: string, diff: string): string {
        const fileName = path.basename(filePath).toLowerCase();
        const dirPath = path.dirname(filePath).toLowerCase();

        // Style files (check by extension first to handle styles/test.scss correctly)
        if (
            fileName.endsWith('.css') ||
            fileName.endsWith('.scss') ||
            fileName.endsWith('.sass') ||
            fileName.endsWith('.less') ||
            fileName.endsWith('.styl')
        ) {
            return 'style';
        }

        // Documentation files (check before test files to handle docs/test-guide.md correctly)
        if (
            fileName.includes('readme') ||
            fileName.includes('doc') ||
            fileName.endsWith('.md') ||
            fileName.endsWith('.txt') ||
            dirPath.includes('doc')
        ) {
            return 'docs';
        }

        // Test files
        if (
            fileName.includes('test') ||
            fileName.includes('spec') ||
            dirPath.includes('test') ||
            dirPath.includes('spec') ||
            fileName.endsWith('.test.js') ||
            fileName.endsWith('.spec.js')
        ) {
            return 'test';
        }

        // Configuration files
        if (
            fileName.includes('config') ||
            fileName.includes('setting') ||
            fileName.startsWith('.') ||
            fileName.endsWith('.json') ||
            fileName.endsWith('.yml') ||
            fileName.endsWith('.yaml') ||
            fileName.endsWith('.toml') ||
            fileName.endsWith('.ini')
        ) {
            return 'config';
        }

        // Default to feature
        return 'feature';
    }

    /**
     * Detects features based on file path and diff content
     * @private
     * @param {string} filePath - Path to the file
     * @param {string} diff - Diff content
     * @returns {string[]} Array of detected features
     */
    private _detectFeatures(filePath: string, diff: string): string[] {
        const features: string[] = [];
        const fileName = path.basename(filePath, path.extname(filePath));
        const dirPath = path.dirname(filePath);

        // Extract feature from directory structure
        const pathParts = dirPath.split(path.sep).filter((part) => part && part !== '.');
        if (pathParts.length > 0) {
            features.push(...pathParts);
        }

        // Extract feature from filename
        if (fileName && fileName !== 'index') {
            features.push(fileName);
        }

        // Extract features from diff content (function names, class names, etc.)
        const diffLines = diff.split('\n');
        for (const line of diffLines) {
            if (line.startsWith('+')) {
                // Look for function definitions
                const functionMatch = line.match(/function\s+(\w+)|const\s+(\w+)\s*=|class\s+(\w+)/);
                if (functionMatch) {
                    const funcName = functionMatch[1] || functionMatch[2] || functionMatch[3];
                    if (funcName && !features.includes(funcName)) {
                        features.push(funcName);
                    }
                }
            }
        }

        return features.slice(0, 5); // Limit to 5 features to avoid noise
    }

    /**
     * Optimized version of finding file dependencies using pre-built lookup maps
     * @private
     * @param {AnalyzedChange} change - The change to analyze
     * @param {AnalyzedChange[]} allChanges - All changes for context
     * @param {Map} fileMap - Pre-built file lookup map
     * @param {Map} pathMap - Pre-built path variations lookup map
     * @returns {Promise<string[]>} Array of dependency file paths
     */
    private async _findFileDependenciesOptimized(
        change: AnalyzedChange,
        allChanges: AnalyzedChange[],
        fileMap: Map<string, AnalyzedChange>,
        pathMap: Map<string, AnalyzedChange>,
    ): Promise<string[]> {
        const dependencies = new Set<string>(); // Use Set to automatically handle duplicates

        // Only process diff lines that contain imports (performance optimization)
        const importLines = change.diff.split('\n').filter((line) => line.startsWith('+') && (line.includes('import') || line.includes('require')));

        // Process import statements
        for (const line of importLines) {
            const importPath = this._extractImportPath(line);
            if (importPath && importPath.startsWith('.')) {
                const resolvedDependency = this._resolveImportPath(change.filePath, importPath, pathMap);
                if (resolvedDependency) {
                    dependencies.add(resolvedDependency);
                }
            }
        }

        // Add directory-based relationships (optimized)
        const directoryDeps = this._findDirectoryRelationshipsOptimized(change, allChanges, fileMap);
        directoryDeps.forEach((dep) => dependencies.add(dep));

        return Array.from(dependencies);
    }

    /**
     * Extracts import path from a line of code
     * @private
     * @param {string} line - Line of code
     * @returns {string|null} Import path or null if not found
     */
    private _extractImportPath(line: string): string | null {
        const requireMatch = line.match(/require\(['"`]([^'"`]+)['"`]\)/);
        const importMatch = line.match(/import.*from\s+['"`]([^'"`]+)['"`]/);
        return requireMatch ? requireMatch[1] : importMatch ? importMatch[1] : null;
    }

    /**
     * Resolves import path to actual file path using lookup map
     * @private
     * @param {string} currentFilePath - Current file path
     * @param {string} importPath - Import path to resolve
     * @param {Map} pathMap - Path lookup map
     * @returns {string|null} Resolved file path or null if not found
     */
    private _resolveImportPath(currentFilePath: string, importPath: string, pathMap: Map<string, AnalyzedChange>): string | null {
        try {
            const resolvedPath = path.resolve(path.dirname(currentFilePath), importPath);
            const relativePath = path.relative(this.workspaceRoot, resolvedPath);
            const normalizedPath = relativePath.replace(/\\/g, '/');

            // Check lookup map for various path variations
            const dependentChange = pathMap.get(normalizedPath);
            return dependentChange ? dependentChange.filePath : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Finds dependencies for a file by analyzing imports and relationships (legacy method)
     * @private
     * @param {AnalyzedChange} change - The change to analyze
     * @param {AnalyzedChange[]} allChanges - All changes for context
     * @returns {Promise<string[]>} Array of dependency file paths
     */
    private async _findFileDependencies(change: AnalyzedChange, allChanges: AnalyzedChange[]): Promise<string[]> {
        // Create temporary lookup maps for compatibility
        const fileMap = new Map<string, AnalyzedChange>();
        const pathMap = new Map<string, AnalyzedChange>();

        for (const c of allChanges) {
            fileMap.set(c.filePath, c);
            const normalizedPath = c.filePath.replace(/\\/g, '/');
            pathMap.set(normalizedPath, c);
            pathMap.set(normalizedPath + '.js', c);
            pathMap.set(normalizedPath + '.ts', c);
            pathMap.set(normalizedPath + '.jsx', c);
            pathMap.set(normalizedPath + '.tsx', c);
            pathMap.set(normalizedPath + '/index.js', c);
            pathMap.set(normalizedPath + '/index.ts', c);
        }

        return this._findFileDependenciesOptimized(change, allChanges, fileMap, pathMap);
    }

    /**
     * Optimized version of finding directory relationships using file map
     * @private
     * @param {AnalyzedChange} change - The change to analyze
     * @param {AnalyzedChange[]} allChanges - All changes for context
     * @param {Map} fileMap - Pre-built file lookup map
     * @returns {string[]} Array of related file paths
     */
    private _findDirectoryRelationshipsOptimized(
        change: AnalyzedChange,
        allChanges: AnalyzedChange[],
        fileMap: Map<string, AnalyzedChange>,
    ): string[] {
        const relationships: string[] = [];
        const changeDir = path.dirname(change.filePath);
        const changeBaseName = path.basename(change.filePath, path.extname(change.filePath));

        // Pre-filter files by directory for better performance
        const sameDirFiles: string[] = [];
        const testRelatedFiles: string[] = [];
        const similarNameFiles: string[] = [];

        for (const otherChange of allChanges) {
            if (otherChange.filePath === change.filePath) continue;

            const otherDir = path.dirname(otherChange.filePath);
            const otherBaseName = path.basename(otherChange.filePath, path.extname(otherChange.filePath));

            // Files in the same directory are related
            if (changeDir === otherDir) {
                sameDirFiles.push(otherChange.filePath);
                continue;
            }

            // Test files are related to their corresponding source files
            if (change.fileCategory === 'test' || otherChange.fileCategory === 'test') {
                const testBaseName = changeBaseName.replace(/\.(test|spec)$/, '');
                const sourceBaseName = otherBaseName.replace(/\.(test|spec)$/, '');

                if (testBaseName === sourceBaseName || testBaseName === otherBaseName || changeBaseName === sourceBaseName) {
                    testRelatedFiles.push(otherChange.filePath);
                }
            }

            // Files with similar names are likely related (only check if names are reasonably similar)
            const nameLengthDiff = Math.abs(changeBaseName.length - otherBaseName.length);
            if (nameLengthDiff <= 3 && (changeBaseName.includes(otherBaseName) || otherBaseName.includes(changeBaseName))) {
                similarNameFiles.push(otherChange.filePath);
            }
        }

        relationships.push(...sameDirFiles, ...testRelatedFiles, ...similarNameFiles);
        return relationships;
    }

    /**
     * Finds relationships based on directory structure and naming patterns (legacy method)
     * @private
     * @param {AnalyzedChange} change - The change to analyze
     * @param {AnalyzedChange[]} allChanges - All changes for context
     * @returns {string[]} Array of related file paths
     */
    private _findDirectoryRelationships(change: AnalyzedChange, allChanges: AnalyzedChange[]): string[] {
        // Create temporary file map for compatibility
        const fileMap = new Map<string, AnalyzedChange>();
        for (const c of allChanges) {
            fileMap.set(c.filePath, c);
        }

        return this._findDirectoryRelationshipsOptimized(change, allChanges, fileMap);
    }

    /**
     * Gets performance statistics for the analyzer
     * @returns {Object} Performance statistics
     */
    getPerformanceStats(): {
        cacheHits: number;
        cacheMisses: number;
        filesProcessed: number;
        batchesProcessed: number;
        totalProcessingTime: number;
        cacheHitRate: string;
        cacheSize: number;
        averageProcessingTime: string;
    } {
        const cacheHitRate =
            this.stats.cacheHits + this.stats.cacheMisses > 0
                ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2)
                : 0;

        return {
            ...this.stats,
            cacheHitRate: `${cacheHitRate}%`,
            cacheSize: this.cache ? this.cache.size() : 0,
            averageProcessingTime:
                this.stats.filesProcessed > 0 ? (this.stats.totalProcessingTime / this.stats.filesProcessed).toFixed(2) + 'ms' : '0ms',
        };
    }

    /**
     * Clears the analysis cache
     */
    clearCache(): void {
        if (this.cache) {
            this.cache.clear();
        }

        // Reset statistics
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            filesProcessed: 0,
            batchesProcessed: 0,
            totalProcessingTime: 0,
        };
    }
}

export { ChangeAnalyzer, AnalyzedChange, AnalysisCache };
