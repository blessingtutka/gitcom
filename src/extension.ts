import * as vscode from 'vscode';
import * as path from 'path';
import { GitAnalyzer } from './git-analyzer';
import { ChangeAnalyzer } from './change-analyzer';
import { CommitGenerator } from './commit-generator';
import { CommitGrouper } from './commit-grouper';
import { MessageGenerator } from './message-generator';
import { CommitOrchestrator } from './commit-orchestrator';
import { AdvancedFeatureDetector } from './advanced-feature-detector';
import { LearningSystem } from './learning-system';
import { SmartConflictResolver } from './smart-conflict-resolver';
import { CommitMessageTemplates } from './commit-message-templates';
import { AIClusteringCommitGrouper } from './commit-grouper-ai';
import { CommitPlan } from './types/models';
import { UI } from './ui';
import GitComPanelProvider from './panel-provider';
import { ChangeAnalysis } from './types/models';

class GitcomExtension {
    private gitAnalyzer: GitAnalyzer | null;
    private changeAnalyzer: ChangeAnalyzer | null;
    private commitGenerator: CommitGenerator | null;
    private commitGrouper: CommitGrouper | null;
    private messageGenerator: MessageGenerator | null;
    private commitOrchestrator: CommitOrchestrator | null;
    private advancedFeatureDetector: AdvancedFeatureDetector | null;
    private learningSystem: LearningSystem | null;
    private conflictResolver: SmartConflictResolver | null;
    private messageTemplates: CommitMessageTemplates | null;
    private ui: UI;
    private panelProvider: GitComPanelProvider | null;
    private disposables: vscode.Disposable[];

    constructor() {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const config = vscode.workspace.getConfiguration('gitcom');

            // Initialize core components
            this.gitAnalyzer = new GitAnalyzer();
            this.changeAnalyzer = new ChangeAnalyzer(workspaceRoot, {
                enableCache: config.get('enableCache', true),
                maxConcurrency: config.get('maxConcurrency', 5),
                batchSize: config.get('batchSize', 10),
            });
            this.commitGenerator = new CommitGenerator();
            // this.commitGrouper = new CommitGrouper({
            //     enableParallelProcessing: config.get('enableParallelProcessing', true),
            //     maxConcurrency: config.get('maxConcurrency', 3),
            // });
            this.commitGrouper = new AIClusteringCommitGrouper({
                maxFilesPerCommit: 15,
                separateTestCommits: true,
                aiOptions: {
                    enabled: true,
                    apiKey: process.env.OPENAI_API_KEY,
                    minClusterSize: 2,
                    maxClusters: 10,
                },
            });
            this.messageGenerator = new MessageGenerator();
            this.commitOrchestrator = new CommitOrchestrator(workspaceRoot, {
                enableBatching: config.get('enableBatching', true),
                batchSize: config.get('orchestratorBatchSize', 50),
            });

            // Initialize advanced AI features
            this.advancedFeatureDetector = new AdvancedFeatureDetector({
                enableSemanticAnalysis: config.get('enableSemanticAnalysis', true),
                enablePatternLearning: config.get('enablePatternLearning', true),
            });

            this.learningSystem = new LearningSystem(workspaceRoot, {
                enableLearning: config.get('enableLearning', true),
            });

            this.conflictResolver = new SmartConflictResolver({
                conflictResolutionStrategy: config.get('conflictResolutionStrategy', 'balanced'),
            });

            this.messageTemplates = new CommitMessageTemplates(workspaceRoot, {
                enableCustomTemplates: config.get('enableCustomTemplates', true),
                enableDynamicTemplates: config.get('enableDynamicTemplates', true),
                defaultTemplate: config.get('defaultTemplate', 'conventional'),
            });

            this.ui = new UI();
        } catch (error) {
            console.warn('GitCom: Some components failed to initialize:', (error as Error).message);
            // Create minimal fallbacks
            this.gitAnalyzer = null;
            this.changeAnalyzer = null;
            this.commitGenerator = null;
            this.commitGrouper = null;
            this.messageGenerator = null;
            this.commitOrchestrator = null;
            this.advancedFeatureDetector = null;
            this.learningSystem = null;
            this.conflictResolver = null;
            this.messageTemplates = null;
            this.ui = new UI();
            this.ui.showError = (msg: string) => console.error(msg);
            this.ui.showSuccess = (msg: string) => console.log(msg);
            this.ui.showWarning = (msg: string) => console.warn(msg);
            this.ui.showProgress = (msg: string) => console.log(msg);
            this.ui.updateProgress = (msg: string) => console.log(msg);
            this.ui.hideProgress = () => console.log('Progress hidden');
            this.ui.showAnalysis = (analysis: any) => console.log('Analysis:', analysis);
            this.ui.showIntelligentCommitDialog = async (plan: CommitPlan): Promise<IntelligentCommitDialogResult> => ({
                confirmed: false,
                commitPlan: plan,
            });
            this.ui.showCommitDialog = async (message: string, changes: any[]) => ({
                confirmed: false,
                message: '',
            });
        }
        this.panelProvider = null;
        this.disposables = [];
    }

    async activate(context: vscode.ExtensionContext) {
        console.log('GitCom extension activated');

        try {
            // Register panel provider
            this.panelProvider = new GitComPanelProvider(context);
            const panelProviderDisposable = vscode.window.registerWebviewViewProvider('gitcomPanel', this.panelProvider);
            console.log('Panel provider registered successfully');

            // Register commands
            const generateCommitCommand = vscode.commands.registerCommand('gitcom.generateCommit', () => this.generateCommitMessage());

            const analyzeChangesCommand = vscode.commands.registerCommand('gitcom.analyzeChanges', () => this.analyzeChanges());

            const openPanelCommand = vscode.commands.registerCommand('gitcom.openPanel', () =>
                vscode.commands.executeCommand('workbench.view.extension.gitcom'),
            );

            // Advanced AI feature commands
            const showPerformanceStatsCommand = vscode.commands.registerCommand('gitcom.showPerformanceStats', () => this.showPerformanceStats());

            const manageLearningCommand = vscode.commands.registerCommand('gitcom.manageLearning', () => this.manageLearning());

            const manageTemplatesCommand = vscode.commands.registerCommand('gitcom.manageTemplates', () => this.manageTemplates());

            console.log('Commands registered successfully');

            // Store disposables for cleanup
            this.disposables.push(
                panelProviderDisposable,
                generateCommitCommand,
                analyzeChangesCommand,
                openPanelCommand,
                showPerformanceStatsCommand,
                manageLearningCommand,
                manageTemplatesCommand,
            );
            context.subscriptions.push(...this.disposables);

            // Log successful activation
            console.log('GitCom: All components registered successfully');
        } catch (error) {
            console.error('Error during GitCom activation:', error);
            throw error;
        }
    }

    async generateCommitMessage(): Promise<void> {
        try {
            if (!this.changeAnalyzer || !this.commitGrouper || !this.messageGenerator || !this.commitOrchestrator) {
                this.ui.showError('GitCom intelligent commit components not properly initialized');
                return;
            }

            const config = vscode.workspace.getConfiguration('gitcom');
            const useIntelligentCommits = config.get('enableIntelligentCommits', true);

            if (!useIntelligentCommits) {
                // Fall back to legacy behavior
                return this.generateLegacyCommitMessage();
            }

            this.ui.showProgress('Analyzing unstaged changes...');

            // Step 1: Analyze changes using intelligent system
            const analyzedChanges = await this.changeAnalyzer.analyzeUnstagedChanges();
            if (!analyzedChanges || analyzedChanges.length === 0) {
                this.ui.showWarning('No unstaged changes found. Please make some changes first.');
                return;
            }

            this.ui.updateProgress('Detecting advanced features...');

            // Step 1.5: Advanced feature detection
            let advancedFeatures: ConsolidatedFeatures = null;
            if (this.advancedFeatureDetector) {
                try {
                    advancedFeatures = await this.advancedFeatureDetector.detectAdvancedFeatures(analyzedChanges);

                    // Enhance analyzed changes with advanced features
                    for (const change of analyzedChanges) {
                        if (advancedFeatures && advancedFeatures.primaryFeatures.length > 0) {
                            change.advancedFeatures = advancedFeatures.primaryFeatures.filter((f: any) => f.confidence > 0.7).map((f: any) => f.name);
                        }
                    }
                } catch (error) {
                    console.warn('Advanced feature detection failed:', (error as Error).message);
                }
            }

            this.ui.updateProgress('Grouping related changes...');

            // Step 2: Group changes intelligently
            let commitPlan = await this.commitGrouper.groupChanges(analyzedChanges);

            // Step 2.5: Apply learning system adaptations
            if (this.learningSystem) {
                try {
                    const context = {
                        projectType: this._detectProjectType(analyzedChanges),
                        fileTypes: [...new Set(analyzedChanges.map((c: any) => c.fileCategory))],
                        changeSize: analyzedChanges.length > 10 ? 'large' : analyzedChanges.length > 3 ? 'medium' : 'small',
                    };

                    commitPlan.groups = await this.learningSystem.adaptGrouping(commitPlan.groups, context);
                } catch (error) {
                    console.warn('Learning system adaptation failed:', (error as Error).message);
                }
            }

            // Step 2.6: Resolve conflicts
            if (this.conflictResolver) {
                try {
                    const resolutionResult = await this.conflictResolver.resolveConflicts(commitPlan.groups);
                    if (resolutionResult.success) {
                        commitPlan.groups = resolutionResult.resolvedGroups;
                    } else {
                        console.warn('Conflict resolution warnings:', resolutionResult.warnings);
                    }
                } catch (error) {
                    console.warn('Conflict resolution failed:', (error as Error).message);
                }
            }

            this.ui.updateProgress('Generating commit messages...');

            // Step 3: Generate messages for each group using templates
            const templateName = config.get('defaultTemplate', 'conventional');
            for (const group of commitPlan.groups) {
                if (!group.message) {
                    if (this.messageTemplates) {
                        try {
                            const context = {
                                advancedFeatures: advancedFeatures,
                                projectType: this._detectProjectType(analyzedChanges),
                            };
                            group.message = await this.messageTemplates.generateMessage(group, templateName, context);
                        } catch (error) {
                            console.warn('Template message generation failed, falling back to default:', (error as Error).message);
                            group.message = await this.messageGenerator.generateCommitMessage(group);
                        }
                    } else {
                        group.message = await this.messageGenerator.generateCommitMessage(group);
                    }
                }
            }

            this.ui.hideProgress();

            // Step 4: Show preview and get user confirmation
            const result = await this.ui.showIntelligentCommitDialog(commitPlan);

            if (result.confirmed) {
                this.ui.showProgress('Creating commits...');

                try {
                    // Step 5: Execute the commit plan
                    const results = await this.commitOrchestrator.executeCommitPlan(commitPlan);

                    const successfulCommits = results.filter((r) => r.success);
                    const failedCommits = results.filter((r) => !r.success);

                    this.ui.hideProgress();

                    if (failedCommits.length === 0) {
                        this.ui.showSuccess(`Successfully created ${successfulCommits.length} commits!`);
                    } else {
                        this.ui.showWarning(
                            `Created ${successfulCommits.length} commits, ${failedCommits.length} failed. Check the panel for details.`,
                        );
                    }

                    // Refresh the panel to show updated commit history
                    if (this.panelProvider) {
                        this.panelProvider.sendUpdate();
                    }
                } catch (executionError) {
                    this.ui.hideProgress();
                    this.ui.showError(`Error executing commits: ${(executionError as Error).message}`);
                }
            }
        } catch (error) {
            if (this.ui.hideProgress) this.ui.hideProgress();
            this.ui.showError(`Error generating intelligent commits: ${(error as Error).message}`);
            console.error('Intelligent commit generation error:', error);
        }
    }

    async generateLegacyCommitMessage(): Promise<void> {
        try {
            if (!this.gitAnalyzer || !this.changeAnalyzer || !this.commitGenerator) {
                this.ui.showError('GitCom legacy components not properly initialized');
                return;
            }

            this.ui.showProgress('Analyzing unstaged changes...');

            // Use the new ChangeAnalyzer for intelligent analysis
            const analyzedChanges = await this.changeAnalyzer.analyzeUnstagedChanges();
            if (!analyzedChanges || analyzedChanges.length === 0) {
                this.ui.showWarning('No unstaged changes found. Please make some changes first.');
                return;
            }

            this.ui.updateProgress('Generating commit message...');

            // Use the existing commit generator with the analyzed changes
            const commitMessage = await this.commitGenerator.generate(analyzedChanges);

            this.ui.hideProgress();
            const result = await this.ui.showCommitDialog(commitMessage, analyzedChanges);

            if (result.confirmed) {
                // Stage all files and commit
                for (const change of analyzedChanges) {
                    await this.gitAnalyzer.git.add(change.filePath);
                }
                await this.gitAnalyzer.commit(result.message);
                this.ui.showSuccess('Commit created successfully!');
            }
        } catch (error) {
            if (this.ui.hideProgress) this.ui.hideProgress();
            this.ui.showError(`Error generating commit: ${(error as Error).message}`);
        }
    }

    async analyzeChanges(): Promise<void> {
        try {
            if (!this.changeAnalyzer) {
                this.ui.showError('Change analyzer not available');
                return;
            }

            // Use the new ChangeAnalyzer for more detailed analysis
            const analyzedChanges = await this.changeAnalyzer.analyzeUnstagedChanges();

            // Create analysis summary
            const analysis: ChangeAnalysis = {
                totalFiles: analyzedChanges.length,
                changeTypes: {},
                fileCategories: {},
                totalLines: { added: 0, removed: 0 },
                detectedFeatures: [],
                complexity: 'low',
            };

            for (const change of analyzedChanges) {
                // Count change types
                analysis.changeTypes[change.changeType] = (analysis.changeTypes[change.changeType] || 0) + 1;

                // Count file categories
                analysis.fileCategories[change.fileCategory] = (analysis.fileCategories[change.fileCategory] || 0) + 1;

                // Sum line changes
                analysis.totalLines.added += change.linesAdded || 0;
                analysis.totalLines.removed += change.linesRemoved || 0;

                // Collect features
                if (change.detectedFeatures) {
                    analysis.detectedFeatures.push(...change.detectedFeatures);
                }
            }

            // Remove duplicate features
            analysis.detectedFeatures = [...new Set(analysis.detectedFeatures)];

            // Determine complexity
            const totalLineChanges = analysis.totalLines.added + analysis.totalLines.removed;
            if (totalLineChanges > 100 || analysis.totalFiles > 5) {
                analysis.complexity = 'high';
            } else if (totalLineChanges > 20 || analysis.totalFiles > 2) {
                analysis.complexity = 'medium';
            }

            this.ui.showAnalysis(analysis);
        } catch (error) {
            this.ui.showError(`Error analyzing changes: ${(error as Error).message}`);
        }
    }

    /**
     * Shows performance statistics for all components
     */
    async showPerformanceStats(): Promise<void> {
        try {
            const stats: PerformanceStatsSummary = {
                changeAnalyzer: this.changeAnalyzer?.getPerformanceStats() || {},
                commitGrouper: this.commitGrouper?.getPerformanceStats() || {},
                commitOrchestrator: this.commitOrchestrator?.getPerformanceStats() || {},
                conflictResolver: this.conflictResolver?.getResolutionStats() || {},
                learningSystem: this.learningSystem?.getLearningStats() || {},
            };

            const message = this._formatPerformanceStats(stats);
            await vscode.window.showInformationMessage('GitCom Performance Statistics', { modal: true, detail: message });
        } catch (error) {
            this.ui.showError(`Error showing performance stats: ${(error as Error).message}`);
        }
    }

    /**
     * Manages learning system settings and data
     */
    async manageLearning(): Promise<void> {
        try {
            if (!this.learningSystem) {
                this.ui.showError('Learning system not available');
                return;
            }

            const options = ['View Learning Statistics', 'Clear Learning Data', 'Export Learning Data', 'Configure Learning Settings'];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select learning management option',
            });

            switch (selection) {
                case 'View Learning Statistics':
                    const stats = this.learningSystem.getLearningStats();
                    const statsMessage = this._formatLearningStats(stats);
                    await vscode.window.showInformationMessage('Learning Statistics', { modal: true, detail: statsMessage });
                    break;

                case 'Clear Learning Data':
                    const confirm = await vscode.window.showWarningMessage(
                        'This will clear all learned patterns and user feedback. Are you sure?',
                        'Yes',
                        'No',
                    );
                    if (confirm === 'Yes') {
                        // Reset learning system (implementation would clear data)
                        this.ui.showSuccess('Learning data cleared successfully');
                    }
                    break;

                case 'Configure Learning Settings':
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'gitcom.learning');
                    break;
            }
        } catch (error) {
            this.ui.showError(`Error managing learning: ${(error as Error).message}`);
        }
    }

    /**
     * Manages commit message templates
     */
    async manageTemplates(): Promise<void> {
        try {
            if (!this.messageTemplates) {
                this.ui.showError('Message templates not available');
                return;
            }

            const options = ['List Available Templates', 'Create Custom Template', 'View Template Usage Stats', 'Set Default Template'];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select template management option',
            });

            switch (selection) {
                case 'List Available Templates':
                    const templates = this.messageTemplates.listTemplates();
                    const templateList = templates.map((t) => `${t.name} (${t.type}): ${t.description}`).join('\n');
                    await vscode.window.showInformationMessage('Available Templates', { modal: true, detail: templateList });
                    break;

                case 'View Template Usage Stats':
                    const stats = this.messageTemplates.getUsageStats();
                    const statsMessage = Object.entries(stats)
                        .map(([name, count]) => `${name}: ${count} uses`)
                        .join('\n');
                    await vscode.window.showInformationMessage('Template Usage Statistics', { modal: true, detail: statsMessage });
                    break;

                case 'Set Default Template':
                    const availableTemplates = this.messageTemplates.listTemplates();
                    const templateNames = availableTemplates.map((t) => t.name);
                    const selectedTemplate = await vscode.window.showQuickPick(templateNames, {
                        placeHolder: 'Select default template',
                    });
                    if (selectedTemplate) {
                        const config = vscode.workspace.getConfiguration('gitcom');
                        await config.update('defaultTemplate', selectedTemplate, vscode.ConfigurationTarget.Workspace);
                        this.ui.showSuccess(`Default template set to: ${selectedTemplate}`);
                    }
                    break;
            }
        } catch (error) {
            this.ui.showError(`Error managing templates: ${(error as Error).message}`);
        }
    }

    /**
     * Detects project type from analyzed changes
     * @private
     * @param analyzedChanges - Analyzed changes
     * @returns Project type
     */
    private _detectProjectType(analyzedChanges: any[]): string {
        const fileExtensions = analyzedChanges.map((c) => {
            const ext = path.extname(c.filePath).toLowerCase();
            return ext;
        });

        const extensionCounts: Record<string, number> = {};
        for (const ext of fileExtensions) {
            extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
        }

        // Determine project type based on file extensions
        if (extensionCounts['.js'] || extensionCounts['.ts'] || extensionCounts['.jsx'] || extensionCounts['.tsx']) {
            return 'javascript';
        } else if (extensionCounts['.py']) {
            return 'python';
        } else if (extensionCounts['.java']) {
            return 'java';
        } else if (extensionCounts['.cs']) {
            return 'csharp';
        } else if (extensionCounts['.go']) {
            return 'go';
        } else if (extensionCounts['.rs']) {
            return 'rust';
        } else {
            return 'unknown';
        }
    }

    /**
     * Formats performance statistics for display
     * @private
     * @param stats - Performance statistics
     * @returns Formatted statistics
     */
    private _formatPerformanceStats(stats: PerformanceStatsSummary): string {
        let message = 'GitCom Performance Statistics:\n\n';

        if (stats.changeAnalyzer && Object.keys(stats.changeAnalyzer).length > 0) {
            message += 'Change Analyzer:\n';
            message += `  Cache Hit Rate: ${stats.changeAnalyzer.cacheHitRate || 'N/A'}\n`;
            message += `  Files Processed: ${stats.changeAnalyzer.filesProcessed || 0}\n`;
            message += `  Average Processing Time: ${stats.changeAnalyzer.averageProcessingTime || 'N/A'}\n\n`;
        }

        if (stats.commitGrouper && Object.keys(stats.commitGrouper).length > 0) {
            message += 'Commit Grouper:\n';
            message += `  Files Processed: ${stats.commitGrouper.filesProcessed || 0}\n`;
            message += `  Average Grouping Time: ${stats.commitGrouper.averageGroupingTime || 'N/A'}\n\n`;
        }

        if (stats.commitOrchestrator && Object.keys(stats.commitOrchestrator).length > 0) {
            message += 'Commit Orchestrator:\n';
            message += `  Success Rate: ${stats.commitOrchestrator.successRate || 'N/A'}\n`;
            message += `  Total Commits: ${stats.commitOrchestrator.totalCommits || 0}\n`;
            message += `  Average Commit Time: ${stats.commitOrchestrator.averageCommitTime || 'N/A'}\n\n`;
        }

        if (stats.conflictResolver && Object.keys(stats.conflictResolver).length > 0) {
            message += 'Conflict Resolver:\n';
            message += `  Success Rate: ${stats.conflictResolver.successRate || 'N/A'}\n`;
            message += `  Total Attempts: ${stats.conflictResolver.totalAttempts || 0}\n`;
            message += `  Most Common Conflict: ${stats.conflictResolver.mostCommonConflict || 'N/A'}\n\n`;
        }

        if (stats.learningSystem && Object.keys(stats.learningSystem).length > 0) {
            message += 'Learning System:\n';
            message += `  Total Feedback: ${stats.learningSystem.totalFeedback || 0}\n`;
            message += `  Learned Patterns: ${stats.learningSystem.learnedPatterns || 0}\n`;
            message += `  Average Satisfaction: ${stats.learningSystem.averageSatisfaction || 'N/A'}\n`;
        }

        return message;
    }

    /**
     * Formats learning statistics for display
     * @private
     * @param stats - Learning statistics
     * @returns Formatted statistics
     */
    private _formatLearningStats(stats: LearningStats): string {
        return `Learning System Statistics:

Total Feedback Entries: ${stats.totalFeedback || 0}
Learned Patterns: ${stats.learnedPatterns || 0}
User Preferences: ${stats.userPreferences || 0}
Average Satisfaction: ${stats.averageSatisfaction || 'N/A'}
Confidence Level: ${stats.confidenceLevel || 'N/A'}

The learning system adapts to your preferences over time to provide better commit grouping suggestions.`;
    }

    deactivate(): void {
        console.log('GitCom extension deactivated');

        // Clean up all disposables
        this.disposables.forEach((disposable) => {
            if (disposable && typeof disposable.dispose === 'function') {
                disposable.dispose();
            }
        });
        this.disposables = [];

        // Clear panel provider
        if (this.panelProvider) {
            this.panelProvider = null;
        }

        // Clear activation context
        console.log('GitCom: Extension deactivated');

        console.log('GitCom extension cleanup completed');
    }
}

// Global extension instance for proper cleanup
let extensionInstance: GitcomExtension | null = null;

// VS Code extension activation
export function activate(context: vscode.ExtensionContext): void {
    try {
        console.log('GitCom: Starting extension activation...');
        extensionInstance = new GitcomExtension();
        extensionInstance.activate(context);
    } catch (error) {
        console.error('GitCom: Failed to activate extension:', error);
        throw error;
    }
}

export function deactivate(): void {
    // Ensure proper cleanup when extension is uninstalled
    if (extensionInstance) {
        extensionInstance.deactivate();
        extensionInstance = null;
    }
}
