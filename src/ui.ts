import { AnalyzedChange } from './change-analyzer';
import { ChangeAnalysis, CommitGroup, CommitPlan } from './types';

class UI {
    private progressVisible: boolean;

    constructor() {
        this.progressVisible = false;
    }

    showProgress(message: string): void {
        this.progressVisible = true;
        console.log(`[Gitcom] ${message}`);
        // In a real Kiro extension, this would show a progress indicator
    }

    updateProgress(message: string): void {
        if (this.progressVisible) {
            console.log(`[Gitcom] ${message}`);
        }
    }

    hideProgress(): void {
        this.progressVisible = false;
    }

    showSuccess(message: string): void {
        console.log(`[Gitcom Success] ${message}`);
        // In Kiro, this would show a success notification
    }

    showWarning(message: string): void {
        console.warn(`[Gitcom Warning] ${message}`);
        // In Kiro, this would show a warning notification
    }

    showError(message: string): void {
        console.error(`[Gitcom Error] ${message}`);
        // In Kiro, this would show an error notification
    }

    async showCommitDialog(suggestedMessage: string, changes: AnalyzedChange[]): Promise<CommitDialogResult> {
        // This would show a dialog in Kiro with:
        // - Suggested commit message (editable)
        // - List of changed files
        // - Commit/Cancel buttons

        console.log('=== Gitcom Commit Dialog ===');
        console.log('Suggested commit message:', suggestedMessage);
        console.log('Changed files:');
        changes.forEach((change) => {
            console.log(`  ${change.changeType}: ${change.filePath} (+${change.linesAdded}/-${change.linesRemoved})`);
        });

        // For demo purposes, return confirmed with the suggested message
        return {
            confirmed: true,
            message: suggestedMessage,
        };
    }

    showAnalysis(analysis: ChangeAnalysis): void {
        // before change analysis
        console.log('=== Git Changes Analysis ===');
        console.log(`Total files: ${analysis.totalFiles}`);
        console.log(`Complexity: ${analysis.complexity}`);
        // console.log(`Scope: ${analysis.scope || 'none detected'}`);
        console.log('Change types:', analysis.changeTypes);
        // console.log('File types:', analysis.fileTypes);
        console.log(`Lines: +${analysis.totalLines.added}/-${analysis.totalLines.removed}`);
    }

    async showQuickPick(items: string[], options: QuickPickOptions = {}): Promise<string> {
        // This would show Kiro's quick pick interface
        console.log('Quick pick options:', items);
        return items[0]; // Return first item for demo
    }

    async showInputBox(options: InputBoxOptions = {}): Promise<string> {
        // This would show Kiro's input box
        console.log('Input prompt:', options.prompt);
        return options.value || ''; // Return default value for demo
    }

    async showIntelligentCommitDialog(commitPlan: CommitPlan): Promise<IntelligentCommitDialogResult> {
        // This would show a dialog in Kiro with:
        // - List of commit groups with their messages
        // - Preview of files in each group
        // - Edit/Confirm/Cancel buttons

        console.log('=== Intelligent Commit Dialog ===');
        console.log(`Total commit groups: ${commitPlan.groups.length}`);
        console.log(`Total files: ${commitPlan.totalFiles}`);
        console.log(`Estimated time: ${commitPlan.estimatedTime}ms`);

        if (commitPlan.warnings && commitPlan.warnings.length > 0) {
            console.log('Warnings:', commitPlan.warnings);
        }

        console.log('\nCommit Groups:');
        commitPlan.groups.forEach((group, index) => {
            console.log(`\n${index + 1}. ${group.type}${group.scope ? `(${group.scope})` : ''}`);
            console.log(`   Message: ${group.message}`);
            console.log(`   Files (${group.files.length}):`);
            group.files.forEach((file) => {
                console.log(`     ${file.changeType}: ${file.filePath} (+${file.linesAdded}/-${file.linesRemoved})`);
            });
        });

        // For demo purposes, return confirmed
        return {
            confirmed: true,
            commitPlan: commitPlan,
        };
    }
}

export { UI };
