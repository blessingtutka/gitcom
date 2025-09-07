import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { CommitGroup } from './types/models';

/**
 * Learning system that improves commit grouping based on user feedback
 * Implements a simple machine learning approach to adapt to user preferences
 */
class LearningSystem {
    private workspaceRoot: string;
    private options: Required<LearningSystemOptions>;
    private userPreferences: Map<string, any>;
    private groupingPatterns: Map<string, GroupingPattern>;
    private feedbackHistory: FeedbackEntry[];
    private adaptationWeights: Map<string, AdaptationWeights>;

    constructor(workspaceRoot: string, options: LearningSystemOptions = {}) {
        this.workspaceRoot = workspaceRoot || process.cwd();
        this.options = {
            enableLearning: options.enableLearning !== false,
            learningDataFile: options.learningDataFile || '.kiro/learning-data.json',
            maxLearningEntries: options.maxLearningEntries || 1000,
            confidenceThreshold: options.confidenceThreshold || 0.6,
            adaptationRate: options.adaptationRate || 0.1,
            ...options,
        } as Required<LearningSystemOptions>;

        // Learning data structures
        this.userPreferences = new Map();
        this.groupingPatterns = new Map();
        this.feedbackHistory = [];
        this.adaptationWeights = new Map();

        // Initialize learning data
        this._initializeLearningData();
    }

    /**
     * Records user feedback on commit grouping decisions
     * @param feedback - User feedback data
     */
    async recordFeedback(feedback: any): Promise<void> {
        if (!this.options.enableLearning) {
            return;
        }

        const feedbackEntry: FeedbackEntry = {
            timestamp: Date.now(),
            sessionId: this._generateSessionId(),
            originalGrouping: feedback.originalGrouping,
            userModifications: feedback.userModifications,
            satisfaction: feedback.satisfaction, // 1-5 scale
            context: feedback.context,
            fileTypes: feedback.fileTypes,
            projectType: feedback.projectType,
        };

        this.feedbackHistory.push(feedbackEntry);

        // Learn from the feedback
        await this._learnFromFeedback(feedbackEntry);

        // Persist learning data
        await this._saveLearningData();

        // Trim old entries if needed
        if (this.feedbackHistory.length > this.options.maxLearningEntries) {
            this.feedbackHistory = this.feedbackHistory.slice(-this.options.maxLearningEntries);
        }
    }

    /**
     * Gets learned preferences for commit grouping
     * @param context - Current context (file types, project type, etc.)
     * @returns Learned preferences
     */
    getLearnedPreferences(context: any = {}): any {
        const preferences = {
            groupingStrategy: this._getPreferredGroupingStrategy(context),
            fileSeparationRules: this._getFileSeparationRules(context),
            commitMessagePreferences: this._getCommitMessagePreferences(context),
            confidenceScore: this._calculatePreferenceConfidence(context),
        };

        return preferences;
    }

    /**
     * Adapts commit grouping based on learned patterns
     * @param proposedGroups - Originally proposed groups
     * @param context - Current context
     * @returns Adapted groups
     */
    async adaptGrouping(groups: CommitGroup[], context: any = {}): Promise<CommitGroup[]> {
        if (!this.options.enableLearning || this.feedbackHistory.length < 5) {
            return groups; // Not enough data to adapt
        }

        const adaptedGroups = [...groups];
        const preferences = this.getLearnedPreferences(context);

        // Apply learned adaptations
        if (preferences.confidenceScore > this.options.confidenceThreshold) {
            // Adapt based on file separation rules
            this._applyFileSeparationRules(adaptedGroups, preferences.fileSeparationRules);

            // Adapt grouping strategy
            this._applyGroupingStrategy(adaptedGroups, preferences.groupingStrategy);

            // Adapt commit messages
            this._adaptCommitMessages(adaptedGroups, preferences.commitMessagePreferences);
        }

        return adaptedGroups;
    }

    /**
     * Learns from user feedback to improve future grouping
     * @private
     * @param feedbackEntry - Feedback entry to learn from
     */
    private async _learnFromFeedback(feedbackEntry: FeedbackEntry): Promise<void> {
        const { userModifications, satisfaction, context, fileTypes } = feedbackEntry;

        // Learn grouping preferences
        if (userModifications && userModifications.regroupedFiles) {
            await this._learnGroupingPreferences(userModifications.regroupedFiles, context);
        }

        // Learn file separation preferences
        if (userModifications && userModifications.separatedFiles) {
            await this._learnFileSeparationPreferences(userModifications.separatedFiles, fileTypes);
        }

        // Learn commit message preferences
        if (userModifications && userModifications.editedMessages) {
            await this._learnCommitMessagePreferences(userModifications.editedMessages, context);
        }

        // Update satisfaction weights
        this._updateSatisfactionWeights(satisfaction, context);
    }

    /**
     * Learns grouping preferences from user modifications
     * @private
     * @param regroupedFiles - Files that were regrouped by user
     * @param context - Context information
     */
    private async _learnGroupingPreferences(regroupedFiles: any[], context: any): Promise<void> {
        for (const regroup of regroupedFiles) {
            const { fromGroup, toGroup, files } = regroup;

            // Create pattern for files that should be grouped together
            const pattern = this._createGroupingPattern(files, context);
            const patternKey = this._generatePatternKey(pattern);

            if (!this.groupingPatterns.has(patternKey)) {
                this.groupingPatterns.set(patternKey, {
                    pattern,
                    strength: 0,
                    occurrences: 0,
                    context: context,
                });
            }

            const patternData = this.groupingPatterns.get(patternKey)!;
            patternData.occurrences++;
            patternData.strength = Math.min(1.0, patternData.strength + this.options.adaptationRate);
        }
    }

    /**
     * Learns file separation preferences
     * @private
     * @param separatedFiles - Files that were separated by user
     * @param fileTypes - Types of files involved
     */
    private async _learnFileSeparationPreferences(separatedFiles: any[], fileTypes: string[]): Promise<void> {
        for (const separation of separatedFiles) {
            const { fileA, fileB, reason } = separation;

            const separationRule: SeparationRule = {
                fileTypeA: this._getFileType(fileA),
                fileTypeB: this._getFileType(fileB),
                shouldSeparate: true,
                reason: reason,
                strength: this.options.adaptationRate,
            };

            const ruleKey = `${separationRule.fileTypeA}:${separationRule.fileTypeB}`;

            if (!this.userPreferences.has('separation_rules')) {
                this.userPreferences.set('separation_rules', new Map());
            }

            const separationRules = this.userPreferences.get('separation_rules') as Map<string, SeparationRule>;
            if (separationRules.has(ruleKey)) {
                const existingRule = separationRules.get(ruleKey)!;
                existingRule.strength = Math.min(1.0, existingRule.strength + this.options.adaptationRate);
            } else {
                separationRules.set(ruleKey, separationRule);
            }
        }
    }

    /**
     * Learns commit message preferences
     * @private
     * @param editedMessages - Messages that were edited by user
     * @param context - Context information
     */
    private async _learnCommitMessagePreferences(editedMessages: any[], context: any): Promise<void> {
        for (const edit of editedMessages) {
            const { original, edited, commitType } = edit;

            // Analyze the changes made to the message
            const messagePattern = this._analyzeMessageChanges(original, edited);

            if (!this.userPreferences.has('message_patterns')) {
                this.userPreferences.set('message_patterns', new Map());
            }

            const messagePatterns = this.userPreferences.get('message_patterns') as Map<string, MessagePattern>;
            const patternKey = `${commitType}:${messagePattern.type}`;

            if (messagePatterns.has(patternKey)) {
                const existing = messagePatterns.get(patternKey)!;
                existing.strength = Math.min(1.0, existing.strength + this.options.adaptationRate);
                existing.examples.push({ original, edited });
            } else {
                messagePatterns.set(patternKey, {
                    pattern: messagePattern,
                    strength: this.options.adaptationRate,
                    examples: [{ original, edited }],
                });
            }
        }
    }

    /**
     * Creates a grouping pattern from files and context
     * @private
     * @param files - Files to create pattern from
     * @param context - Context information
     * @returns Grouping pattern
     */
    private _createGroupingPattern(files: any[], context: any): any {
        const pattern = {
            fileTypes: files.map((f: any) => this._getFileType(f.filePath)),
            directories: files.map((f: any) => path.dirname(f.filePath)),
            features: files.flatMap((f: any) => f.detectedFeatures || []),
            changeTypes: files.map((f: any) => f.changeType),
            context: context,
        };

        // Normalize the pattern
        pattern.fileTypes = [...new Set(pattern.fileTypes)].sort();
        pattern.directories = [...new Set(pattern.directories)].sort();
        pattern.features = [...new Set(pattern.features)].sort();
        pattern.changeTypes = [...new Set(pattern.changeTypes)].sort();

        return pattern;
    }

    /**
     * Generates a unique key for a pattern
     * @private
     * @param pattern - Pattern to generate key for
     * @returns Pattern key
     */
    private _generatePatternKey(pattern: any): string {
        const patternString = JSON.stringify(pattern, Object.keys(pattern).sort());
        return crypto.createHash('md5').update(patternString).digest('hex');
    }

    /**
     * Gets the preferred grouping strategy based on learned data
     * @private
     * @param context - Current context
     * @returns Preferred grouping strategy
     */
    private _getPreferredGroupingStrategy(context: any): GroupingStrategy {
        const strategy: GroupingStrategy = {
            preferFeatureGrouping: 0.5,
            preferTypeGrouping: 0.5,
            preferDirectoryGrouping: 0.5,
            maxFilesPerCommit: 10,
        };

        // Analyze feedback history to determine preferences
        const relevantFeedback = this.feedbackHistory.filter((f) => this._isContextSimilar(f.context, context));

        if (relevantFeedback.length > 0) {
            // Calculate preferences based on satisfaction scores
            const satisfiedFeedback = relevantFeedback.filter((f) => f.satisfaction >= 4);

            for (const feedback of satisfiedFeedback) {
                if (feedback.userModifications && feedback.userModifications.groupingStrategy) {
                    const userStrategy = feedback.userModifications.groupingStrategy;

                    if (userStrategy.includes('feature')) {
                        strategy.preferFeatureGrouping += 0.1;
                    }
                    if (userStrategy.includes('type')) {
                        strategy.preferTypeGrouping += 0.1;
                    }
                    if (userStrategy.includes('directory')) {
                        strategy.preferDirectoryGrouping += 0.1;
                    }
                }
            }
        }

        // Normalize preferences
        const total = strategy.preferFeatureGrouping + strategy.preferTypeGrouping + strategy.preferDirectoryGrouping;
        if (total > 0) {
            strategy.preferFeatureGrouping /= total;
            strategy.preferTypeGrouping /= total;
            strategy.preferDirectoryGrouping /= total;
        }

        return strategy;
    }

    /**
     * Gets learned file separation rules
     * @private
     * @param context - Current context
     * @returns File separation rules
     */
    private _getFileSeparationRules(context: any): SeparationRule[] {
        const rules: SeparationRule[] = [];

        if (this.userPreferences.has('separation_rules')) {
            const separationRules = this.userPreferences.get('separation_rules') as Map<string, SeparationRule>;

            for (const [, rule] of separationRules) {
                if (rule.strength > this.options.confidenceThreshold) {
                    rules.push(rule);
                }
            }
        }

        return rules;
    }

    /**
     * Gets learned commit message preferences
     * @private
     * @param context - Current context
     * @returns Commit message preferences
     */
    private _getCommitMessagePreferences(context: any): MessagePreferences {
        const preferences: MessagePreferences = {
            preferredFormats: [],
            commonPatterns: [],
            avoidedPatterns: [],
        };

        if (this.userPreferences.has('message_patterns')) {
            const messagePatterns = this.userPreferences.get('message_patterns') as Map<string, MessagePattern>;

            for (const [, pattern] of messagePatterns) {
                if (pattern.strength > this.options.confidenceThreshold) {
                    preferences.preferredFormats.push(pattern);
                }
            }
        }

        return preferences;
    }

    /**
     * Calculates confidence score for preferences
     * @private
     * @param context - Current context
     * @returns Confidence score (0-1)
     */
    private _calculatePreferenceConfidence(context: any): number {
        const relevantFeedback = this.feedbackHistory.filter((f) => this._isContextSimilar(f.context, context));

        if (relevantFeedback.length < 3) {
            return 0.1; // Not enough data
        }

        const avgSatisfaction = relevantFeedback.reduce((sum, f) => sum + f.satisfaction, 0) / relevantFeedback.length;
        return Math.min(1.0, avgSatisfaction / 5.0);
    }

    /**
     * Checks if two contexts are similar
     * @private
     * @param contextA - First context
     * @param contextB - Second context
     * @returns True if contexts are similar
     */
    private _isContextSimilar(contextA: any, contextB: any): boolean {
        if (!contextA || !contextB) return false;

        const similarity =
            (contextA.projectType === contextB.projectType ? 1 : 0) +
            (this._arraysSimilar(contextA.fileTypes, contextB.fileTypes) ? 1 : 0) +
            (contextA.changeSize === contextB.changeSize ? 1 : 0);

        return similarity >= 2; // At least 2 out of 3 criteria match
    }

    /**
     * Checks if two arrays are similar
     * @private
     * @param arrA - First array
     * @param arrB - Second array
     * @returns True if arrays are similar
     */
    private _arraysSimilar(arrA: any[], arrB: any[]): boolean {
        if (!arrA || !arrB) return false;

        const setA = new Set(arrA);
        const setB = new Set(arrB);
        const intersection = new Set([...setA].filter((x) => setB.has(x)));

        return intersection.size / Math.max(setA.size, setB.size) > 0.5;
    }

    /**
     * Applies learned file separation rules to groups
     * @private
     * @param groups - Commit groups to modify
     * @param rules - Separation rules to apply
     */
    private _applyFileSeparationRules(groups: any[], rules: SeparationRule[]): void {
        // Implementation would modify groups based on learned separation rules
        // This is a simplified version
        for (const rule of rules) {
            if (rule.strength > this.options.confidenceThreshold) {
                // Apply the separation rule to the groups
                // This would involve more complex logic to actually separate files
            }
        }
    }

    /**
     * Applies learned grouping strategy
     * @private
     * @param groups - Commit groups to modify
     * @param strategy - Grouping strategy to apply
     */
    private _applyGroupingStrategy(groups: any[], strategy: GroupingStrategy): void {
        // Implementation would modify groups based on learned strategy
        // This is a simplified version
    }

    /**
     * Adapts commit messages based on learned preferences
     * @private
     * @param groups - Commit groups to modify
     * @param preferences - Message preferences to apply
     */
    private _adaptCommitMessages(groups: any[], preferences: MessagePreferences): void {
        // Implementation would modify commit messages based on learned preferences
        // This is a simplified version
    }

    /**
     * Initializes learning data from storage
     * @private
     */
    private async _initializeLearningData(): Promise<void> {
        try {
            const learningDataPath = path.resolve(this.workspaceRoot, this.options.learningDataFile);
            const data = await fs.readFile(learningDataPath, 'utf8');
            const parsedData = JSON.parse(data);

            if (parsedData.feedbackHistory) {
                this.feedbackHistory = parsedData.feedbackHistory;
            }
            if (parsedData.userPreferences) {
                this.userPreferences = new Map(parsedData.userPreferences);
            }
            if (parsedData.groupingPatterns) {
                this.groupingPatterns = new Map(parsedData.groupingPatterns);
            }
        } catch (error) {
            // Learning data doesn't exist yet or is corrupted, start fresh
            console.log('Initializing fresh learning data');
        }
    }

    /**
     * Saves learning data to storage
     * @private
     */
    private async _saveLearningData(): Promise<void> {
        try {
            const learningDataPath = path.resolve(this.workspaceRoot, this.options.learningDataFile);
            const learningDir = path.dirname(learningDataPath);

            // Ensure directory exists
            await fs.mkdir(learningDir, { recursive: true });

            const data = {
                feedbackHistory: this.feedbackHistory,
                userPreferences: Array.from(this.userPreferences.entries()),
                groupingPatterns: Array.from(this.groupingPatterns.entries()),
                lastUpdated: Date.now(),
            };

            await fs.writeFile(learningDataPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.warn('Failed to save learning data:', (error as Error).message);
        }
    }

    /**
     * Generates a session ID for tracking feedback
     * @private
     * @returns Session ID
     */
    private _generateSessionId(): string {
        return crypto.randomBytes(8).toString('hex');
    }

    /**
     * Gets file type from file path
     * @private
     * @param filePath - File path
     * @returns File type
     */
    private _getFileType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const basename = path.basename(filePath).toLowerCase();

        if (basename.includes('test') || basename.includes('spec')) return 'test';
        if (basename.includes('readme') || ext === '.md') return 'docs';
        if (ext === '.json' || ext === '.yml' || ext === '.yaml') return 'config';
        if (ext === '.css' || ext === '.scss' || ext === '.sass') return 'style';

        return 'code';
    }

    /**
     * Analyzes changes made to commit messages
     * @private
     * @param original - Original message
     * @param edited - Edited message
     * @returns Message change pattern
     */
    private _analyzeMessageChanges(original: string, edited: string): any {
        const pattern: { type: string; changes: string[] } = {
            type: 'unknown',
            changes: [],
        };

        if (edited.length > original.length) {
            pattern.type = 'expansion';
            pattern.changes.push('added_detail');
        } else if (edited.length < original.length) {
            pattern.type = 'compression';
            pattern.changes.push('removed_detail');
        } else {
            pattern.type = 'modification';
            pattern.changes.push('changed_wording');
        }

        // Analyze specific changes
        if (edited.includes('(') && !original.includes('(')) {
            pattern.changes.push('added_scope');
        }
        if (edited.includes('!') && !original.includes('!')) {
            pattern.changes.push('added_breaking_change');
        }

        return pattern;
    }

    /**
     * Updates satisfaction weights based on feedback
     * @private
     * @param satisfaction - Satisfaction score (1-5)
     * @param context - Context information
     */
    private _updateSatisfactionWeights(satisfaction: number, context: any): void {
        const contextKey = JSON.stringify(context);

        if (!this.adaptationWeights.has(contextKey)) {
            this.adaptationWeights.set(contextKey, {
                totalSatisfaction: 0,
                feedbackCount: 0,
                averageSatisfaction: 0,
            });
        }

        const weights = this.adaptationWeights.get(contextKey)!;
        weights.totalSatisfaction += satisfaction;
        weights.feedbackCount++;
        weights.averageSatisfaction = weights.totalSatisfaction / weights.feedbackCount;
    }

    /**
     * Gets learning statistics
     * @returns Learning statistics
     */
    getLearningStats(): LearningStats {
        return {
            totalFeedback: this.feedbackHistory.length,
            learnedPatterns: this.groupingPatterns.size,
            userPreferences: this.userPreferences.size,
            averageSatisfaction:
                this.feedbackHistory.length > 0
                    ? Number((this.feedbackHistory.reduce((sum, f) => sum + f.satisfaction, 0) / this.feedbackHistory.length).toFixed(2))
                    : 0,
            confidenceLevel: this._calculateOverallConfidence(),
        };
    }

    /**
     * Calculates overall confidence in learned patterns
     * @private
     * @returns Overall confidence (0-1)
     */
    private _calculateOverallConfidence(): number {
        if (this.feedbackHistory.length < 5) return 0.1;

        const recentFeedback = this.feedbackHistory.slice(-20); // Last 20 feedback entries
        const avgSatisfaction = recentFeedback.reduce((sum, f) => sum + f.satisfaction, 0) / recentFeedback.length;

        return Math.min(1.0, avgSatisfaction / 5.0);
    }
}

export { LearningSystem };
