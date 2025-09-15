import * as fs from 'fs/promises';
import * as path from 'path';
import { CommitGroup } from './types/models';
import { fileTypePatterns } from './utils';

/**
 * Custom commit message template system
 * Supports user-defined templates and dynamic template generation
 */
class CommitMessageTemplates {
    private workspaceRoot: string;
    private options: Required<CommitMessageTemplatesOptions>;
    private builtInTemplates: Map<string, Template>;
    private customTemplates: Map<string, Template>;
    private templateUsageStats: Map<string, number>;

    constructor(workspaceRoot?: string, options: CommitMessageTemplatesOptions = {}) {
        this.workspaceRoot = workspaceRoot || process.cwd();
        this.options = {
            templatesFile: options.templatesFile || '.kiro/commit-templates.json',
            enableCustomTemplates: options.enableCustomTemplates !== false,
            enableDynamicTemplates: options.enableDynamicTemplates !== false,
            defaultTemplate: options.defaultTemplate || 'conventional',
            ...options,
        } as Required<CommitMessageTemplatesOptions>;

        // Built-in templates
        this.builtInTemplates = new Map();
        this.customTemplates = new Map();
        this.templateUsageStats = new Map();

        this._initializeBuiltInTemplates();
    }

    /**
     * Generates a commit message using the specified template
     * @param commitGroup - Commit group to generate message for
     * @param templateName - Name of template to use
     * @param context - Additional context for template generation
     * @returns Generated commit message
     */
    async generateMessage(commitGroup: CommitGroup, templateName: string | null = null, context: Record<string, any> = {}): Promise<string> {
        const template = await this._getTemplate(templateName || this.options.defaultTemplate);

        if (!template) {
            throw new Error(`Template not found: ${templateName || this.options.defaultTemplate}`);
        }

        // Prepare template variables
        const variables = await this._prepareTemplateVariables(commitGroup, context);

        // Generate message using template
        const message = await this._applyTemplate(template, variables);

        // Track template usage
        this._trackTemplateUsage(template.name);

        return message;
    }

    /**
     * Adds a custom template
     * @param name - Template name
     * @param template - Template definition
     */
    async addCustomTemplate(name: string, template: Omit<Template, 'name'>): Promise<void> {
        if (!this.options.enableCustomTemplates) {
            throw new Error('Custom templates are disabled');
        }

        // Validate template
        this._validateTemplate({ ...template, name });

        this.customTemplates.set(name, {
            ...template,
            name,
            type: 'custom',
            createdAt: Date.now(),
        });

        await this._saveCustomTemplates();
    }

    /**
     * Removes a custom template
     * @param name - Template name to remove
     * @returns True if template was removed
     */
    async removeCustomTemplate(name: string): Promise<boolean> {
        if (this.customTemplates.has(name)) {
            this.customTemplates.delete(name);
            await this._saveCustomTemplates();
            return true;
        }
        return false;
    }

    /**
     * Lists all available templates
     * @returns List of available templates
     */
    listTemplates(): TemplateListItem[] {
        const templates: TemplateListItem[] = [];

        // Add built-in templates
        for (const [name, template] of this.builtInTemplates) {
            templates.push({
                name,
                type: 'built-in',
                description: template.description,
                example: template.example,
            });
        }

        // Add custom templates
        for (const [name, template] of this.customTemplates) {
            templates.push({
                name,
                type: 'custom',
                description: template.description,
                example: template.example,
                createdAt: template.createdAt,
            });
        }

        return templates;
    }

    /**
     * Gets template usage statistics
     * @returns Usage statistics
     */
    getUsageStats(): Record<string, number> {
        const stats: Record<string, number> = {};
        for (const [templateName, count] of this.templateUsageStats) {
            stats[templateName] = count;
        }
        return stats;
    }

    /**
     * Creates a dynamic template based on analysis of existing commit messages
     * @param commitHistory - Array of previous commit messages
     * @param templateName - Name for the new template
     * @returns Generated template
     */
    async createDynamicTemplate(commitHistory: string[], templateName: string): Promise<Template> {
        if (!this.options.enableDynamicTemplates) {
            throw new Error('Dynamic templates are disabled');
        }

        const analysis = this._analyzeCommitHistory(commitHistory);
        const template = this._generateTemplateFromAnalysis(analysis, templateName);

        // Add as custom template
        await this.addCustomTemplate(templateName, template);

        return template;
    }

    /**
     * Initializes built-in templates
     * @private
     */
    private _initializeBuiltInTemplates(): void {
        // Conventional Commits template
        this.builtInTemplates.set('conventional', {
            name: 'conventional',
            description: 'Standard Conventional Commits format',
            pattern: '{{type}}{{scope}}: {{description}}{{body}}{{footer}}',
            variables: {
                type: { required: true, type: 'string' },
                scope: { required: false, type: 'string', format: '({{value}})' },
                description: { required: true, type: 'string' },
                body: { required: false, type: 'string', format: '\n\n{{value}}' },
                footer: { required: false, type: 'string', format: '\n\n{{value}}' },
            },
            example: 'feat(auth): add user authentication\n\nImplement JWT-based authentication system\n\nCloses #123',
        });

        // Simple template
        this.builtInTemplates.set('simple', {
            name: 'simple',
            description: 'Simple commit message format',
            pattern: '{{description}}',
            variables: {
                description: { required: true, type: 'string' },
            },
            example: 'Add user authentication feature',
        });

        // Detailed template
        this.builtInTemplates.set('detailed', {
            name: 'detailed',
            description: 'Detailed commit message with context',
            pattern: '{{type}}: {{description}}\n\nFiles changed: {{fileCount}}\nFeatures: {{features}}{{breaking}}',
            variables: {
                type: { required: true, type: 'string' },
                description: { required: true, type: 'string' },
                fileCount: { required: true, type: 'number' },
                features: { required: false, type: 'array', format: '{{value}}' },
                breaking: { required: false, type: 'string', format: '\n\nBREAKING CHANGE: {{value}}' },
            },
            example: 'feat: Add user authentication\n\nFiles changed: 5\nFeatures: auth, login, jwt',
        });

        // Agile/Scrum template
        this.builtInTemplates.set('agile', {
            name: 'agile',
            description: 'Agile/Scrum focused template with story references',
            pattern: '{{type}}: {{description}}\n\nStory: {{story}}\nAcceptance Criteria: {{criteria}}{{breaking}}',
            variables: {
                type: { required: true, type: 'string' },
                description: { required: true, type: 'string' },
                story: { required: false, type: 'string' },
                criteria: { required: false, type: 'string' },
                breaking: { required: false, type: 'string', format: '\n\nBREAKING CHANGE: {{value}}' },
            },
            example:
                'feat: Add user authentication\n\nStory: As a user, I want to log in securely\nAcceptance Criteria: User can login with email/password',
        });

        // Bug fix template
        this.builtInTemplates.set('bugfix', {
            name: 'bugfix',
            description: 'Template specifically for bug fixes',
            pattern: 'fix{{scope}}: {{description}}\n\nIssue: {{issue}}\nRoot Cause: {{rootCause}}\nSolution: {{solution}}',
            variables: {
                scope: { required: false, type: 'string', format: '({{value}})' },
                description: { required: true, type: 'string' },
                issue: { required: false, type: 'string' },
                rootCause: { required: false, type: 'string' },
                solution: { required: false, type: 'string' },
            },
            example:
                'fix(auth): resolve login timeout issue\n\nIssue: Users unable to login after 30 seconds\nRoot Cause: JWT token validation timeout\nSolution: Increased timeout and added retry logic',
        });
    }

    /**
     * Gets a template by name
     * @private
     * @param templateName - Name of template to get
     * @returns Template object
     */
    private async _getTemplate(templateName: string): Promise<Template | null> {
        // Check built-in templates first
        if (this.builtInTemplates.has(templateName)) {
            return this.builtInTemplates.get(templateName)!;
        }

        // Check custom templates
        if (this.customTemplates.has(templateName)) {
            return this.customTemplates.get(templateName)!;
        }

        // Load custom templates if not already loaded
        if (this.customTemplates.size === 0) {
            await this._loadCustomTemplates();
            if (this.customTemplates.has(templateName)) {
                return this.customTemplates.get(templateName)!;
            }
        }

        return null;
    }

    /**
     * Prepares variables for template application
     * @private
     * @param commitGroup - Commit group
     * @param context - Additional context
     * @returns Template variables
     */
    private async _prepareTemplateVariables(commitGroup: CommitGroup, context: Record<string, any>): Promise<Record<string, any>> {
        const variables = {
            // Basic information
            type: commitGroup.type || 'feat',
            scope: commitGroup.scope || null,

            // File information
            fileCount: commitGroup.files.length,
            files: commitGroup.files.map((f) => f.filePath),
            fileTypes: [...new Set(commitGroup.files.map((f) => this._getFileType(f.filePath)))],

            // Change information
            linesAdded: commitGroup.files.reduce((sum, f) => sum + (f.linesAdded || 0), 0),
            linesRemoved: commitGroup.files.reduce((sum, f) => sum + (f.linesRemoved || 0), 0),
            changeTypes: [...new Set(commitGroup.files.map((f) => f.changeType))],

            // Feature information
            features: [...new Set(commitGroup.files.flatMap((f) => f.detectedFeatures || []))],

            // Context information
            ...context,

            // Breaking change detection
            breaking: this._detectBreakingChange(commitGroup),

            // Additional computed variables
            isLargeChange: commitGroup.files.length > 10,
            isMajorChange: this._isMajorChange(commitGroup),
            affectedComponents: this._getAffectedComponents(commitGroup),
        };

        return variables;
    }

    /**
     * Applies template to variables to generate commit message
     * @private
     * @param template - Template to apply
     * @param variables - Variables to substitute
     * @returns Generated message
     */
    private async _applyTemplate(template: Template, variables: Record<string, any>): Promise<string> {
        let message = template.pattern;

        // Replace variables in the pattern
        for (const [varName, varConfig] of Object.entries(template.variables)) {
            const value = variables[varName];
            const placeholder = `{{${varName}}}`;

            if (value !== null && value !== undefined && value !== '') {
                let formattedValue = this._formatVariable(value, varConfig);
                message = message.replace(placeholder, formattedValue);
            } else if (varConfig.required) {
                // Use default value or generate one
                const defaultValue = this._generateDefaultValue(varName, varConfig, variables);
                let formattedValue = this._formatVariable(defaultValue, varConfig);
                message = message.replace(placeholder, formattedValue);
            } else {
                // Remove optional placeholder
                message = message.replace(placeholder, '');
            }
        }

        // Clean up extra whitespace and newlines
        message = message.replace(/\n\s*\n\s*\n/g, '\n\n'); // Remove triple newlines
        message = message.replace(/\s+$/gm, ''); // Remove trailing whitespace
        message = message.trim();

        return message;
    }

    /**
     * Formats a variable value according to its configuration
     * @private
     * @param value - Value to format
     * @param config - Variable configuration
     * @returns Formatted value
     */
    private _formatVariable(value: any, config: TemplateVariableConfig): string {
        if (config.format) {
            return config.format.replace('{{value}}', value);
        }

        if (config.type === 'array') {
            return Array.isArray(value) ? value.join(', ') : String(value);
        }

        return String(value);
    }

    /**
     * Generates a default value for a required variable
     * @private
     * @param varName - Variable name
     * @param config - Variable configuration
     * @param variables - All variables
     * @returns Default value
     */
    private _generateDefaultValue(varName: string, config: TemplateVariableConfig, variables: Record<string, any>): string {
        switch (varName) {
            case 'type':
                return variables.changeTypes?.includes('added') ? 'feat' : 'fix';
            case 'description':
                return `Update ${variables.fileCount} file${variables.fileCount !== 1 ? 's' : ''}`;
            case 'scope':
                return variables.affectedComponents?.[0] || null;
            default:
                return '';
        }
    }

    /**
     * Validates a template definition
     * @private
     * @param template - Template to validate
     * @throws Error If template is invalid
     */
    private _validateTemplate(template: Template): void {
        if (!template.name || typeof template.name !== 'string') {
            throw new Error('Template must have a valid name');
        }

        if (!template.pattern || typeof template.pattern !== 'string') {
            throw new Error('Template must have a valid pattern');
        }

        if (!template.variables || typeof template.variables !== 'object') {
            throw new Error('Template must have variables definition');
        }

        // Validate that all variables in pattern are defined
        const patternVariables = template.pattern.match(/\{\{(\w+)\}\}/g) || [];
        for (const varMatch of patternVariables) {
            const varName = varMatch.replace(/\{\{|\}\}/g, '');
            if (!template.variables[varName]) {
                throw new Error(`Variable '${varName}' used in pattern but not defined in variables`);
            }
        }
    }

    /**
     * Loads custom templates from file
     * @private
     */
    private async _loadCustomTemplates(): Promise<void> {
        try {
            const templatesPath = path.resolve(this.workspaceRoot, this.options.templatesFile);
            const data = await fs.readFile(templatesPath, 'utf8');
            const templates: Record<string, Template> = JSON.parse(data);

            for (const [name, template] of Object.entries(templates)) {
                this.customTemplates.set(name, { ...template, name, type: 'custom' });
            }
        } catch (error) {
            // Templates file doesn't exist or is corrupted, start fresh
            console.log('No custom templates found, using built-in templates only');
        }
    }

    /**
     * Saves custom templates to file
     * @private
     */
    private async _saveCustomTemplates(): Promise<void> {
        try {
            const templatesPath = path.resolve(this.workspaceRoot, this.options.templatesFile);
            const templatesDir = path.dirname(templatesPath);

            // Ensure directory exists
            await fs.mkdir(templatesDir, { recursive: true });

            const templates: Record<string, Template> = {};
            for (const [name, template] of this.customTemplates) {
                templates[name] = template;
            }

            await fs.writeFile(templatesPath, JSON.stringify(templates, null, 2));
        } catch (error) {
            console.warn('Failed to save custom templates:', (error as Error).message);
        }
    }

    /**
     * Tracks template usage for statistics
     * @private
     * @param templateName - Name of template used
     */
    private _trackTemplateUsage(templateName: string): void {
        const currentCount = this.templateUsageStats.get(templateName) || 0;
        this.templateUsageStats.set(templateName, currentCount + 1);
    }

    /**
     * Analyzes commit history to understand patterns
     * @private
     * @param commitHistory - Array of commit messages
     * @returns Analysis results
     */
    private _analyzeCommitHistory(commitHistory: string[]): TemplateAnalysis {
        const analysis: TemplateAnalysis = {
            commonTypes: new Map(),
            commonScopes: new Map(),
            averageLength: 0,
            commonPatterns: [],
            breakingChangeFrequency: 0,
        };

        for (const commit of commitHistory) {
            // Analyze commit type
            const typeMatch = commit.match(/^(\w+)(\(.+\))?:/);
            if (typeMatch) {
                const type = typeMatch[1];
                analysis.commonTypes.set(type, (analysis.commonTypes.get(type) || 0) + 1);

                // Analyze scope
                if (typeMatch[2]) {
                    const scope = typeMatch[2].replace(/[()]/g, '');
                    analysis.commonScopes.set(scope, (analysis.commonScopes.get(scope) || 0) + 1);
                }
            }

            // Check for breaking changes
            if (commit.includes('BREAKING CHANGE') || commit.includes('!:')) {
                analysis.breakingChangeFrequency++;
            }

            analysis.averageLength += commit.length;
        }

        analysis.averageLength = Math.round(analysis.averageLength / commitHistory.length);
        analysis.breakingChangeFrequency = (analysis.breakingChangeFrequency / commitHistory.length) * 100;

        return analysis;
    }

    /**
     * Generates a template from commit history analysis
     * @private
     * @param analysis - Analysis results
     * @param templateName - Name for the template
     * @returns Generated template
     */
    private _generateTemplateFromAnalysis(analysis: TemplateAnalysis, templateName: string): Template {
        const mostCommonType = [...analysis.commonTypes.entries()].sort(([, a], [, b]) => b - a)[0]?.[0] || 'feat';

        const hasScopes = analysis.commonScopes.size > 0;
        const hasBreakingChanges = analysis.breakingChangeFrequency > 5;

        let pattern = `{{type}}`;
        if (hasScopes) {
            pattern += `{{scope}}`;
        }
        pattern += `: {{description}}`;

        if (analysis.averageLength > 50) {
            pattern += `{{body}}`;
        }

        if (hasBreakingChanges) {
            pattern += `{{breaking}}`;
        }

        const variables: Record<string, TemplateVariableConfig> = {
            type: { required: true, type: 'string' },
            description: { required: true, type: 'string' },
        };

        if (hasScopes) {
            variables.scope = { required: false, type: 'string', format: '({{value}})' };
        }

        if (analysis.averageLength > 50) {
            variables.body = { required: false, type: 'string', format: '\n\n{{value}}' };
        }

        if (hasBreakingChanges) {
            variables.breaking = { required: false, type: 'string', format: '\n\nBREAKING CHANGE: {{value}}' };
        }

        return {
            name: templateName,
            description: `Dynamic template generated from commit history analysis`,
            pattern,
            variables,
            example: this._generateExampleFromTemplate(pattern, variables),
            generatedAt: Date.now(),
            basedOnCommits: analysis.commonTypes.size,
        };
    }

    /**
     * Generates an example from a template
     * @private
     * @param pattern - Template pattern
     * @param variables - Template variables
     * @returns Example commit message
     */
    private _generateExampleFromTemplate(pattern: string, variables: Record<string, TemplateVariableConfig>): string {
        const exampleValues: Record<string, string> = {
            type: 'feat',
            scope: 'auth',
            description: 'add user authentication',
            body: 'Implement JWT-based authentication system with login and logout functionality',
            breaking: 'Authentication API endpoints have changed',
        };

        let example = pattern;
        for (const [varName, config] of Object.entries(variables)) {
            const value = exampleValues[varName] || 'example';
            const formattedValue = this._formatVariable(value, config);
            example = example.replace(`{{${varName}}}`, formattedValue);
        }

        return example;
    }

    /**
     * Gets file type from file path
     * @private
     * @param filePath - File path
     * @returns File type
     */
    private _getFileType(filePath: string): string {
        const fileName = path.basename(filePath);
        const normalizedPath = filePath.replace(/\\/g, '/');

        let bestMatch: { category: string; weight: number } | null = null;

        // Check against all patterns to find the best match
        for (const { pattern, category, weight } of fileTypePatterns) {
            if (pattern.test(filePath) || pattern.test(fileName) || pattern.test(normalizedPath)) {
                if (!bestMatch || weight > bestMatch.weight) {
                    bestMatch = { category, weight };
                }
            }
        }

        if (bestMatch) {
            return bestMatch.category;
        }

        return 'feature';
    }

    /**
     * Detects breaking changes in commit group
     * @private
     * @param commitGroup - Commit group to analyze
     * @returns Breaking change description or null
     */
    private _detectBreakingChange(commitGroup: CommitGroup): string | null {
        // Simple heuristics for breaking change detection
        const hasDeletedFiles = commitGroup.files.some((f) => f.changeType === 'deleted');
        const hasAPIChanges = commitGroup.files.some((f) => f.filePath.includes('api') || f.filePath.includes('interface'));
        const hasConfigChanges = commitGroup.files.some((f) => f.fileCategory === 'config');

        if (hasDeletedFiles && hasAPIChanges) {
            return 'API endpoints removed';
        }

        if (hasConfigChanges && commitGroup.files.length === 1) {
            return 'Configuration format changed';
        }

        return null;
    }

    /**
     * Determines if this is a major change
     * @private
     * @param commitGroup - Commit group to analyze
     * @returns True if major change
     */
    private _isMajorChange(commitGroup: CommitGroup): boolean {
        const totalLines = commitGroup.files.reduce((sum, f) => sum + (f.linesAdded || 0) + (f.linesRemoved || 0), 0);

        return totalLines > 100 || commitGroup.files.length > 15;
    }

    /**
     * Gets affected components from commit group
     * @private
     * @param commitGroup - Commit group to analyze
     * @returns Affected components
     */
    private _getAffectedComponents(commitGroup: CommitGroup): string[] {
        const components = new Set<string>();

        for (const file of commitGroup.files) {
            const pathParts = file.filePath.split('/');

            // Add directory-based components
            if (pathParts.length > 1) {
                components.add(pathParts[0]);
                if (pathParts.length > 2) {
                    components.add(pathParts[1]);
                }
            }

            // Add feature-based components
            for (const feature of file.detectedFeatures || []) {
                if (feature.length > 2) {
                    components.add(feature);
                }
            }
        }

        return Array.from(components).slice(0, 3); // Limit to top 3 components
    }
}

export { CommitMessageTemplates };
