import OpenAI from 'openai';
import { kmeans } from 'ml-kmeans';
import * as natural from 'natural';
import * as crypto from 'crypto';
import { AnalyzedChange } from './change-analyzer';
import { CommitGroup, CommitPlan } from './types';
import { CommitGrouper } from './commit-grouper';

interface AIClusteringOptions {
    enabled: boolean;
    apiKey?: string;
    model?: string;
    embeddingModel?: string;
    minClusterSize?: number;
    maxClusters?: number;
    similarityThreshold?: number;
    useSemanticAnalysis?: boolean;
    useCodeStructureAnalysis?: boolean;
}

interface EmbeddingCache {
    [key: string]: number[];
}

interface ClusterAnalysis {
    clusters: Cluster[];
    centroids: number[][];
    silhouetteScore?: number;
}

interface Cluster {
    id: string;
    files: AnalyzedChange[];
    centroid: number[];
    features: string[];
    description: string;
    cohesionScore: number;
}

class AIClusteringCommitGrouper extends CommitGrouper {
    private openai: OpenAI | null = null;
    private aiOptions: AIClusteringOptions;
    private embeddingCache: EmbeddingCache;
    private tokenizer: natural.WordTokenizer;

    constructor(options: CommitGrouperOptions & { aiOptions?: Partial<AIClusteringOptions> } = {}) {
        super(options);

        this.aiOptions = {
            enabled: options.aiOptions?.enabled ?? true,
            apiKey: options.aiOptions?.apiKey || process.env.OPENAI_API_KEY,
            model: options.aiOptions?.model || 'gpt-4.1-mini',
            embeddingModel: options.aiOptions?.embeddingModel || 'text-embedding-ada-002',
            minClusterSize: options.aiOptions?.minClusterSize || 2,
            maxClusters: options.aiOptions?.maxClusters || 10,
            similarityThreshold: options.aiOptions?.similarityThreshold || 0.7,
            useSemanticAnalysis: options.aiOptions?.useSemanticAnalysis ?? true,
            useCodeStructureAnalysis: options.aiOptions?.useCodeStructureAnalysis ?? true,
        };

        this.embeddingCache = {};
        this.tokenizer = new natural.WordTokenizer();

        if (this.aiOptions.enabled && this.aiOptions.apiKey) {
            this.openai = new OpenAI({ apiKey: this.aiOptions.apiKey });
        }
    }

    /**
     * Enhanced grouping with AI clustering
     */
    async groupChanges(analyzedChanges: AnalyzedChange[]): Promise<CommitPlan> {
        const startTime = Date.now();

        if (!analyzedChanges || analyzedChanges.length === 0) {
            return new CommitPlan({
                groups: [],
                totalFiles: 0,
                estimatedTime: 0,
                warnings: ['No changes to commit'],
            });
        }

        // Use AI clustering for better grouping
        if (this.aiOptions.enabled && this.openai && analyzedChanges.length >= this.aiOptions.minClusterSize!) {
            try {
                const clusters = await this._clusterChangesWithAI(analyzedChanges);
                const commitGroups = await this._createCommitGroupsFromClusters(clusters);
                const orderedGroups = await this.orderCommitGroups(commitGroups);

                const commitPlan = new CommitPlan({
                    groups: orderedGroups,
                    totalFiles: analyzedChanges.length,
                    estimatedTime: this._estimateCommitTime(orderedGroups),
                    warnings: [],
                });

                this._addSizeWarnings(commitPlan);
                return commitPlan;
            } catch (error) {
                console.warn('AI clustering failed, falling back to traditional method:', error);
                return super.groupChanges(analyzedChanges);
            }
        }

        console.log(this.openai, this.aiOptions.apiKey, this.aiOptions.enabled);

        // Fallback to traditional method
        return super.groupChanges(analyzedChanges);
    }

    /**
     * Cluster changes using AI embeddings and clustering algorithms
     */
    private async _clusterChangesWithAI(changes: AnalyzedChange[]): Promise<Cluster[]> {
        // Step 1: Generate embeddings for each file
        const embeddings = await this._generateEmbeddings(changes);

        // Step 2: Perform dimensionality reduction (optional but recommended)
        const reducedEmbeddings = await this._reduceDimensionality(embeddings);

        // Step 3: Cluster using selected algorithm
        const clusters = await this._performClustering(changes, reducedEmbeddings);

        // Step 4: Analyze and describe clusters
        return await this._analyzeAndDescribeClusters(clusters);
    }

    /**
     * Generate embeddings for file changes
     */
    private async _generateEmbeddings(changes: AnalyzedChange[]): Promise<number[][]> {
        const embeddings: number[][] = [];

        for (const change of changes) {
            const cacheKey = this._generateEmbeddingCacheKey(change);

            if (this.embeddingCache[cacheKey]) {
                embeddings.push(this.embeddingCache[cacheKey]);
                continue;
            }

            const text = this._prepareTextForEmbedding(change);
            const embedding = await this._getOpenAIEmbedding(text);

            this.embeddingCache[cacheKey] = embedding;
            embeddings.push(embedding);
        }

        return embeddings;
    }

    /**
     * Prepare text for embedding generation
     */
    private _prepareTextForEmbedding(change: AnalyzedChange): string {
        const parts: string[] = [];

        // File path and type
        parts.push(`File: ${change.filePath}`);
        parts.push(`Type: ${change.changeType}`);
        parts.push(`Category: ${change.fileCategory}`);

        // Code content (limited to important parts)
        const codeContent = change.diff
            .split('\n')
            .filter((line) => line.startsWith('+') && !line.includes('import') && !line.includes('require'))
            .slice(0, 10)
            .join(' ');

        if (codeContent) {
            parts.push(`Code: ${codeContent.substring(0, 500)}`);
        }

        // Features and dependencies
        if (change.detectedFeatures.length > 0) {
            parts.push(`Features: ${change.detectedFeatures.join(', ')}`);
        }

        if (change.dependencies.length > 0) {
            parts.push(`Dependencies: ${change.dependencies.join(', ')}`);
        }

        return parts.join('\n');
    }

    /**
     * Get embedding from OpenAI
     */
    private async _getOpenAIEmbedding(text: string): Promise<number[]> {
        if (!this.openai) {
            throw new Error('OpenAI client not initialized');
        }

        const response = await this.openai.embeddings.create({
            model: this.aiOptions.embeddingModel!,
            input: text,
        });

        return response.data[0].embedding;
    }

    /**
     * Reduce dimensionality using PCA (simplified)
     */
    private async _reduceDimensionality(embeddings: number[][]): Promise<number[][]> {
        // Simple normalization and dimensionality reduction
        // For production, consider proper PCA implementation
        const normalized = this._normalizeEmbeddings(embeddings);
        return normalized.map((embedding) => embedding.slice(0, 50)); // Reduce to first 50 dimensions
    }

    /**
     * Normalize embeddings
     */
    private _normalizeEmbeddings(embeddings: number[][]): number[][] {
        return embeddings.map((embedding) => {
            const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
            return embedding.map((val) => val / norm);
        });
    }

    /**
     * Perform clustering using selected algorithm
     */
    private async _performClustering(changes: AnalyzedChange[], embeddings: number[][]): Promise<ClusterAnalysis> {
        return this._performKMeans(changes, embeddings);
    }

    /**
     * KMeans clustering
     */
    private async _performKMeans(changes: AnalyzedChange[], embeddings: number[][]): Promise<ClusterAnalysis> {
        const k = Math.min(this.aiOptions.maxClusters!, Math.max(2, Math.floor(changes.length / 2)));

        const result = kmeans(embeddings, k, {
            initialization: 'kmeans++',
            maxIterations: 100,
        });

        const clusters: Cluster[] = [];
        const centroids: number[][] = result.centroids;

        for (let i = 0; i < k; i++) {
            const clusterIndices = result.clusters.map((clusterId, index) => (clusterId === i ? index : -1)).filter((index) => index !== -1);

            if (clusterIndices.length >= this.aiOptions.minClusterSize!) {
                const clusterFiles = clusterIndices.map((index) => changes[index]);
                clusters.push({
                    id: `cluster-${i}`,
                    files: clusterFiles,
                    centroid: centroids[i],
                    features: [],
                    description: '',
                    cohesionScore: 0,
                });
            }
        }

        return { clusters, centroids };
    }

    /**
     * Calculate centroid of embeddings
     */
    private _calculateCentroid(embeddings: number[][]): number[] {
        const centroid = new Array(embeddings[0].length).fill(0);

        for (const embedding of embeddings) {
            for (let i = 0; i < embedding.length; i++) {
                centroid[i] += embedding[i];
            }
        }

        return centroid.map((val) => val / embeddings.length);
    }

    /**
     * Analyze and describe clusters using AI
     */
    private async _analyzeAndDescribeClusters(clusterAnalysis: ClusterAnalysis): Promise<Cluster[]> {
        const enhancedClusters: Cluster[] = [];

        for (const cluster of clusterAnalysis.clusters) {
            try {
                const analysis = await this._analyzeClusterWithAI(cluster);
                enhancedClusters.push({
                    ...cluster,
                    features: analysis.features,
                    description: analysis.description,
                    cohesionScore: analysis.cohesionScore,
                });
            } catch (error) {
                console.warn(`Failed to analyze cluster ${cluster.id}:`, error);
                // Fallback to basic analysis
                enhancedClusters.push(this._analyzeClusterBasic(cluster));
            }
        }

        return enhancedClusters;
    }

    /**
     * Analyze cluster using OpenAI
     */
    private async _analyzeClusterWithAI(cluster: Cluster): Promise<{ features: string[]; description: string; cohesionScore: number }> {
        if (!this.openai) {
            throw new Error('OpenAI client not initialized');
        }

        const clusterSummary = cluster.files.map((file) => ({
            path: file.filePath,
            type: file.changeType,
            category: file.fileCategory,
            features: file.detectedFeatures,
        }));

        const prompt = `Analyze this group of code changes and describe what feature or purpose they serve together:

${JSON.stringify(clusterSummary, null, 2)}

Return JSON with:
- features: array of key features or purposes
- description: concise description of the group
- cohesionScore: score from 0-1 indicating how well these files belong together`;

        const response = await this.openai.chat.completions.create({
            model: this.aiOptions.model!,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert software architect analyzing code changes for logical grouping.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            max_tokens: 500,
            temperature: 0.1,
            response_format: { type: 'json_object' },
        });

        const result = JSON.parse(response.choices[0].message.content!);
        return {
            features: result.features || [],
            description: result.description || 'Unknown feature',
            cohesionScore: result.cohesionScore || 0.5,
        };
    }

    /**
     * Basic cluster analysis fallback
     */
    private _analyzeClusterBasic(cluster: Cluster): Cluster {
        const features = new Set<string>();
        const fileTypes = new Set<string>();

        for (const file of cluster.files) {
            file.detectedFeatures.forEach((feature) => features.add(feature));
            fileTypes.add(file.fileCategory);
        }

        return {
            ...cluster,
            features: Array.from(features),
            description: `Group of ${cluster.files.length} files (${Array.from(fileTypes).join(', ')})`,
            cohesionScore: 0.6,
        };
    }

    /**
     * Create commit groups from clusters
     */
    private async _createCommitGroupsFromClusters(clusters: Cluster[]): Promise<CommitGroup[]> {
        const commitGroups: CommitGroup[] = [];
        let groupId = 1;

        for (const cluster of clusters) {
            // Skip clusters with poor cohesion
            if (cluster.cohesionScore < 0.4) {
                continue;
            }

            const categorized = this._categorizeFilesOptimized(cluster.files, this._preprocessChanges(cluster.files));

            // Create separate groups for different categories if configured
            if (this.options.separateTestCommits && categorized.test.length > 0) {
                commitGroups.push(this._createCommitGroup(categorized.test, 'test', cluster, groupId++));
            }

            if (this.options.separateDocCommits && categorized.docs.length > 0) {
                commitGroups.push(this._createCommitGroup(categorized.docs, 'docs', cluster, groupId++));
            }

            // Main feature group
            const mainFiles = [
                ...categorized.feature,
                ...(this.options.separateTestCommits ? [] : categorized.test),
                ...(this.options.separateDocCommits ? [] : categorized.docs),
            ];

            if (mainFiles.length > 0) {
                const changeType = this._detectChangeIntent(mainFiles, cluster.description);
                const splitGroups = this._splitLargeGroup(mainFiles, changeType, cluster.description, groupId);
                commitGroups.push(...splitGroups);
                groupId += splitGroups.length;
            }
        }

        return commitGroups;
    }

    /**
     * Create a commit group from cluster
     */
    private _createCommitGroup(files: AnalyzedChange[], type: ChangeType, cluster: Cluster, id: number): CommitGroup {
        return new CommitGroup({
            id: `group-${id}`,
            type: type,
            scope: this._determineScope(files),
            description: this._generateDescription(type, cluster.description, files),
            files: files,
            priority: this._calculatePriority(type, files),
        });
    }

    /**
     * Generate cache key for embeddings
     */
    private _generateEmbeddingCacheKey(change: AnalyzedChange): string {
        const content = `${change.filePath}:${change.diff.substring(0, 200)}`;
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    private _cosineSimilarity(a: number[], b: number[]): number {
        const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        return dotProduct / (normA * normB);
    }

    /**
     * Clean up resources
     */
    async dispose(): Promise<void> {
        if (this.openai) {
            // Clean up any resources if needed
        }
        this.embeddingCache = {};
    }
}

// Export the enhanced grouper
export { AIClusteringCommitGrouper, AIClusteringOptions };
