import * as vscode from 'vscode';
import { CommitPlan, CommitGroup, CommitResult, ChangeAnalysis } from './models';
import { AnalyzedChange } from '../change-analyzer';

// ==============================
// CORE COMMIT & RESOLUTION TYPES
// ==============================

export interface Resolution {
    success: boolean;
    error?: string;
    modifiedGroups: CommitGroup[];
    action?: string;
    details?: string;
    warning?: string;
}

export interface ConflictResolutionResult {
    success: boolean;
    resolvedGroups: CommitGroup[];
    warnings: string[];
}

export interface ResolutionResult {
    success: boolean;
    resolvedGroups: CommitGroup[];
    conflicts: Conflict[];
    resolutions: Resolution[];
    warnings: string[];
}

export interface ResolutionHistory {
    timestamp: number;
    conflicts: Conflict[];
    strategy: string;
    success: boolean;
    resolutions: Resolution[];
    context: any;
}

// ==============================
// PROGRESS & ANALYSIS TYPES
// ==============================

export interface AnalysisProgress {
    phase: string;
    message: string;
    progress: number;
    details?: {
        step?: number;
        totalSteps?: number;
        currentAction?: string;
        filesAnalyzed?: number;
        groupsCreated?: number;
        currentCommit?: number;
        totalCommits?: number;
        summary?: {
            commits?: number;
            files?: number;
            warnings?: number;
        };
    };
    timestamp?: string;
}

// ==============================
// CONFIGURATION & SETTINGS TYPES
// ==============================

export interface GitComSettings {
    commitStyle: 'conventional' | 'semantic' | 'custom';
    detailLevel: 'concise' | 'normal' | 'verbose';
    maxLength: number;
    autoStage: boolean;
    batchCommits: boolean;
    enableIntelligentCommits: boolean;
    maxFilesPerCommit: number;
    groupingStrategy: 'intelligent' | 'by-type' | 'by-directory' | 'single-commit';
    separateTestCommits: boolean;
    enableFeatureDetection: boolean;
    enableBreakingChangeDetection: boolean;
    prioritizeFeatures: boolean;
    maxCommitMessageLength: number;
}

// ==============================
// HISTORY & TRACKING TYPES
// ==============================

export interface CommitHistoryItem {
    message: string;
    files: string[];
    timestamp: string;
    pushed: boolean;
    commitHash?: string;
}

// ==============================
// UI & MESSAGING TYPES
// ==============================

export interface WebviewMessage {
    command: string;
    [key: string]: any;
}

export interface ErrorInfo {
    title: string;
    message: string;
    details?: any;
    suggestedActions: string[];
    timestamp: string;
}

export interface SuccessInfo {
    message: string;
    details?: any;
    timestamp: string;
}

// ==============================
// VALIDATION & RESULT TYPES
// ==============================

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

// ==============================
// PERFORMANCE & STATISTICS TYPES
// ==============================

export interface PerformanceStats {
    cacheHitRate?: string;
    filesProcessed?: number;
    averageProcessingTime?: string;
    averageGroupingTime?: string;
    successRate?: string;
    totalCommits?: number;
    averageCommitTime?: string;
    totalAttempts?: number;
    mostCommonConflict?: string;
}

export interface LearningStats {
    totalFeedback: number;
    learnedPatterns: number;
    userPreferences: number;
    averageSatisfaction: string;
    confidenceLevel: string;
}

// ==============================
// FEATURE DETECTION TYPES
// ==============================

export interface AdvancedFeature {
    name: string;
    confidence: number;
    description?: string;
}

export interface AdvancedFeatures {
    primaryFeatures: AdvancedFeature[];
    secondaryFeatures: AdvancedFeature[];
    patterns: string[];
}

// ==============================
// TEMPLATE TYPES
// ==============================

export interface Template {
    name: string;
    type: string;
    description: string;
    pattern: string;
}

// ==============================
// EXTENSION CONTEXT TYPES
// ==============================

export interface GitComExtensionContext extends vscode.ExtensionContext {
    // Add any additional context properties if needed
}

// ==============================
// COMPONENT INTERFACES
// ==============================

export interface IChangeAnalyzer {
    analyzeUnstagedChanges(): Promise<ChangeAnalysis[]>;
    getPerformanceStats(): PerformanceStats;
}

export interface ICommitGrouper {
    groupChanges(changes: ChangeAnalysis[]): Promise<CommitPlan>;
    getPerformanceStats(): PerformanceStats;
}

export interface IMessageGenerator {
    generateCommitMessage(group: CommitGroup): Promise<string>;
}

export interface ICommitOrchestrator {
    executeCommitPlan(plan: CommitPlan): Promise<CommitResult[]>;
    stageFiles(filePaths: string[]): Promise<void>;
    createCommit(message: string): Promise<CommitResult>;
    handleCommitFailure(error: Error, context: any): Promise<CommitResult>;
    getPerformanceStats(): PerformanceStats;
}

export interface IAdvancedFeatureDetector {
    detectAdvancedFeatures(changes: ChangeAnalysis[]): Promise<AdvancedFeatures>;
}

export interface ILearningSystem {
    adaptGrouping(groups: CommitGroup[], context: any): Promise<CommitGroup[]>;
    getLearningStats(): LearningStats;
}

export interface ISmartConflictResolver {
    resolveConflicts(groups: CommitGroup[]): Promise<ConflictResolutionResult>;
    getResolutionStats(): PerformanceStats;
}

export interface ICommitMessageTemplates {
    generateMessage(group: CommitGroup, templateName: string, context?: any): Promise<string>;
    listTemplates(): Template[];
    getUsageStats(): Record<string, number>;
}

// ==============================
// UI INTERFACES
// ==============================

export interface IUI {
    showError(message: string): void;
    showSuccess(message: string): void;
    showWarning(message: string): void;
    showProgress(message: string): void;
    updateProgress(message: string): void;
    hideProgress(): void;
    showIntelligentCommitDialog(plan: CommitPlan): Promise<IntelligentCommitDialogResult>;
    showCommitDialog(message: string, changes: AnalyzedChange[]): Promise<CommitDialogResult>;
    showQuickPick?(items: any[], options?: any): Promise<any>;
    showInputBox?(options?: any): Promise<string>;
    showAnalysis(analysis: any): void;
}

// ==============================
// DIALOG RESULT TYPES
// ==============================

export interface IntelligentCommitDialogResult {
    confirmed: boolean;
    commitPlan: CommitPlan;
    message?: string;
}

export interface CommitDialogResult {
    confirmed: boolean;
    message: string;
}

// ==============================
// RE-EXPORT TYPES
// ==============================

export { CommitPlan, CommitGroup, CommitResult, ChangeAnalysis };
