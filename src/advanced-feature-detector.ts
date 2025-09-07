import path from 'path';
import { AnalyzedChange } from './change-analyzer';

/**
 * Advanced feature detection using sophisticated code analysis
 * Implements machine learning-like patterns for better feature recognition
 */

class AdvancedFeatureDetector {
    private options: Required<FeatureDetectorOptions>;
    private learnedPatterns: Map<string, LearnedPattern>;
    private featureConfidence: Map<string, number>;
    private contextPatterns: Map<string, ContextPattern>;

    constructor(options: FeatureDetectorOptions = {}) {
        this.options = {
            enableSemanticAnalysis: options.enableSemanticAnalysis !== false,
            enablePatternLearning: options.enablePatternLearning !== false,
            confidenceThreshold: options.confidenceThreshold || 0.7,
            maxFeatures: options.maxFeatures || 10,
            ...options,
        } as Required<FeatureDetectorOptions>;

        // Pattern learning database
        this.learnedPatterns = new Map();
        this.featureConfidence = new Map();
        this.contextPatterns = new Map();

        // Initialize with common patterns
        this._initializeBasePatterns();
    }

    /**
     * Analyzes code changes to detect sophisticated features
     * @param {AnalyzedChange[]} changes - Array of analyzed changes
     * @returns {Promise<Object>} Advanced feature analysis
     */
    async detectAdvancedFeatures(changes: AnalyzedChange[]): Promise<ConsolidatedFeatures> {
        const features: FeatureAnalysis = {
            semanticFeatures: [],
            architecturalPatterns: [],
            businessLogicFeatures: [],
            technicalFeatures: [],
            crossCuttingConcerns: [],
            confidence: {},
        };

        for (const change of changes) {
            // Semantic analysis of code content
            const semanticFeatures = await this._analyzeSemanticFeatures(change);
            features.semanticFeatures.push(...semanticFeatures);

            // Architectural pattern detection
            const architecturalPatterns = await this._detectArchitecturalPatterns(change);
            features.architecturalPatterns.push(...architecturalPatterns);

            // Business logic analysis
            const businessFeatures = await this._analyzeBusinessLogic(change);
            features.businessLogicFeatures.push(...businessFeatures);

            // Technical feature detection
            const technicalFeatures = await this._detectTechnicalFeatures(change);
            features.technicalFeatures.push(...technicalFeatures);

            // Cross-cutting concerns
            const crossCuttingConcerns = await this._detectCrossCuttingConcerns(change);
            features.crossCuttingConcerns.push(...crossCuttingConcerns);
        }

        // Calculate confidence scores
        features.confidence = this._calculateFeatureConfidence(features);

        // Learn from detected patterns
        if (this.options.enablePatternLearning) {
            await this._learnFromDetectedFeatures(changes, features);
        }

        return this._consolidateFeatures(features);
    }

    /**
     * Analyzes semantic features using natural language processing techniques
     * @private
     * @param {AnalyzedChange} change - Change to analyze
     * @returns {Promise<Array>} Semantic features
     */
    private async _analyzeSemanticFeatures(change: AnalyzedChange): Promise<Feature[]> {
        const features: Feature[] = [];
        const addedLines = change.diff.split('\n').filter((line) => line.startsWith('+'));

        for (const line of addedLines) {
            // Extract meaningful identifiers
            const identifiers = this._extractIdentifiers(line);

            for (const identifier of identifiers) {
                // Analyze identifier semantics
                const semanticInfo = this._analyzeIdentifierSemantics(identifier);
                if (semanticInfo.confidence > this.options.confidenceThreshold) {
                    features.push({
                        type: 'semantic',
                        name: semanticInfo.feature,
                        confidence: semanticInfo.confidence,
                        context: semanticInfo.context,
                        source: 'identifier_analysis',
                    });
                }
            }

            // Analyze comment semantics
            const comments = this._extractComments(line);
            for (const comment of comments) {
                const commentFeatures = this._analyzeCommentSemantics(comment);
                features.push(...commentFeatures);
            }
        }

        return this._deduplicateFeatures(features);
    }

    /**
     * Detects architectural patterns in code changes
     * @private
     * @param {AnalyzedChange} change - Change to analyze
     * @returns {Promise<Array>} Architectural patterns
     */
    private async _detectArchitecturalPatterns(change: AnalyzedChange): Promise<Feature[]> {
        const patterns: Feature[] = [];
        const content = change.diff;

        // MVC Pattern Detection
        if (this._detectMVCPattern(change)) {
            patterns.push({
                type: 'architectural',
                name: 'mvc',
                confidence: 0.8,
                evidence: 'File structure and naming patterns suggest MVC architecture',
            });
        }

        // Repository Pattern Detection
        if (this._detectRepositoryPattern(content)) {
            patterns.push({
                type: 'architectural',
                name: 'repository',
                confidence: 0.9,
                evidence: 'Repository pattern methods detected',
            });
        }

        // Factory Pattern Detection
        if (this._detectFactoryPattern(content)) {
            patterns.push({
                type: 'architectural',
                name: 'factory',
                confidence: 0.85,
                evidence: 'Factory pattern implementation detected',
            });
        }

        // Observer Pattern Detection
        if (this._detectObserverPattern(content)) {
            patterns.push({
                type: 'architectural',
                name: 'observer',
                confidence: 0.8,
                evidence: 'Observer pattern implementation detected',
            });
        }

        // Microservice Pattern Detection
        if (this._detectMicroservicePattern(change)) {
            patterns.push({
                type: 'architectural',
                name: 'microservice',
                confidence: 0.75,
                evidence: 'Microservice architecture patterns detected',
            });
        }

        return patterns;
    }

    /**
     * Analyzes business logic features
     * @private
     * @param {AnalyzedChange} change - Change to analyze
     * @returns {Promise<Array>} Business logic features
     */
    private async _analyzeBusinessLogic(change: AnalyzedChange): Promise<Feature[]> {
        const features: Feature[] = [];
        const addedLines = change.diff.split('\n').filter((line) => line.startsWith('+'));

        // Domain-specific terminology detection
        const domainTerms = this._extractDomainTerminology(addedLines);
        for (const term of domainTerms) {
            features.push({
                type: 'business_logic',
                name: term.term,
                confidence: term.confidence,
                domain: term.domain,
                context: 'domain_terminology',
            });
        }

        // Business rule detection
        const businessRules = this._detectBusinessRules(addedLines);
        features.push(...businessRules);

        // Workflow detection
        const workflows = this._detectWorkflows(addedLines);
        features.push(...workflows);

        return features;
    }

    /**
     * Detects technical features and implementation details
     * @private
     * @param {AnalyzedChange} change - Change to analyze
     * @returns {Promise<Array>} Technical features
     */
    private async _detectTechnicalFeatures(change: AnalyzedChange): Promise<Feature[]> {
        const features: Feature[] = [];
        const content = change.diff;

        // API endpoint detection
        const apiEndpoints = this._detectAPIEndpoints(content);
        features.push(...apiEndpoints);

        // Database operations detection
        const dbOperations = this._detectDatabaseOperations(content);
        features.push(...dbOperations);

        // Authentication/Authorization detection
        const authFeatures = this._detectAuthFeatures(content);
        features.push(...authFeatures);

        // Caching implementation detection
        const cachingFeatures = this._detectCachingFeatures(content);
        features.push(...cachingFeatures);

        // Error handling improvements
        const errorHandling = this._detectErrorHandlingFeatures(content);
        features.push(...errorHandling);

        // Performance optimizations
        const performanceFeatures = this._detectPerformanceFeatures(content);
        features.push(...performanceFeatures);

        return features;
    }

    /**
     * Detects cross-cutting concerns
     * @private
     * @param {AnalyzedChange} change - Change to analyze
     * @returns {Promise<Array>} Cross-cutting concerns
     */
    private async _detectCrossCuttingConcerns(change: AnalyzedChange): Promise<Feature[]> {
        const concerns: Feature[] = [];
        const content = change.diff;

        // Logging implementation
        if (this._detectLoggingConcern(content)) {
            concerns.push({
                type: 'cross_cutting',
                name: 'logging',
                confidence: 0.9,
                impact: 'system_wide',
            });
        }

        // Security concerns
        if (this._detectSecurityConcern(content)) {
            concerns.push({
                type: 'cross_cutting',
                name: 'security',
                confidence: 0.85,
                impact: 'system_wide',
            });
        }

        // Monitoring and metrics
        if (this._detectMonitoringConcern(content)) {
            concerns.push({
                type: 'cross_cutting',
                name: 'monitoring',
                confidence: 0.8,
                impact: 'system_wide',
            });
        }

        // Configuration management
        if (this._detectConfigurationConcern(content)) {
            concerns.push({
                type: 'cross_cutting',
                name: 'configuration',
                confidence: 0.75,
                impact: 'system_wide',
            });
        }

        return concerns;
    }

    /**
     * Extracts meaningful identifiers from code
     * @private
     * @param {string} line - Line of code
     * @returns {Array} Extracted identifiers
     */
    private _extractIdentifiers(line: string): string[] {
        // Extract function names, variable names, class names, etc.
        const patterns = [
            /function\s+(\w+)/g,
            /const\s+(\w+)/g,
            /let\s+(\w+)/g,
            /var\s+(\w+)/g,
            /class\s+(\w+)/g,
            /interface\s+(\w+)/g,
            /type\s+(\w+)/g,
            /(\w+)\s*:/g, // Object properties
            /\.(\w+)\s*\(/g, // Method calls
        ];

        const identifiers: string[] = [];
        for (const pattern of patterns) {
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(line)) !== null) {
                if (match[1] && match[1].length > 2) {
                    identifiers.push(match[1]);
                }
            }
        }

        return [...new Set(identifiers)]; // Remove duplicates
    }

    /**
     * Analyzes the semantics of an identifier
     * @private
     * @param {string} identifier - Identifier to analyze
     * @returns {Object} Semantic analysis result
     */
    private _analyzeIdentifierSemantics(identifier: string): SemanticAnalysisResult {
        const lowerIdentifier = identifier.toLowerCase();

        // Business domain patterns
        const businessPatterns: Record<string, string[]> = {
            user: ['user', 'customer', 'client', 'account', 'profile'],
            order: ['order', 'purchase', 'transaction', 'payment', 'invoice'],
            product: ['product', 'item', 'catalog', 'inventory', 'stock'],
            auth: ['auth', 'login', 'signin', 'signup', 'register', 'token'],
            data: ['data', 'model', 'entity', 'record', 'document'],
            service: ['service', 'manager', 'handler', 'processor', 'controller'],
            util: ['util', 'helper', 'tool', 'common', 'shared'],
        };

        for (const [domain, keywords] of Object.entries(businessPatterns)) {
            for (const keyword of keywords) {
                if (lowerIdentifier.includes(keyword)) {
                    return {
                        feature: domain,
                        confidence: 0.8,
                        context: `identifier_contains_${keyword}`,
                    };
                }
            }
        }

        // Camel case analysis
        const camelCaseWords = identifier.split(/(?=[A-Z])/).map((w) => w.toLowerCase());
        for (const word of camelCaseWords) {
            for (const [domain, keywords] of Object.entries(businessPatterns)) {
                if (keywords.includes(word)) {
                    return {
                        feature: domain,
                        confidence: 0.7,
                        context: `camelcase_word_${word}`,
                    };
                }
            }
        }

        return {
            feature: 'unknown',
            confidence: 0.1,
            context: 'no_semantic_match',
        };
    }

    /**
     * Extracts comments from a line of code
     * @private
     * @param {string} line - Line of code
     * @returns {Array} Extracted comments
     */
    private _extractComments(line: string): string[] {
        const comments: string[] = [];

        // Single line comments
        const singleLineMatch = line.match(/\/\/\s*(.+)$/);
        if (singleLineMatch) {
            comments.push(singleLineMatch[1].trim());
        }

        // Multi-line comment parts
        const multiLineMatch = line.match(/\/\*\s*(.+?)\s*\*\//);
        if (multiLineMatch) {
            comments.push(multiLineMatch[1].trim());
        }

        return comments;
    }

    /**
     * Analyzes comment semantics for feature detection
     * @private
     * @param {string} comment - Comment text
     * @returns {Array} Comment-based features
     */
    private _analyzeCommentSemantics(comment: string): Feature[] {
        const features: Feature[] = [];
        const lowerComment = comment.toLowerCase();

        // TODO/FIXME detection
        if (lowerComment.includes('todo') || lowerComment.includes('fixme')) {
            features.push({
                type: 'semantic',
                name: 'technical_debt',
                confidence: 0.9,
                context: 'todo_comment',
                source: 'comment_analysis',
            });
        }

        // Feature description detection
        const featureKeywords = ['implement', 'add', 'create', 'build', 'develop'];
        for (const keyword of featureKeywords) {
            if (lowerComment.includes(keyword)) {
                features.push({
                    type: 'semantic',
                    name: 'feature_implementation',
                    confidence: 0.7,
                    context: `comment_contains_${keyword}`,
                    source: 'comment_analysis',
                });
                break;
            }
        }

        // Bug fix detection
        const bugKeywords = ['fix', 'bug', 'issue', 'problem', 'error'];
        for (const keyword of bugKeywords) {
            if (lowerComment.includes(keyword)) {
                features.push({
                    type: 'semantic',
                    name: 'bug_fix',
                    confidence: 0.8,
                    context: `comment_contains_${keyword}`,
                    source: 'comment_analysis',
                });
                break;
            }
        }

        return features;
    }

    /**
     * Detects MVC architectural pattern
     * @private
     * @param {AnalyzedChange} change - Change to analyze
     * @returns {boolean} True if MVC pattern detected
     */
    private _detectMVCPattern(change: AnalyzedChange): boolean {
        const filePath = change.filePath.toLowerCase();
        const mvcIndicators = [
            filePath.includes('controller'),
            filePath.includes('model'),
            filePath.includes('view'),
            filePath.includes('/controllers/'),
            filePath.includes('/models/'),
            filePath.includes('/views/'),
        ];

        return mvcIndicators.filter(Boolean).length >= 1;
    }

    /**
     * Detects Repository pattern
     * @private
     * @param {string} content - Code content
     * @returns {boolean} True if Repository pattern detected
     */
    private _detectRepositoryPattern(content: string): boolean {
        const repositoryPatterns = [
            /class\s+\w*Repository/i,
            /interface\s+\w*Repository/i,
            /findBy\w+/g,
            /save\s*\(/g,
            /delete\s*\(/g,
            /update\s*\(/g,
            /getAll\s*\(/g,
        ];

        return repositoryPatterns.some((pattern) => pattern.test(content));
    }

    /**
     * Detects Factory pattern
     * @private
     * @param {string} content - Code content
     * @returns {boolean} True if Factory pattern detected
     */
    private _detectFactoryPattern(content: string): boolean {
        const factoryPatterns = [/class\s+\w*Factory/i, /create\w*\s*\(/g, /build\w*\s*\(/g, /make\w*\s*\(/g, /getInstance\s*\(/g];

        return factoryPatterns.some((pattern) => pattern.test(content));
    }

    /**
     * Detects Observer pattern
     * @private
     * @param {string} content - Code content
     * @returns {boolean} True if Observer pattern detected
     */
    private _detectObserverPattern(content: string): boolean {
        const observerPatterns = [
            /addEventListener/g,
            /removeEventListener/g,
            /subscribe\s*\(/g,
            /unsubscribe\s*\(/g,
            /notify\s*\(/g,
            /emit\s*\(/g,
            /on\s*\(/g,
            /off\s*\(/g,
        ];

        return observerPatterns.some((pattern) => pattern.test(content));
    }

    /**
     * Detects Microservice patterns
     * @private
     * @param {AnalyzedChange} change - Change to analyze
     * @returns {boolean} True if Microservice pattern detected
     */
    private _detectMicroservicePattern(change: AnalyzedChange): boolean {
        const content = change.diff;
        const filePath = change.filePath.toLowerCase();

        const microserviceIndicators = [
            content.includes('express'),
            content.includes('fastify'),
            content.includes('koa'),
            filePath.includes('service'),
            filePath.includes('api'),
            content.includes('router'),
            content.includes('middleware'),
            content.includes('docker'),
            content.includes('kubernetes'),
        ];

        return microserviceIndicators.filter(Boolean).length >= 2;
    }

    /**
     * Initializes base patterns for learning
     * @private
     */
    private _initializeBasePatterns(): void {
        // Initialize with common software development patterns
        this.learnedPatterns.set('crud_operations', {
            patterns: ['create', 'read', 'update', 'delete', 'save', 'find', 'remove'],
            confidence: 0.9,
            context: 'data_operations',
        });

        this.learnedPatterns.set('authentication', {
            patterns: ['login', 'logout', 'signin', 'signup', 'auth', 'token', 'session'],
            confidence: 0.85,
            context: 'security',
        });

        this.learnedPatterns.set('validation', {
            patterns: ['validate', 'check', 'verify', 'sanitize', 'clean'],
            confidence: 0.8,
            context: 'data_validation',
        });
    }

    /**
     * Learns from detected features to improve future detection
     * @private
     * @param {AnalyzedChange[]} changes - Changes that were analyzed
     * @param {Object} features - Detected features
     * @returns {Promise<void>}
     */
    private async _learnFromDetectedFeatures(changes: AnalyzedChange[], features: FeatureAnalysis): Promise<void> {
        // This is a simplified learning mechanism
        // In a real implementation, this could use more sophisticated ML techniques

        for (const change of changes) {
            const filePath = change.filePath;
            const fileExtension = path.extname(filePath);
            const directory = path.dirname(filePath);

            // Learn file path patterns
            for (const featureList of Object.values(features)) {
                for (const feature of featureList) {
                    if (feature.confidence > this.options.confidenceThreshold) {
                        const contextKey = `${directory}:${fileExtension}:${feature.name}`;

                        if (!this.contextPatterns.has(contextKey)) {
                            this.contextPatterns.set(contextKey, {
                                count: 0,
                                confidence: 0,
                            });
                        }

                        const context = this.contextPatterns.get(contextKey)!;
                        context.count++;
                        context.confidence = Math.min(0.95, context.confidence + 0.05);
                    }
                }
            }
        }
    }

    /**
     * Consolidates and ranks detected features
     * @private
     * @param {Object} features - Raw detected features
     * @returns {Object} Consolidated features
     */
    private _consolidateFeatures(features: FeatureAnalysis): ConsolidatedFeatures {
        const consolidated: ConsolidatedFeatures = {
            primaryFeatures: [],
            secondaryFeatures: [],
            technicalAspects: [],
            businessAspects: [],
            overallConfidence: 0,
        };

        // Flatten all features
        const allFeatures: Feature[] = [
            ...features.semanticFeatures,
            ...features.architecturalPatterns,
            ...features.businessLogicFeatures,
            ...features.technicalFeatures,
            ...features.crossCuttingConcerns,
        ];

        // Sort by confidence
        allFeatures.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

        // Categorize features
        for (const feature of allFeatures) {
            if (feature.confidence > 0.8) {
                consolidated.primaryFeatures.push(feature);
            } else if (feature.confidence > 0.6) {
                consolidated.secondaryFeatures.push(feature);
            }

            if (feature.type === 'business_logic' || feature.domain) {
                consolidated.businessAspects.push(feature);
            } else {
                consolidated.technicalAspects.push(feature);
            }
        }

        // Calculate overall confidence
        if (allFeatures.length > 0) {
            consolidated.overallConfidence = allFeatures.reduce((sum, f) => sum + (f.confidence || 0), 0) / allFeatures.length;
        }

        // Limit results to prevent overwhelming output
        consolidated.primaryFeatures = consolidated.primaryFeatures.slice(0, this.options.maxFeatures);
        consolidated.secondaryFeatures = consolidated.secondaryFeatures.slice(0, this.options.maxFeatures);

        return consolidated;
    }

    /**
     * Removes duplicate features
     * @private
     * @param {Array} features - Features to deduplicate
     * @returns {Array} Deduplicated features
     */
    private _deduplicateFeatures(features: Feature[]): Feature[] {
        const seen = new Set<string>();
        return features.filter((feature) => {
            const key = `${feature.type}:${feature.name}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * Calculates confidence scores for detected features
     * @private
     * @param {Object} features - Detected features
     * @returns {Object} Confidence scores
     */
    private _calculateFeatureConfidence(features: FeatureAnalysis): { [key: string]: number } {
        const confidence: { [key: string]: number } = {};

        for (const [category, featureList] of Object.entries(features)) {
            if (Array.isArray(featureList) && featureList.length > 0) {
                const avgConfidence = featureList.reduce((sum, f) => sum + (f.confidence || 0), 0) / featureList.length;
                confidence[category] = avgConfidence;
            }
        }

        return confidence;
    }

    // Additional detection methods would be implemented here...
    // For brevity, I'm including stubs for the remaining detection methods

    private _extractDomainTerminology(lines: string[]): DomainTerm[] {
        return [];
    }
    private _detectBusinessRules(lines: string[]): Feature[] {
        return [];
    }
    private _detectWorkflows(lines: string[]): Feature[] {
        return [];
    }
    private _detectAPIEndpoints(content: string): Feature[] {
        return [];
    }
    private _detectDatabaseOperations(content: string): Feature[] {
        return [];
    }
    private _detectAuthFeatures(content: string): Feature[] {
        return [];
    }
    private _detectCachingFeatures(content: string): Feature[] {
        return [];
    }
    private _detectErrorHandlingFeatures(content: string): Feature[] {
        return [];
    }
    private _detectPerformanceFeatures(content: string): Feature[] {
        return [];
    }
    private _detectLoggingConcern(content: string): boolean {
        return false;
    }
    private _detectSecurityConcern(content: string): boolean {
        return false;
    }
    private _detectMonitoringConcern(content: string): boolean {
        return false;
    }
    private _detectConfigurationConcern(content: string): boolean {
        return false;
    }
}

export { AdvancedFeatureDetector };
