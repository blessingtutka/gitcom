import * as path from 'path';
import { CommitGroup } from './types';
import { AnalyzedChange } from './change-analyzer';
import { generateMultiFileDescription, generateSingleFileDescription, scopePatterns } from './utils';

/**
 * Intelligent commit message generator that creates conventional commit messages
 * based on analyzed changes and commit groups
 */
class MessageGenerator {
    private config: Required<MessageGeneratorConfig>;

    constructor(config: MessageGeneratorConfig = {}) {
        this.config = {
            maxLength: config.maxLength || 72,
            includename: config.includeScope !== false,
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

            const scope = commitGroup.scope || '';
            const hasBreakingChanges = await this.detectBreakingChanges(commitGroup.files);
            const description = await this.generateDescription(commitGroup, type);

            // Build conventional commit message
            let message = type;

            if (scope) {
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

    private generateDescription(groupe: CommitGroup, primaryAction: string): string {
        const changes = groupe.files;
        const fileCount = changes.length;
        const scope = groupe.scope || '';

        if (fileCount === 1) {
            return generateSingleFileDescription(changes[0], primaryAction);
        } else {
            return generateMultiFileDescription(changes, primaryAction, scope);
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
