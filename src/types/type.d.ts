// ========================================================
// Commit Types & Configurations
// ========================================================
type CommitTypes = Record<string, string>;
type CommitType = 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore';
type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

interface ConfigDefaults {
    commitStyle: 'conventional' | string;
    maxLength: number;
    autoStage: boolean;
    showAnalysis: boolean;
    customTemplate: string;
    commitTypes: CommitTypes;
}

interface CommitGeneratorConfig {
    style?: 'conventional' | 'semantic' | 'custom';
    maxLength?: number;
    [key: string]: any;
}

interface GitComConfig {
    enableCache?: boolean;
    maxConcurrency?: number;
    batchSize?: number;
    enableParallelProcessing?: boolean;
    orchestratorBatchSize?: number;
    enableSemanticAnalysis?: boolean;
    enablePatternLearning?: boolean;
    enableLearning?: boolean;
    conflictResolutionStrategy?: string;
    enableCustomTemplates?: boolean;
    enableDynamicTemplates?: boolean;
    defaultTemplate?: string;
    enableIntelligentCommits?: boolean;
}

interface CommitMessageTemplatesOptions {
    templatesFile?: string;
    enableCustomTemplates?: boolean;
    enableDynamicTemplates?: boolean;
    defaultTemplate?: string;
}

interface CommitOrchestratorOptions {
    batchSize?: number;
    enableBatching?: boolean;
    maxRetries?: number;
    retryDelay?: number;
}

interface CommitGrouperOptions {
    maxFilesPerCommit?: number;
    separateTestCommits?: boolean;
    separateDocCommits?: boolean;
    groupingStrategy?: 'intelligent' | 'simple' | 'directory';
    enableParallelProcessing?: boolean;
    maxConcurrency?: number;
    batchSize?: number;
    [key: string]: any;
}

interface MessageGeneratorConfig {
    maxLength?: number;
    includeScope?: boolean;
    includeBody?: boolean;
}

// ========================================================
// Git Changes & Analysis
// ========================================================
interface GitChange {
    file: string;
    status: 'added' | 'deleted' | 'modified' | 'renamed';
    diff: string;
    lines: { added: number; removed: number };
}

interface Change {
    file: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    diff: string;
}

interface CommitChangeAnalysis {
    primaryAction: string;
    hasBreakingChanges: boolean;
    fileTypes: string[];
    changeTypes: string[];
    scope: string | null;
    description: string;
}

interface ChangeInfo {
    status: string;
    file: string;
    lines: {
        added: number;
        removed: number;
    };
}

interface ChangePatternAnalysis {
    isRefactor: boolean;
    isFix: boolean;
    isFeature: boolean;
    hasNewFiles: boolean;
    hasOnlyModifications: boolean;
    hasDeletedFiles: boolean;
    smallChanges: boolean;
    changeRatio: number;
}

interface FixPatternAnalysis {
    score: number;
    patterns: string[];
}

// ========================================================
// Commit Files
// ========================================================
interface CommitFile {
    filePath: string;
    changeType: string;
    linesAdded?: number;
    linesRemoved?: number;
    detectedFeatures?: string[];
    fileCategory?: string;
    dependencies?: string[];
}

// ========================================================
// Commit Templates
// ========================================================
interface TemplateVariableConfig {
    required: boolean;
    type: string;
    format?: string;
}

interface Template {
    name: string;
    description: string;
    pattern: string;
    variables: Record<string, TemplateVariableConfig>;
    example: string;
    type?: string;
    createdAt?: number;
    generatedAt?: number;
    basedOnCommits?: number;
}

interface TemplateAnalysis {
    commonTypes: Map<string, number>;
    commonScopes: Map<string, number>;
    averageLength: number;
    commonPatterns: string[];
    breakingChangeFrequency: number;
}

interface TemplateListItem {
    name: string;
    type: string;
    description: string;
    example: string;
    createdAt?: number;
}

// ========================================================
// Feature & Semantic Analysis
// ========================================================
interface FeatureDetectorOptions {
    enableSemanticAnalysis?: boolean;
    enablePatternLearning?: boolean;
    confidenceThreshold?: number;
    maxFeatures?: number;
    [key: string]: any;
}

interface SemanticAnalysisResult {
    feature: string;
    confidence: number;
    context: string;
}

interface Feature {
    type: string;
    name: string;
    confidence: number;
    context?: string;
    source?: string;
    domain?: string;
    impact?: string;
    evidence?: string;
}

interface ContextPattern {
    count: number;
    confidence: number;
}

interface LearnedPattern {
    patterns: string[];
    confidence: number;
    context: string;
}

type ConsolidatedFeatures = {
    primaryFeatures: Feature[];
    secondaryFeatures: Feature[];
    technicalAspects: Feature[];
    businessAspects: Feature[];
    overallConfidence: number;
} | null;

interface FeatureAnalysis {
    semanticFeatures: Feature[];
    architecturalPatterns: Feature[];
    businessLogicFeatures: Feature[];
    technicalFeatures: Feature[];
    crossCuttingConcerns: Feature[];
    confidence: { [key: string]: number };
}

interface FeatureAnalysisResult {
    commonFeatures: [string, number][];
    meaningfulFeatures?: [string, number][];
    domainFeatures: string[];
    importedModules?: string[];
}

interface FeatureGroupResult {
    featureName: string;
    groupFiles: AnalyzedChange[];
}

interface ProcessFeatureGroupResult {
    groups: CommitGroup[];
}

// ========================================================
// Domain Knowledge
// ========================================================
interface DomainTerm {
    term: string;
    confidence: number;
    domain: string;
}

// ========================================================
// Repository & Rollback
// ========================================================
interface RepositoryState {
    head: string;
    status: Partial<StatusResult>;
    latestCommit: any;
    timestamp: string;
    captureError?: string;
}

interface SuccessfulCommitInfo {
    commitHash: string;
    group: CommitGroup;
    index: number;
}

interface RollbackResult {
    success: boolean;
    message?: string;
    commitsRolledBack?: number;
    strategy?: string;
    preRollbackState?: RepositoryState;
    rollbackDetails?: any;
    error?: string;
    rollbackError?: string;
    manualRollbackPlan?: any;
    commitsToRollback?: number;
    originalError?: string;
    partialRecoveryError?: string;
    recoveryError?: string;
    partiallyRolledBack?: SuccessfulCommitInfo[];
    failedRollbacks?: any[];
    requiresManualIntervention?: boolean;
}

// ========================================================
// Performance & Learning
// ========================================================
interface PerformanceStats {
    totalCommits: number;
    successfulCommits: number;
    failedCommits: number;
    totalStagingTime: number;
    totalCommitTime: number;
    filesStaged: number;
    retries: number;
}

interface GroupingPerformanceStats {
    groupingTime: number;
    featureDetectionTime: number;
    relationshipAnalysisTime: number;
    filesProcessed: number;
    averageGroupingTime?: string;
    featureDetectionPercentage?: string;
}

interface PerformanceStatsSummary {
    changeAnalyzer?: any;
    commitGrouper?: any;
    commitOrchestrator?: any;
    conflictResolver?: any;
    learningSystem?: any;
}

interface LearningStats {
    totalFeedback: number;
    learnedPatterns: number;
    userPreferences: number;
    averageSatisfaction: number | string;
    confidenceLevel: number | string;
}

interface LearningSystemOptions {
    enableLearning?: boolean;
    learningDataFile?: string;
    maxLearningEntries?: number;
    confidenceThreshold?: number;
    adaptationRate?: number;
}

// ========================================================
// Feedback & Patterns
// ========================================================
interface FeedbackEntry {
    timestamp: number;
    sessionId: string;
    originalGrouping: any;
    userModifications: any;
    satisfaction: number;
    context: any;
    fileTypes: string[];
    projectType: string;
}

interface GroupingPattern {
    pattern: any;
    strength: number;
    occurrences: number;
    context: any;
}

interface SeparationRule {
    fileTypeA: string;
    fileTypeB: string;
    shouldSeparate: boolean;
    reason: string;
    strength: number;
}

interface MessagePattern {
    pattern: any;
    strength: number;
    examples: Array<{ original: string; edited: string }>;
}

interface GroupingStrategy {
    preferFeatureGrouping: number;
    preferTypeGrouping: number;
    preferDirectoryGrouping: number;
    maxFilesPerCommit: number;
}

interface MessagePreferences {
    preferredFormats: any[];
    commonPatterns: any[];
    avoidedPatterns: any[];
}

interface AdaptationWeights {
    totalSatisfaction: number;
    feedbackCount: number;
    averageSatisfaction: number;
}

// ========================================================
// Commit History & Progress
// ========================================================
interface CommitHistoryItem {
    message: string;
    files: string[];
    timestamp: string;
    pushed: boolean;
    commitHash?: string | null;
}

interface AnalysisProgress {
    phase: string;
    message: string;
    progress: number;
    details?: any;
    timestamp?: string;
}

// ========================================================
// Validation, Errors & Success
// ========================================================
interface ValidationResult {
    isValid: boolean;
    error?: string;
}

interface ErrorAnalysis {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    recoverable: boolean;
    autoRecoverable: boolean;
    suggestedActions: string[];
    recoveryAction: string;
}

interface ErrorInfo {
    title: string;
    message: string;
    details?: any;
    suggestedActions?: string[];
    timestamp?: string;
}

interface SuccessInfo {
    message: string;
    details?: any;
    timestamp?: string;
}

type FailureMetadata = {
    errorDetails?: any;
    autoRecoveryAttempted?: any;
    autoRecoveryResult?: any;
    isRecoverable?: boolean;
    criticalFailure?: boolean;
    originalError?: string;
    recoveryError?: string;
    rollbackRecommended?: boolean;
    recoveryAction?: string;
};

// ========================================================
// Commit Analysis
// ========================================================
interface AnalysisSummary {
    totalFiles: number;
    changeTypes: Record<string, number>;
    fileCategories: Record<string, number>;
    totalLines: { added: number; removed: number };
    detectedFeatures: string[];
    complexity: 'low' | 'medium' | 'high';
}

interface AnalysisResult {
    totalFiles: number;
    complexity: string;
    scope?: string;
    changeTypes: Record<string, number>;
    fileTypes: Record<string, number>;
    totalLines: {
        added: number;
        removed: number;
    };
}

// ========================================================
//  Dialogs & UI Options
// ========================================================
interface CommitDialogResult {
    confirmed: boolean;
    message: string;
}

interface IntelligentCommitDialogResult {
    confirmed: boolean;
    commitPlan: CommitPlan;
    message?: string;
}

interface QuickPickOptions {
    title?: string;
    placeHolder?: string;
    canPickMany?: boolean;
}

interface InputBoxOptions {
    title?: string;
    prompt?: string;
    placeHolder?: string;
    value?: string;
    validateInput?: (value: string) => string | undefined;
}

// ========================================================
// Conflict Resolution
// ========================================================
interface SmartConflictResolverOptions {
    maxResolutionAttempts?: number;
    enableHeuristics?: boolean;
    prioritizeUserIntent?: boolean;
    conflictResolutionStrategy?: 'conservative' | 'aggressive' | 'balanced' | 'user_guided';
}

interface Conflict {
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    involvedGroups: string[];
    conflictedFile?: string;
    suggestedResolution: string;
}

// ========================================================
// Preprocessing
// ========================================================
interface PreprocessedData {
    changes: AnalyzedChange[];
    fileMap: Map<string, AnalyzedChange>;
    categoryMap: Map<string, AnalyzedChange[]>;
    featureMap: Map<string, AnalyzedChange[]>;
    directoryMap: Map<string, AnalyzedChange[]>;
}

// ========================================================
// AI
// ========================================================
interface AIFeatureDetect {
    features: string[];
    confidence: number;
}

// ========================================================
// Others
// ========================================================
interface RenamedFile {
    from: string;
    to: string;
}
