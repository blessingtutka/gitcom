import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChangeAnalyzer } from './change-analyzer';
import { CommitGrouper } from './commit-grouper';
import { MessageGenerator } from './message-generator';
import { CommitOrchestrator } from './commit-orchestrator';
import { CommitPlan, CommitResult } from './types';

class GitComPanelProvider implements vscode.WebviewViewProvider {
    private context: vscode.ExtensionContext;
    private commitHistory: CommitHistoryItem[];
    private webviewView: vscode.WebviewView | null;
    private currentCommitPlan: any; // Would be better to define a proper interface
    private isAnalyzing: boolean;
    private analysisProgress: AnalysisProgress;

    private changeAnalyzer: ChangeAnalyzer;
    private commitGrouper: CommitGrouper;
    private messageGenerator: MessageGenerator;
    private commitOrchestrator: CommitOrchestrator;

    constructor(context: vscode.ExtensionContext) {
        console.log('GitCom: Initializing panel provider...');
        this.context = context;
        this.commitHistory = [];
        this.webviewView = null;
        this.currentCommitPlan = null;
        this.isAnalyzing = false;
        this.analysisProgress = { phase: '', message: '', progress: 0 };
        console.log('GitCom: Panel provider constructor completed');

        // Initialize intelligent commit generation components
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this.changeAnalyzer = new ChangeAnalyzer(workspaceRoot);
        this.commitGrouper = new CommitGrouper();
        this.messageGenerator = new MessageGenerator();
        this.commitOrchestrator = new CommitOrchestrator(workspaceRoot);

        try {
            this.loadCommitHistory();
            console.log('GitComPanelProvider initialized successfully');
        } catch (error) {
            console.error('Error initializing GitComPanelProvider:', error);
            this.commitHistory = [];
        }
    }

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken): void {
        console.log('GitCom: resolveWebviewView called - webview is being created!');
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath))],
        };
        console.log('GitCom: Webview options set, generating HTML content...');

        // Set HTML content first
        webviewView.webview.html = this.getWebviewContent();

        // Send initial update after a short delay to ensure webview is ready
        setTimeout(() => {
            this.sendUpdate();
        }, 500);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message: any) => {
            try {
                switch (message.command) {
                    case 'ready':
                        // Webview is ready, send initial data
                        this.sendUpdate();
                        break;
                    case 'updateSetting':
                        await this.updateSetting(message.key, message.value);
                        break;
                    case 'generateCommit':
                        await this.generateIntelligentCommit();
                        break;
                    case 'resetIntelligentCommitSettings':
                        await this.resetIntelligentCommitSettings();
                        break;
                    case 'executeCommitPlan':
                        await this.executeCommitPlan();
                        break;
                    case 'editCommitMessage':
                        await this.editCommitMessage(message.groupId, message.newMessage);
                        break;
                    case 'moveFileBetweenGroups':
                        await this.moveFileBetweenGroups(message.filePath, message.fromGroupId, message.toGroupId);
                        break;
                    case 'removeFileFromGroup':
                        await this.removeFileFromGroup(message.filePath, message.groupId);
                        break;
                    case 'cancelCommitPlan':
                        this.cancelCommitPlan();
                        break;
                    case 'pushCommits':
                        await this.pushCommits();
                        break;
                    case 'removeCommit':
                        this.removeCommit(message.index);
                        break;
                    case 'editCommit':
                        await this.editCommit(message.index, message.newMessage);
                        break;
                    default:
                        console.warn('Unknown message from webview:', message);
                }
            } catch (error) {
                console.error('Error handling webview message:', error);
                vscode.window.showErrorMessage(`GitCom Error: ${(error as Error).message}`);
            }
        });
    }

    private async updateSetting(key: string, value: any): Promise<void> {
        try {
            // Validate the setting value
            const validationResult = this.validateConfigurationValue(key, value);
            if (!validationResult.isValid) {
                this.showError('Invalid Configuration Value', validationResult.error!, { setting: key, value: value }, [
                    'Check the setting constraints and try again',
                ]);
                return;
            }

            const config = vscode.workspace.getConfiguration('gitcom');
            await config.update(key.replace('gitcom.', ''), value, vscode.ConfigurationTarget.Workspace);
            this.sendUpdate();

            // Show success message for important settings
            if (['enableIntelligentCommits', 'groupingStrategy', 'maxFilesPerCommit'].includes(key.replace('gitcom.', ''))) {
                vscode.window.showInformationMessage(`GitCom: ${key} updated successfully`);
            }
        } catch (error) {
            this.showError('Configuration Update Failed', (error as Error).message, { setting: key, value: value }, [
                'Check VS Code permissions and try again',
            ]);
        }
    }

    private validateConfigurationValue(key: string, value: any): ValidationResult {
        const settingName = key.replace('gitcom.', '');

        switch (settingName) {
            case 'maxFilesPerCommit':
                if (typeof value !== 'number' || value < 1 || value > 50) {
                    return { isValid: false, error: 'maxFilesPerCommit must be a number between 1 and 50' };
                }
                break;

            case 'maxCommitMessageLength':
                if (typeof value !== 'number' || value < 50 || value > 100) {
                    return { isValid: false, error: 'maxCommitMessageLength must be a number between 50 and 100' };
                }
                break;

            case 'groupingStrategy':
                const validStrategies = ['intelligent', 'by-type', 'by-directory', 'single-commit'];
                if (!validStrategies.includes(value)) {
                    return { isValid: false, error: `groupingStrategy must be one of: ${validStrategies.join(', ')}` };
                }
                break;

            case 'commitStyle':
                const validStyles = ['conventional', 'semantic', 'custom'];
                if (!validStyles.includes(value)) {
                    return { isValid: false, error: `commitStyle must be one of: ${validStyles.join(', ')}` };
                }
                break;

            case 'detailLevel':
                const validLevels = ['concise', 'normal', 'verbose'];
                if (!validLevels.includes(value)) {
                    return { isValid: false, error: `detailLevel must be one of: ${validLevels.join(', ')}` };
                }
                break;

            case 'enableIntelligentCommits':
            case 'autoStage':
            case 'batchCommits':
            case 'separateTestCommits':
            case 'enableFeatureDetection':
            case 'enableBreakingChangeDetection':
            case 'prioritizeFeatures':
                if (typeof value !== 'boolean') {
                    return { isValid: false, error: `${settingName} must be a boolean value` };
                }
                break;

            case 'maxLength':
                if (typeof value !== 'number' || value < 20 || value > 200) {
                    return { isValid: false, error: 'maxLength must be a number between 20 and 200' };
                }
                break;
        }

        return { isValid: true };
    }

    private async resetIntelligentCommitSettings(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('gitcom');

            // Reset all intelligent commit settings to their defaults
            const defaultSettings = {
                enableIntelligentCommits: true,
                maxFilesPerCommit: 10,
                groupingStrategy: 'intelligent',
                separateTestCommits: true,
                enableFeatureDetection: true,
                enableBreakingChangeDetection: true,
                prioritizeFeatures: true,
                maxCommitMessageLength: 72,
            };

            // Update each setting
            for (const [key, value] of Object.entries(defaultSettings)) {
                await config.update(key, value, vscode.ConfigurationTarget.Workspace);
            }

            this.sendUpdate();

            vscode.window.showInformationMessage('GitCom: Intelligent commit settings reset to defaults');
        } catch (error) {
            this.showError('Settings Reset Failed', (error as Error).message, { errorType: 'settings_reset_error' }, [
                'Check VS Code permissions and try again',
            ]);
        }
    }

    private async generateIntelligentCommit(): Promise<void> {
        if (this.isAnalyzing) {
            vscode.window.showWarningMessage('Analysis already in progress');
            return;
        }

        try {
            this.isAnalyzing = true;
            this.updateAnalysisProgress('analyzing', 'Scanning repository for unstaged changes...', 5, {
                step: 1,
                totalSteps: 4,
                currentAction: 'git_status',
            });

            // Step 1: Analyze changes
            this.updateAnalysisProgress('analyzing', 'Analyzing file changes and dependencies...', 15, {
                step: 1,
                totalSteps: 4,
                currentAction: 'file_analysis',
            });

            const analyzedChanges = await this.changeAnalyzer.analyzeUnstagedChanges();

            if (analyzedChanges.length === 0) {
                this.showSuccess('No unstaged changes found to commit', {
                    suggestion: 'Make some changes to your files and try again',
                });
                this.isAnalyzing = false;
                this.sendUpdate();
                return;
            }

            this.updateAnalysisProgress('analyzing', `Analyzed ${analyzedChanges.length} changed files`, 25, {
                step: 1,
                totalSteps: 4,
                filesAnalyzed: analyzedChanges.length,
                currentAction: 'analysis_complete',
            });

            // Step 2: Group changes
            this.updateAnalysisProgress('grouping', 'Detecting related changes and features...', 40, {
                step: 2,
                totalSteps: 4,
                currentAction: 'feature_detection',
            });

            const commitPlan = await this.commitGrouper.groupChanges(analyzedChanges);

            this.updateAnalysisProgress('grouping', `Grouped changes into ${commitPlan.getCommitCount()} logical commits`, 60, {
                step: 2,
                totalSteps: 4,
                groupsCreated: commitPlan.getCommitCount(),
                currentAction: 'grouping_complete',
            });

            // Step 3: Generate messages for each group
            this.updateAnalysisProgress('generating', 'Generating intelligent commit messages...', 70, {
                step: 3,
                totalSteps: 4,
                currentAction: 'message_generation',
            });

            for (let i = 0; i < commitPlan.groups.length; i++) {
                const group = commitPlan.groups[i];
                if (!group.message) {
                    this.updateAnalysisProgress(
                        'generating',
                        `Generating message for commit ${i + 1}/${commitPlan.groups.length}...`,
                        70 + (20 * (i + 1)) / commitPlan.groups.length,
                        {
                            step: 3,
                            totalSteps: 4,
                            currentCommit: i + 1,
                            totalCommits: commitPlan.groups.length,
                            currentAction: 'generating_message',
                        },
                    );

                    group.message = await this.messageGenerator.generateCommitMessage(group);
                }
            }

            this.updateAnalysisProgress('complete', 'Commit plan ready for review', 100, {
                step: 4,
                totalSteps: 4,
                currentAction: 'complete',
                summary: {
                    commits: commitPlan.getCommitCount(),
                    files: commitPlan.getTotalFileCount(),
                    warnings: commitPlan.warnings.length,
                },
            });

            // Store the commit plan
            this.currentCommitPlan = commitPlan;
            this.isAnalyzing = false;
            this.sendUpdate();

            this.showSuccess(`Generated ${commitPlan.getCommitCount()} commits for ${commitPlan.getTotalFileCount()} files`, {
                commits: commitPlan.getCommitCount(),
                files: commitPlan.getTotalFileCount(),
                estimatedTime: `${Math.ceil(commitPlan.estimatedTime / 60)} minutes`,
                warnings: commitPlan.warnings,
            });
        } catch (error) {
            this.isAnalyzing = false;
            this.analysisProgress = { phase: '', message: '', progress: 0 };
            this.sendUpdate();

            this.showError(
                'Commit Generation Failed',
                (error as Error).message,
                {
                    errorType: 'analysis_error',
                    phase: this.analysisProgress.phase,
                    stack: (error as Error).stack,
                },
                [
                    'Check that you have unstaged changes in your repository',
                    'Ensure your git repository is properly initialized',
                    'Try refreshing the extension and running again',
                    'Check the VS Code output panel for detailed error logs',
                ],
            );

            console.error('Intelligent commit generation error:', error);
        }
    }

    private async executeCommitPlan(): Promise<void> {
        if (!this.currentCommitPlan) {
            vscode.window.showWarningMessage('No commit plan available to execute');
            return;
        }

        try {
            const totalCommits = this.currentCommitPlan.getCommitCount();
            this.updateAnalysisProgress('executing', 'Preparing to execute commit plan...', 5, {
                step: 0,
                totalSteps: totalCommits,
                currentAction: 'preparation',
            });

            const results = await this.executeCommitPlanWithProgress(this.currentCommitPlan);

            // Add successful commits to history
            const successfulCommits = results.filter((result) => result.success);
            for (const result of successfulCommits) {
                this.commitHistory.push({
                    message: result.message,
                    files: result.filesCommitted,
                    timestamp: new Date().toISOString(),
                    pushed: false,
                    commitHash: result.commitHash,
                });
            }

            this.saveCommitHistory();

            // Clear the current plan after execution
            this.currentCommitPlan = null;
            this.analysisProgress = { phase: '', message: '', progress: 0 };
            this.sendUpdate();

            const failedCommits = results.filter((result) => !result.success);
            if (failedCommits.length === 0) {
                this.showSuccess(`Successfully created ${successfulCommits.length} commits`, {
                    commits: successfulCommits.map((c) => ({
                        hash: c.commitHash,
                        message: c.message,
                        files: c.filesCommitted.length,
                    })),
                });
            } else {
                this.showError(
                    'Partial Commit Execution',
                    `Created ${successfulCommits.length} commits, ${failedCommits.length} failed`,
                    {
                        successful: successfulCommits.length,
                        failed: failedCommits.length,
                        failures: failedCommits.map((f) => ({
                            message: f.message,
                            error: f.error,
                        })),
                    },
                    [
                        'Review the failed commits and try to resolve the issues',
                        'Check file permissions and git repository state',
                        'Consider running the failed commits manually',
                    ],
                );
            }
        } catch (error) {
            this.analysisProgress = { phase: '', message: '', progress: 0 };
            this.sendUpdate();

            this.showError(
                'Commit Execution Failed',
                (error as Error).message,
                {
                    errorType: 'execution_error',
                    stack: (error as Error).stack,
                },
                [
                    'Check your git repository status',
                    'Ensure you have proper permissions to create commits',
                    'Try executing commits manually to identify the issue',
                ],
            );
        }
    }

    private async executeCommitPlanWithProgress(commitPlan: CommitPlan): Promise<CommitResult[]> {
        const results: CommitResult[] = [];
        const totalCommits = commitPlan.groups.length;

        for (let i = 0; i < commitPlan.groups.length; i++) {
            const group = commitPlan.groups[i];
            const progress = 10 + (80 * (i + 1)) / totalCommits;

            this.updateAnalysisProgress('executing', `Creating commit ${i + 1}/${totalCommits}: ${group.message}`, progress, {
                step: i + 1,
                totalSteps: totalCommits,
                currentCommit: {
                    message: group.message,
                    files: group.getFileCount(),
                    type: group.type,
                },
                currentAction: 'creating_commit',
            });

            try {
                // Stage files for this commit
                await this.commitOrchestrator.stageFiles(group.getFilePaths());

                // Create the commit
                const result = await this.commitOrchestrator.createCommit(group.message);
                result.filesCommitted = group.getFilePaths();
                results.push(result);

                if (result.success) {
                    this.updateAnalysisProgress('executing', `✓ Commit ${i + 1} created successfully`, progress, {
                        step: i + 1,
                        totalSteps: totalCommits,
                        currentAction: 'commit_success',
                        commitHash: result.commitHash,
                    });
                } else {
                    this.updateAnalysisProgress('executing', `✗ Commit ${i + 1} failed: ${result.error}`, progress, {
                        step: i + 1,
                        totalSteps: totalCommits,
                        currentAction: 'commit_failed',
                        error: result.error,
                    });
                }
            } catch (error: any) {
                const failureResult = await this.commitOrchestrator.handleCommitFailure(error, {
                    group,
                    commitIndex: i,
                    totalCommits,
                    previousResults: results,
                    successfulCommits: [],
                });

                results.push(failureResult);

                this.updateAnalysisProgress('executing', `✗ Commit ${i + 1} failed: ${(error as Error).message}`, progress, {
                    step: i + 1,
                    totalSteps: totalCommits,
                    currentAction: 'commit_failed',
                    error: (error as Error).message,
                    recoverable: failureResult.metadata?.isRecoverable,
                });
            }
        }

        this.updateAnalysisProgress('complete', 'Commit execution completed', 100, {
            step: totalCommits,
            totalSteps: totalCommits,
            currentAction: 'execution_complete',
            summary: {
                total: results.length,
                successful: results.filter((r) => r.success).length,
                failed: results.filter((r) => !r.success).length,
            },
        });

        return results;
    }

    private async editCommitMessage(groupId: string, newMessage: string): Promise<void> {
        if (!this.currentCommitPlan) return;

        const group = this.currentCommitPlan.groups.find((g: any) => g.id === groupId);
        if (group) {
            group.message = newMessage;
            this.sendUpdate();
        }
    }

    private async moveFileBetweenGroups(filePath: string, fromGroupId: string, toGroupId: string): Promise<void> {
        if (!this.currentCommitPlan) return;

        const fromGroup = this.currentCommitPlan.groups.find((g: any) => g.id === fromGroupId);
        const toGroup = this.currentCommitPlan.groups.find((g: any) => g.id === toGroupId);

        if (fromGroup && toGroup) {
            const fileIndex = fromGroup.files.findIndex((f: any) => f.filePath === filePath);
            if (fileIndex !== -1) {
                const file = fromGroup.files.splice(fileIndex, 1)[0];
                toGroup.files.push(file);
                this.sendUpdate();
            }
        }
    }

    private async removeFileFromGroup(filePath: string, groupId: string): Promise<void> {
        if (!this.currentCommitPlan) return;

        const group = this.currentCommitPlan.groups.find((g: any) => g.id === groupId);
        if (group) {
            const fileIndex = group.files.findIndex((f: any) => f.filePath === filePath);
            if (fileIndex !== -1) {
                group.files.splice(fileIndex, 1);

                // Remove empty groups
                if (group.files.length === 0) {
                    const groupIndex = this.currentCommitPlan.groups.findIndex((g: any) => g.id === groupId);
                    if (groupIndex !== -1) {
                        this.currentCommitPlan.groups.splice(groupIndex, 1);
                    }
                }

                this.sendUpdate();
            }
        }
    }

    private cancelCommitPlan(): void {
        this.currentCommitPlan = null;
        this.isAnalyzing = false;
        this.analysisProgress = { phase: '', message: '', progress: 0 };
        this.sendUpdate();
    }

    private updateAnalysisProgress(phase: string, message: string, progress: number, details: any = null): void {
        this.analysisProgress = {
            phase,
            message,
            progress,
            details,
            timestamp: new Date().toISOString(),
        };
        this.sendUpdate();
    }

    private showError(title: string, message: string, details: any = null, suggestedActions: string[] = []): void {
        const errorInfo: ErrorInfo = {
            title,
            message,
            details,
            suggestedActions,
            timestamp: new Date().toISOString(),
        };

        // Send error to webview
        if (this.webviewView && this.webviewView.webview) {
            this.webviewView.webview.postMessage({
                command: 'showError',
                error: errorInfo,
            });
        }

        // Also show VS Code notification
        vscode.window.showErrorMessage(`${title}: ${message}`);
    }

    private showSuccess(message: string, details: any = null): void {
        const successInfo: SuccessInfo = {
            message,
            details,
            timestamp: new Date().toISOString(),
        };

        if (this.webviewView && this.webviewView.webview) {
            this.webviewView.webview.postMessage({
                command: 'showSuccess',
                success: successInfo,
            });
        }

        vscode.window.showInformationMessage(message);
    }

    private async pushCommits(): Promise<void> {
        try {
            const simpleGit = require('simple-git');
            const git = simpleGit();
            await git.push();
            // Mark all commits as pushed
            this.commitHistory.forEach((commit) => (commit.pushed = true));
            this.saveCommitHistory();
            this.sendUpdate();
            vscode.window.showInformationMessage('Commits pushed successfully');
        } catch (error) {
            console.error('Push error:', error);
            vscode.window.showErrorMessage(`Failed to push commits: ${(error as Error).message}`);
        }
    }

    private removeCommit(index: number): void {
        this.commitHistory.splice(index, 1);
        this.saveCommitHistory();
        this.sendUpdate();
    }

    private async editCommit(index: number, newMessage: string): Promise<void> {
        if (this.commitHistory[index]) {
            this.commitHistory[index].message = newMessage;
            this.saveCommitHistory();
            this.sendUpdate();
        }
    }

    sendUpdate(): void {
        if (this.webviewView && this.webviewView.webview) {
            try {
                const config = vscode.workspace.getConfiguration('gitcom');
                const updateData = {
                    command: 'update',
                    data: {
                        settings: {
                            commitStyle: config.get('commitStyle', 'conventional'),
                            detailLevel: config.get('detailLevel', 'normal'),
                            maxLength: config.get('maxLength', 72),
                            autoStage: config.get('autoStage', true),
                            batchCommits: config.get('batchCommits', false),
                            enableIntelligentCommits: config.get('enableIntelligentCommits', true),
                            maxFilesPerCommit: config.get('maxFilesPerCommit', 10),
                            groupingStrategy: config.get('groupingStrategy', 'intelligent'),
                            separateTestCommits: config.get('separateTestCommits', true),
                            enableFeatureDetection: config.get('enableFeatureDetection', true),
                            enableBreakingChangeDetection: config.get('enableBreakingChangeDetection', true),
                            prioritizeFeatures: config.get('prioritizeFeatures', true),
                            maxCommitMessageLength: config.get('maxCommitMessageLength', 72),
                        },
                        commitHistory: this.commitHistory || [],
                        unpushedCount: (this.commitHistory || []).filter((c) => !c.pushed).length,
                        commitPlan: this.currentCommitPlan ? this.serializeCommitPlan(this.currentCommitPlan) : null,
                        isAnalyzing: this.isAnalyzing,
                        analysisProgress: this.analysisProgress,
                    },
                };

                console.log('Sending update to webview:', updateData);
                this.webviewView.webview.postMessage(updateData);
            } catch (error) {
                console.error('Error sending update to webview:', error);
            }
        } else {
            console.warn('Webview not available for update');
        }
    }

    private loadCommitHistory(): void {
        try {
            const historyPath = path.join(this.context.globalStoragePath, 'commit-history.json');
            if (fs.existsSync(historyPath)) {
                this.commitHistory = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            }
        } catch (error) {
            console.error('Failed to load commit history:', error);
            this.commitHistory = [];
        }
    }

    private saveCommitHistory(): void {
        try {
            const historyPath = path.join(this.context.globalStoragePath, 'commit-history.json');
            fs.mkdirSync(path.dirname(historyPath), { recursive: true });
            fs.writeFileSync(historyPath, JSON.stringify(this.commitHistory, null, 2));
        } catch (error) {
            console.error('Failed to save commit history:', error);
        }
    }

    private serializeCommitPlan(commitPlan: any): any {
        return {
            groups: commitPlan.groups.map((group: any) => ({
                id: group.id,
                type: group.type,
                scope: group.scope,
                description: group.description,
                message: group.message,
                priority: group.priority,
                files: group.files.map((file: any) => ({
                    filePath: file.filePath,
                    changeType: file.changeType,
                    linesAdded: file.linesAdded,
                    linesRemoved: file.linesRemoved,
                    fileCategory: file.fileCategory,
                })),
                fileCount: group.getFileCount(),
                lineStats: group.getLineStats(),
            })),
            totalFiles: commitPlan.getTotalFileCount(),
            commitCount: commitPlan.getCommitCount(),
            estimatedTime: commitPlan.estimatedTime,
            warnings: commitPlan.warnings,
        };
    }

    private getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private getWebviewContent(): string {
        const scriptPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js');
        const stylesPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css');

        const scriptUri = this.webviewView!.webview.asWebviewUri(scriptPath);
        const stylesUri = this.webviewView!.webview.asWebviewUri(stylesPath);

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>GitCom Panel</title>
        <link href="${stylesUri}" rel="stylesheet" />
        <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/css/all.min.css"
            integrity="sha512-2SwdPD6INVrV/lHTZbO2nodKhrnDdJK9/kg2XD1r9uGqPo1cUbujc+IYdlYdEErWNu69gVcYgdxlmVmzTWnetw=="
            crossorigin="anonymous"
            referrerpolicy="no-referrer"
        />
    </head>
    <body>
        <div class="section">
            <div class="section-title accordion-header" onclick="toggleAccordion(this)">
                <span><i class="fa-solid fa-gear icon"></i> Settings</span>
            </div>
            <div class="accordion-body">
                <div class="setting">
                    <span class="setting-label">Commit Style:</span>
                    <select id="commitStyle">
                        <option value="conventional">Conventional</option>
                        <option value="semantic">Semantic</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>

                <div class="setting">
                    <span class="setting-label">Detail Level:</span>
                    <select id="detailLevel">
                        <option value="concise">Concise</option>
                        <option value="normal">Normal</option>
                        <option value="verbose">Verbose</option>
                    </select>
                </div>

                <div class="setting">
                    <span class="setting-label block">Max Length:</span>
                    <input type="number" id="maxLength" min="50" max="200" />
                </div>

                <div class="setting-row">
                    <span class="setting-label">Auto Stage:</span>
                    <input type="checkbox" id="autoStage" />
                </div>

                <div class="setting-row">
                    <span class="setting-label">Batch Commits:</span>
                    <input type="checkbox" id="batchCommits" />
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title accordion-header" onclick="toggleAccordion(this)">
                <span><i class="fa-solid fa-brain icon"></i> Intelligent Commits</span>
            </div>
            <div class="accordion-body">
                <div class="setting-row">
                    <span class="setting-label">Enable Intelligent Commits:</span>
                    <input type="checkbox" id="enableIntelligentCommits" />
                </div>

                <div class="setting">
                    <span class="setting-label block">Max Files Per Commit:</span>
                    <input type="number" id="maxFilesPerCommit" min="1" max="50" />
                </div>

                <div class="setting">
                    <span class="setting-label block">Grouping Strategy:</span>
                    <select id="groupingStrategy">
                        <option value="intelligent">Intelligent</option>
                        <option value="by-type">By Type</option>
                        <option value="by-directory">By Directory</option>
                        <option value="single-commit">Single Commit</option>
                    </select>
                </div>

                <div class="setting-row">
                    <span class="setting-label">Separate Test Commits:</span>
                    <input type="checkbox" id="separateTestCommits" />
                </div>

                <div class="setting-row">
                    <span class="setting-label">Enable Feature Detection:</span>
                    <input type="checkbox" id="enableFeatureDetection" />
                </div>

                <div class="setting-row">
                    <span class="setting-label">Detect Breaking Changes:</span>
                    <input type="checkbox" id="enableBreakingChangeDetection" />
                </div>

                <div class="setting-row">
                    <span class="setting-label">Prioritize Features:</span>
                    <input type="checkbox" id="prioritizeFeatures" />
                </div>

                <div class="setting">
                    <span class="setting-label block">Max Commit Message Length:</span>
                    <input type="number" id="maxCommitMessageLength" min="50" max="100" />
                </div>

                <div class="setting-row" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border)">
                    <button class="small-button" onclick="resetIntelligentCommitSettings()" style="width: 100%">
                        Reset Intelligent Commit Settings
                    </button>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title"><i class="fa-solid fa-robot icon"></i> AI Actions</div>
            <button class="primary-button" onclick="generateCommit()" id="generateButton">Generate AI Commit</button>

            <!-- Progress indicator -->
            <div id="analysisProgress" style="display: none">
                <div class="progress-container">
                    <div class="progress-header">
                        <span class="progress-phase" id="progressPhase">Analyzing</span>
                        <span class="progress-step" id="progressStep">Step 1 of 4</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <div class="progress-text" id="progressText">Analyzing...</div>
                    <div class="progress-details" id="progressDetails"></div>
                </div>
            </div>

            <!-- Error Display -->
            <div id="errorDisplay" style="display: none">
                <div class="error-container">
                    <div class="error-header">
                        <span class="error-icon">❌</span>
                        <span class="error-title" id="errorTitle">Error</span>
                        <button class="error-close" onclick="closeError()">×</button>
                    </div>
                    <div class="error-message" id="errorMessage"></div>
                    <div class="error-details" id="errorDetails" style="display: none"></div>
                    <div class="error-actions" id="errorActions"></div>
                </div>
            </div>

            <!-- Success Display -->
            <div id="successDisplay" style="display: none">
                <div class="success-container">
                    <div class="success-header">
                        <span class="success-icon">✅</span>
                        <span class="success-message" id="successMessage">Success</span>
                        <button class="success-close" onclick="closeSuccess()">×</button>
                    </div>
                    <div class="success-details" id="successDetails"></div>
                </div>
            </div>
        </div>

        <!-- Commit Plan Preview Section -->
        <div class="section" id="commitPlanSection" style="display: none">
            <div class="section-title">
                <i class="fa-solid fa-file-lines icon"></i> Commit Plan Preview
                <button class="small-button" onclick="cancelCommitPlan()" style="margin-left: auto">Cancel</button>
            </div>

            <div class="commit-plan-summary" id="commitPlanSummary">
                <!-- Summary will be populated by JavaScript -->
            </div>

            <div class="commit-groups" id="commitGroups">
                <!-- Commit groups will be populated by JavaScript -->
            </div>

            <div class="commit-plan-actions">
                <button class="primary-button" onclick="executeCommitPlan()" id="executeButton">Execute Commit Plan</button>
            </div>
        </div>

        <div class="section">
            <div class="section-title">
                <i class="fa-solid fa-clock-rotate-left icon"></i> Commit History <span id="unpushedBadge" class="status-badge unpushed" style="display: none">0 unpushed</span>
            </div>

            <button class="push-button" onclick="pushCommits()" id="pushButton" disabled>Push All Commits</button>

            <div id="commitHistory">
                <div class="empty-state">No commits generated yet. Use "Generate AI Commit" to get started.</div>
            </div>
        </div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
        <script
            src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/js/all.min.js"
            integrity="sha512-6BTOlkauINO65nLhXhthZMtepgJSghyimIalb+crKRPhvhmsCdnIuGcVbR5/aQY2A+260iC1OPy1oCdB6pSSwQ=="
            crossorigin="anonymous"
            referrerpolicy="no-referrer"
        ></script>
    </body>
</html>
`;
    }
}

export default GitComPanelProvider;
