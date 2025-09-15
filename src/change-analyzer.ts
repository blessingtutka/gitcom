import * as vscode from 'vscode';
import simpleGit, { StatusResult } from 'simple-git';
import path from 'path';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import { openAIClient } from './openai';
import { fileTypePatterns } from './utils';
import { callKiroAI } from './kiroai';

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
    changeType: ChangeType;
    diff: string;
    linesAdded: number;
    linesRemoved: number;
    fileCategory: string; // 'feature' | 'test' | 'docs' | 'config' | 'style';
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
        changeType: ChangeType;
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
    // Update the fileTypePatterns to be more comprehensive

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
            await this._analyzeFileRelationships(analyzedChanges);

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
            const diff = await this.git.diff(['--', filePath]); // unstaged vs working tree
            if (!diff) {
                // fallback: staged diff
                return await this.git.diff(['--cached', '--', filePath]);
            }
            return diff.length > this.options.maxDiffSize ? diff.substring(0, this.options.maxDiffSize) + '\n... [diff truncated due to size]' : diff;
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
    async detectChangeType(filePath: string, status: StatusResult): Promise<ChangeType> {
        if (status.not_added.includes(filePath)) return 'added';
        if (status.deleted.includes(filePath)) return 'deleted';
        if (status.modified.includes(filePath)) return 'modified';
        if (status.renamed.find((r: any) => r.to === filePath)) return 'renamed';
        return 'modified';
    }

    /**
     * File relationship analysis with parallel processing
     * @private
     * @param {AnalyzedChange[]} changes - Array of analyzed changes
     * @returns {Promise<void>}
     */
    private async _analyzeFileRelationships(changes: AnalyzedChange[]): Promise<void> {
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
        const dependencyPromises = changes.map((change) => this._findFileDependencies(change, changes, fileMap, pathMap));

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
        const changeType = await this.detectChangeType(filePath, status);
        const { linesAdded, linesRemoved } = this._parseDiffStats(diff);
        const fileCategory = this._detectFileCategory(filePath);
        const detectedFeatures = await this._detectFeatures(filePath, diff);

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

    private _detectFileCategory(filePath: string): string {
        const fileName = path.basename(filePath);
        const normalizedPath = filePath.replace(/\\/g, '/');

        let bestMatch: { category: string; weight: number } | null = null;

        // Check against all patterns to find the best match
        for (const { pattern, category, weight } of fileTypePatterns) {
            if (pattern.test(filePath) || pattern.test(fileName) || pattern.test(normalizedPath)) {
                if (!bestMatch || weight > bestMatch.weight) {
                    bestMatch = { category, weight };
                }
            }
        }

        if (bestMatch) {
            return bestMatch.category;
        }

        return 'feature';
    }

    /**
     * Detects features based on file path and diff content
     * @private
     * @param {string} filePath - Path to the file
     * @param {string} diff - Diff content
     * @returns {string[]} Array of detected features
     */
    private async _detectFeatures(filePath: string, diff: string): Promise<string[]> {
        // 1. Try AI
        const aiResult = await this.detectFeaturesWithAI(filePath, diff);
        if (aiResult.features?.length && aiResult.confidence >= 0.4) {
            return aiResult.features;
        }

        console.log(aiResult);

        // 2. Fallback: rule-based
        const ruleFeatures = await this.detectFeaturesRuleBased(filePath, diff);
        return ruleFeatures;
    }

    /**
     * Detects features based on file path and diff content with AI
     * @private
     * @param {string} filePath - Path to the file
     * @param {string} diff - Diff content
     * @returns {string[], number} Array of detected features and confidence level
     */
    private async detectFeaturesWithAI(filePath: string, diff: string): Promise<AIFeatureDetect> {
        const prompt = `
            You are a commit message assistant.
            Analyze the following file change and list up to 5 key "features".
            feature can be function name class name, component name,...

            Return ONLY valid JSON:
            {"features":["..."], "confidence":0-1}

            File: ${filePath}
            Diff:
            \`\`\`diff
            ${diff.slice(0, 2500)}
            \`\`\`
            `;

        try {
            const res = await openAIClient().chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
            });

            let text = res.choices[0].message?.content ?? '';
            // try to extract JSON block
            const match = text.match(/\{[\s\S]*\}/);
            if (!match) return { features: [], confidence: 0 };

            const parsed = JSON.parse(match[0]);
            return {
                features: Array.isArray(parsed.features) ? parsed.features.slice(0, 5) : [],
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
            };
        } catch {
            return { features: [], confidence: 0 };
        }
    }

    private async detectFeaturesRuleBased(filePath: string, diff: string): Promise<string[]> {
        const features = new Set<string>();
        const fileName = path.basename(filePath, path.extname(filePath)).toLowerCase();
        const dirPath = path.dirname(filePath).toLowerCase();

        const ignoredDirs = new Set(['src', 'lib', 'dist', 'build', 'node_modules', 'public']);
        const ignoredFiles = new Set(['index', 'main', 'app', 'test', 'spec', 'utils', 'helpers']);

        dirPath.split(path.sep).forEach((p) => {
            if (p && !ignoredDirs.has(p) && p.length > 2) features.add(p);
        });

        if (fileName && !ignoredFiles.has(fileName)) {
            const clean = fileName.replace(/^use-?/, '').replace(/[-_](test|spec|story|stories)$/, '');
            if (clean.length > 2) features.add(clean);
        }

        for (const line of diff.split('\n')) {
            if (!line.startsWith('+')) continue;

            const fn = line.match(/function\s+([A-Za-z0-9_]+)/);
            if (fn) features.add(fn[1]);

            const cls = line.match(/class\s+([A-Za-z0-9_]+)/);
            if (cls) features.add(cls[1]);

            const reactComp = line.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\(/);
            if (reactComp) features.add(reactComp[1]);
        }

        return Array.from(features).slice(0, 8);
    }

    /**
     * File dependencies using pre-built lookup maps
     * @private
     * @param {AnalyzedChange} change - The change to analyze
     * @param {AnalyzedChange[]} allChanges - All changes for context
     * @param {Map} fileMap - Pre-built file lookup map
     * @param {Map} pathMap - Pre-built path variations lookup map
     * @returns {Promise<string[]>} Array of dependency file paths
     */
    private async _findFileDependencies(
        change: AnalyzedChange,
        allChanges: AnalyzedChange[],
        fileMap: Map<string, AnalyzedChange>,
        pathMap: Map<string, AnalyzedChange>,
    ): Promise<string[]> {
        const dependencies = new Set<string>();

        // Process all diff lines, not only added ones
        const importLines = change.diff.split('\n').filter((line) => /(import|require|export\s+\*|export\s+{)/.test(line));

        for (const line of importLines) {
            const importPath = this._extractImportPath(line);
            if (!importPath) continue;

            // Relative import
            if (importPath.startsWith('.')) {
                const resolved = this._resolveImportPath(change.filePath, importPath, pathMap);
                if (resolved) dependencies.add(resolved);
            }

            // Handle alias imports like @, ~, src
            if (/^[@~]/.test(importPath) || importPath.startsWith('src/')) {
                const normalized = importPath.replace(/^[@~]/, '');
                const resolved = this._resolveImportPath(change.filePath, normalized, pathMap);
                if (resolved) dependencies.add(resolved);
            }
        }
        // Add directory-based relationships
        const directoryDeps = this._findDirectoryRelationships(change, allChanges, fileMap);
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
        const importMatch = line.match(/import(?:["'\s]*[\w*{}\n, ]+from\s*)?["'`]([^'"`]+)["'`]/);
        const exportMatch = line.match(/export\s+\*\s+from\s+['"`]([^'"`]+)['"`]/);

        return requireMatch?.[1] || importMatch?.[1] || exportMatch?.[1] || null;
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
     * Optimized version of finding directory relationships using file map
     * @private
     * @param {AnalyzedChange} change - The change to analyze
     * @param {AnalyzedChange[]} allChanges - All changes for context
     * @param {Map} fileMap - Pre-built file lookup map
     * @returns {string[]} Array of related file paths
     */
    private _findDirectoryRelationships(change: AnalyzedChange, allChanges: AnalyzedChange[], fileMap: Map<string, AnalyzedChange>): string[] {
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
