import * as path from 'path';
import { CommitGroup } from './types';
import { AnalyzedChange } from './change-analyzer';

/**
 * Intelligent commit message generator that creates conventional commit messages
 * based on analyzed changes and commit groups
 */
class MessageGenerator {
    private config: Required<MessageGeneratorConfig>;

    constructor(config: MessageGeneratorConfig = {}) {
        this.config = {
            maxLength: config.maxLength || 72,
            includeScope: config.includeScope !== false,
            includeBody: config.includeBody || false,
            ...config,
        } as Required<MessageGeneratorConfig>;
    }

    /**
     * Generates a commit message for a commit group
     * @param commitGroup - The commit group to generate a message for
     * @returns Generated commit message
     */
    async generateCommitMessage(commitGroup: CommitGroup): Promise<string> {
        try {
            const type = commitGroup.type || (await this.detectCommitType(commitGroup.files));
            const scope = await this.detectScope(commitGroup.files);
            const hasBreakingChanges = await this.detectBreakingChanges(commitGroup.files);
            const description = await this.generateDescription(commitGroup.files, type, scope, hasBreakingChanges);

            // Build conventional commit message
            let message = type;

            if (scope && this.config.includeScope) {
                message += `(${scope})`;
            }

            // Add breaking change indicator
            if (hasBreakingChanges) {
                message += '!';
            }

            message += `: ${description}`;

            // Ensure message doesn't exceed max length
            if (message.length > this.config.maxLength) {
                const prefixLength = message.indexOf(':') + 2; // "type(scope)!: "
                const maxDescLength = this.config.maxLength - prefixLength - 3; // Reserve 3 chars for "..."
                const truncatedDesc = description.substring(0, maxDescLength) + '...';
                message = message.substring(0, prefixLength) + truncatedDesc;
            }

            return message;
        } catch (error) {
            throw new Error(`Failed to generate commit message: ${(error as Error).message}`);
        }
    }

    /**
     * Detects the appropriate conventional commit type based on file changes
     * @param changes - Array of analyzed changes
     * @returns Commit type (feat, fix, docs, etc.)
     */
    async detectCommitType(changes: AnalyzedChange[]): Promise<string> {
        if (!changes || changes.length === 0) {
            return 'chore';
        }

        const changeTypes = new Set<string>();
        const fileCategories = new Set<string>();
        let hasNewFiles = false;
        let hasDeletedFiles = false;

        // Analyze all changes to determine patterns
        for (const change of changes) {
            changeTypes.add(change.changeType);
            fileCategories.add(change.fileCategory);

            if (change.changeType === 'added') hasNewFiles = true;
            if (change.changeType === 'deleted') hasDeletedFiles = true;
        }

        // Priority-based type detection

        // Documentation changes
        if (fileCategories.has('docs') && fileCategories.size === 1) {
            return 'docs';
        }

        // Test-only changes
        if (fileCategories.has('test') && fileCategories.size === 1) {
            return 'test';
        }

        // Style-only changes
        if (fileCategories.has('style') && fileCategories.size === 1) {
            return 'style';
        }

        // Configuration-only changes
        if (fileCategories.has('config') && fileCategories.size === 1) {
            return 'chore';
        }

        // Feature detection - new functionality
        if (hasNewFiles && fileCategories.has('feature')) {
            return 'feat';
        }

        // Feature detection - significant additions to existing files
        const totalLinesAdded = changes.reduce((sum, change) => sum + (change.linesAdded || 0), 0);
        const totalLinesRemoved = changes.reduce((sum, change) => sum + (change.linesRemoved || 0), 0);

        if (totalLinesAdded > totalLinesRemoved * 2 && totalLinesAdded > 20) {
            return 'feat';
        }

        // Refactor detection - significant changes without new functionality
        if (hasDeletedFiles || (totalLinesRemoved > 50 && totalLinesAdded > 50)) {
            return 'refactor';
        }

        // Performance improvements (heuristic based on file content)
        if (this._detectPerformanceChanges(changes)) {
            return 'perf';
        }

        // Default to fix for modifications
        if (changeTypes.has('modified') && fileCategories.has('feature')) {
            return 'fix';
        }

        // Fallback to chore for unclear changes
        return 'chore';
    }

    /**
     * Detects the scope based on file paths and change analysis
     * @param changes - Array of analyzed changes
     * @returns Detected scope or null
     */
    async detectScope(changes: AnalyzedChange[]): Promise<string | null> {
        if (!changes || changes.length === 0) {
            return null;
        }

        const scopeCandidates = new Map<string, number>();

        for (const change of changes) {
            const scopes = this._extractScopesFromPath(change.filePath);

            for (const scope of scopes) {
                scopeCandidates.set(scope, (scopeCandidates.get(scope) || 0) + 1);
            }
        }

        // Find the most common scope
        let bestScope: string | null = null;
        let maxCount = 0;

        for (const [scope, count] of scopeCandidates.entries()) {
            if (count > maxCount) {
                maxCount = count;
                bestScope = scope;
            }
        }

        // Only return scope if it appears in at least half the files
        if (maxCount >= Math.ceil(changes.length / 2)) {
            return bestScope;
        }

        return null;
    }

    /**
     * Generates a concise but descriptive commit message description
     * @param changes - Array of analyzed changes
     * @param type - Commit type
     * @param scope - Commit scope
     * @param hasBreakingChanges - Whether there are breaking changes
     * @returns Generated description
     */
    async generateDescription(changes: AnalyzedChange[], type: string, scope: string | null, hasBreakingChanges = false): Promise<string> {
        if (!changes || changes.length === 0) {
            return 'update files';
        }

        const fileCount = changes.length;
        const primaryFeatures = this._extractPrimaryFeatures(changes);
        const mainFile = changes[0];

        // Single file changes
        if (fileCount === 1) {
            return this._generateSingleFileDescription(mainFile, type, primaryFeatures, hasBreakingChanges);
        }

        // Multiple file changes
        return this._generateMultiFileDescription(changes, type, primaryFeatures, fileCount, hasBreakingChanges);
    }

    /**
     * Extracts scopes from file paths using common patterns
     * @private
     * @param filePath - File path to analyze
     * @returns Array of potential scopes
     */
    private _extractScopesFromPath(filePath: string): string[] {
        const scopes: string[] = [];
        const pathParts = filePath.split(path.sep).filter((part) => part && part !== '.');

        // Common scope patterns for directories
        const scopePatterns = [
            { pattern: /^src\/components?\/(.+)/, index: 1 },
            { pattern: /^src\/pages?\/(.+)/, index: 1 },
            { pattern: /^src\/services?\/(.+)/, index: 1 },
            { pattern: /^src\/utils?\/(.+)/, index: 1 },
            { pattern: /^src\/api\/(.+)/, index: 1 },
            { pattern: /^src\/hooks?\/(.+)/, index: 1 },
            { pattern: /^src\/store\/(.+)/, index: 1 },
            { pattern: /^src\/lib\/(.+)/, index: 1 },
            { pattern: /^tests?\/(.+)/, index: 1 },
            { pattern: /^docs?\/(.+)/, index: 1 },
        ];

        for (const { pattern, index } of scopePatterns) {
            const match = filePath.match(pattern);
            if (match && match[index]) {
                const scope = match[index].split('/')[0].replace(/\.(js|ts|jsx|tsx|vue|py|java|cs|md|txt)$/, '');
                if (scope && scope.length > 1) {
                    scopes.push(scope);
                }
            }
        }

        // Check for files directly in src with meaningful names
        if (scopes.length === 0 && filePath.startsWith('src/')) {
            const fileName = path.basename(filePath, path.extname(filePath));
            if (fileName && fileName.length > 1 && fileName !== 'index' && fileName !== 'main') {
                scopes.push(fileName);
            }
        }

        // Fallback to directory-based scopes
        if (scopes.length === 0 && pathParts.length > 1) {
            const relevantParts = pathParts.slice(0, 2); // Take first two directory levels
            for (const part of relevantParts) {
                if (part !== 'src' && part !== 'test' && part !== 'tests' && part.length > 1) {
                    scopes.push(part);
                }
            }
        }

        return scopes;
    }

    /**
     * Extracts primary features from changes
     * @private
     * @param changes - Array of analyzed changes
     * @returns Array of primary features
     */
    private _extractPrimaryFeatures(changes: AnalyzedChange[]): string[] {
        const featureCount = new Map<string, number>();

        for (const change of changes) {
            for (const feature of change.detectedFeatures) {
                featureCount.set(feature, (featureCount.get(feature) || 0) + 1);
            }
        }

        // Sort by frequency and return top features
        return Array.from(featureCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([feature]) => feature);
    }

    /**
     * Generates description for single file changes
     * @private
     * @param change - The file change
     * @param type - Commit type
     * @param features - Detected features
     * @param hasBreakingChanges - Whether there are breaking changes
     * @returns Generated description
     */
    private _generateSingleFileDescription(change: AnalyzedChange, type: string, features: string[], hasBreakingChanges = false): string {
        const fileName = path.basename(change.filePath, path.extname(change.filePath));
        const primaryFeature = features[0] || fileName;

        switch (type) {
            case 'feat':
                if (change.changeType === 'added') {
                    return `add ${primaryFeature} functionality`;
                }
                // If there are breaking changes, it's likely removing/changing existing functionality
                if (hasBreakingChanges) {
                    return `resolve issue in ${primaryFeature}`;
                }
                return `enhance ${primaryFeature} with new features`;

            case 'fix':
                return `resolve issue in ${primaryFeature}`;

            case 'docs':
                return `update ${primaryFeature} documentation`;

            case 'test':
                return `add tests for ${primaryFeature}`;

            case 'style':
                return `improve ${primaryFeature} styling`;

            case 'refactor':
                return `refactor ${primaryFeature} implementation`;

            case 'perf':
                return `optimize ${primaryFeature} performance`;

            case 'chore':
                return `update ${primaryFeature} configuration`;

            default:
                return `update ${primaryFeature}`;
        }
    }

    /**
     * Generates description for multiple file changes
     * @private
     * @param changes - Array of changes
     * @param type - Commit type
     * @param features - Detected features
     * @param fileCount - Number of files
     * @param hasBreakingChanges - Whether there are breaking changes
     * @returns Generated description
     */
    private _generateMultiFileDescription(
        changes: AnalyzedChange[],
        type: string,
        features: string[],
        fileCount: number,
        hasBreakingChanges = false,
    ): string {
        const primaryFeature = features[0];
        const hasMultipleFeatures = features.length > 1;

        switch (type) {
            case 'feat':
                if (primaryFeature && !hasMultipleFeatures) {
                    return `implement ${primaryFeature} feature`;
                }
                return `add new functionality across ${fileCount} files`;

            case 'fix':
                if (primaryFeature && !hasMultipleFeatures) {
                    return `fix issues in ${primaryFeature}`;
                }
                return `resolve issues across ${fileCount} files`;

            case 'docs':
                return fileCount > 3 ? 'update documentation' : `update ${fileCount} documentation files`;

            case 'test':
                if (primaryFeature && !hasMultipleFeatures) {
                    return `add comprehensive tests for ${primaryFeature}`;
                }
                return 'add comprehensive test coverage';

            case 'style':
                return fileCount > 3 ? 'improve styling' : `update styles in ${fileCount} files`;

            case 'refactor':
                if (primaryFeature && !hasMultipleFeatures) {
                    return `refactor ${primaryFeature} structure`;
                }
                return `refactor codebase structure (${fileCount} files)`;

            case 'perf':
                return 'optimize performance across multiple components';

            case 'chore':
                return fileCount > 5 ? 'update configuration' : `update ${fileCount} configuration files`;

            default:
                return `update ${fileCount} files`;
        }
    }

    /**
     * Detects breaking changes by analyzing API changes and removals
     * @param changes - Array of analyzed changes
     * @returns True if breaking changes detected
     */
    async detectBreakingChanges(changes: AnalyzedChange[]): Promise<boolean> {
        if (!changes || changes.length === 0) {
            return false;
        }

        for (const change of changes) {
            // Check for explicit breaking change indicators
            if (this._hasExplicitBreakingChangeIndicators(change)) {
                return true;
            }

            // Check for API breaking changes
            if (this._hasApiBreakingChanges(change)) {
                return true;
            }

            // Check for version-breaking changes in package files
            if (this._hasVersionBreakingChanges(change)) {
                return true;
            }

            // Check for file deletions that might be breaking
            if (this._hasBreakingDeletions(change)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Checks for explicit breaking change indicators in diff content
     * @private
     * @param change - The change to analyze
     * @returns True if explicit breaking change indicators found
     */
    private _hasExplicitBreakingChangeIndicators(change: AnalyzedChange): boolean {
        const breakingKeywords = ['BREAKING CHANGE', 'BREAKING:', 'breaking change', 'breaking:', 'BREAKING_CHANGE', 'breaking_change'];

        const diffContent = change.diff.toLowerCase();
        return breakingKeywords.some((keyword) => diffContent.includes(keyword.toLowerCase()));
    }

    /**
     * Checks for API breaking changes based on function/method signatures
     * @private
     * @param change - The change to analyze
     * @returns True if API breaking changes detected
     */
    private _hasApiBreakingChanges(change: AnalyzedChange): boolean {
        // Skip test files - their API changes are not breaking for the public API
        const fileName = path.basename(change.filePath);
        if (change.filePath.includes('test') || change.filePath.includes('spec') || fileName.includes('.test.') || fileName.includes('.spec.')) {
            return false;
        }

        const diffLines = change.diff.split('\n');

        for (const line of diffLines) {
            // Check for removed public functions/methods
            if (line.startsWith('-')) {
                const cleanLine = line.substring(1).trim();

                // Function declarations
                if (cleanLine.match(/^(export\s+)?(function|const|let|var)\s+\w+/)) {
                    return true;
                }

                // Class methods
                if (cleanLine.match(/^\s*(public\s+|static\s+)?\w+\s*\(/)) {
                    return true;
                }

                // Interface/type definitions
                if (cleanLine.match(/^(export\s+)?(interface|type|class)\s+\w+/)) {
                    return true;
                }
            }

            // Check for modified function signatures (parameter changes)
            if (line.startsWith('-') || line.startsWith('+')) {
                const cleanLine = line.substring(1).trim();

                // Function parameter changes
                if (cleanLine.match(/function\s+\w+\s*\([^)]*\)/)) {
                    const nextLineIndex = diffLines.indexOf(line) + 1;
                    if (nextLineIndex < diffLines.length) {
                        const nextLine = diffLines[nextLineIndex];
                        if (
                            (line.startsWith('-') && nextLine.startsWith('+')) ||
                            (line.startsWith('+') && diffLines[nextLineIndex - 2]?.startsWith('-'))
                        ) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * Checks for version-breaking changes in package.json and similar files
     * @private
     * @param change - The change to analyze
     * @returns True if version-breaking changes detected
     */
    private _hasVersionBreakingChanges(change: AnalyzedChange): boolean {
        const fileName = path.basename(change.filePath).toLowerCase();

        // Check package.json for major version changes
        if (fileName === 'package.json') {
            const diffLines = change.diff.split('\n');

            for (let i = 0; i < diffLines.length; i++) {
                const line = diffLines[i];

                // Look for version field changes
                if (line.includes('"version"')) {
                    const removedLine = line.startsWith('-') ? line : diffLines[i - 1];
                    const addedLine = line.startsWith('+') ? line : diffLines[i + 1];

                    if (removedLine && addedLine) {
                        const oldVersion = this._extractVersion(removedLine);
                        const newVersion = this._extractVersion(addedLine);

                        if (oldVersion && newVersion && this._isMajorVersionChange(oldVersion, newVersion)) {
                            return true;
                        }
                    }
                }

                // Check for removed dependencies
                if (line.startsWith('-') && line.includes('"dependencies"')) {
                    return true;
                }
            }
        }

        // Check for breaking changes in configuration files
        const configFiles = ['webpack.config.js', 'babel.config.js', 'tsconfig.json', '.eslintrc'];
        if (configFiles.some((config) => change.filePath.includes(config))) {
            // Major configuration changes are potentially breaking
            const linesRemoved = change.linesRemoved || 0;
            const linesAdded = change.linesAdded || 0;

            // If significant configuration changes (more than 10 lines changed)
            if (linesRemoved > 10 || linesAdded > 10) {
                return true;
            }
        }

        return false;
    }

    /**
     * Checks for breaking file deletions
     * @private
     * @param change - The change to analyze
     * @returns True if breaking deletions detected
     */
    private _hasBreakingDeletions(change: AnalyzedChange): boolean {
        if (change.changeType !== 'deleted') {
            return false;
        }

        const fileName = path.basename(change.filePath);
        const fileExt = path.extname(change.filePath);

        // Skip test files - their deletion is not breaking
        if (change.filePath.includes('test') || change.filePath.includes('spec') || fileName.includes('.test.') || fileName.includes('.spec.')) {
            return false;
        }

        // Deletion of main entry points
        if (fileName === 'index.js' || fileName === 'index.ts' || fileName === 'main.js') {
            return true;
        }

        // Deletion of public API files
        if (change.filePath.includes('/api/') || change.filePath.includes('/public/')) {
            return true;
        }

        // Deletion of exported modules (only non-test files)
        if (fileExt === '.js' || fileExt === '.ts' || fileExt === '.jsx' || fileExt === '.tsx') {
            return true;
        }

        return false;
    }

    /**
     * Extracts version number from a package.json line
     * @private
     * @param line - Line containing version
     * @returns Version string or null
     */
    private _extractVersion(line: string): string | null {
        const match = line.match(/"version":\s*"([^"]+)"/);
        return match ? match[1] : null;
    }

    /**
     * Checks if version change is a major version change
     * @private
     * @param oldVersion - Old version string
     * @param newVersion - New version string
     * @returns True if major version change
     */
    private _isMajorVersionChange(oldVersion: string, newVersion: string): boolean {
        const oldMajor = parseInt(oldVersion.split('.')[0], 10);
        const newMajor = parseInt(newVersion.split('.')[0], 10);

        return !isNaN(oldMajor) && !isNaN(newMajor) && newMajor > oldMajor;
    }

    /**
     * Detects performance-related changes based on diff content
     * @private
     * @param changes - Array of changes
     * @returns True if performance changes detected
     */
    private _detectPerformanceChanges(changes: AnalyzedChange[]): boolean {
        const performanceKeywords = [
            'optimize',
            'performance',
            'cache',
            'lazy',
            'async',
            'await',
            'debounce',
            'throttle',
            'memoize',
            'efficient',
            'faster',
        ];

        for (const change of changes) {
            const diffLower = change.diff.toLowerCase();
            if (performanceKeywords.some((keyword) => diffLower.includes(keyword))) {
                return true;
            }
        }

        return false;
    }
}

export { MessageGenerator };
