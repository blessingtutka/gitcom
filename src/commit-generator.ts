import { AnalyzedChange } from './change-analyzer';

class CommitGenerator {
    private config: Required<CommitGeneratorConfig>;

    constructor(config: CommitGeneratorConfig = {}) {
        this.config = {
            style: config.style || 'conventional',
            maxLength: config.maxLength || 72,
            ...config,
        } as Required<CommitGeneratorConfig>;
    }

    async generate(changes: AnalyzedChange[]): Promise<string> {
        const analysis = await this.analyzeChanges(changes);

        switch (this.config.style) {
            case 'conventional':
                return this.generateConventional(analysis);
            case 'semantic':
                return this.generateSemantic(analysis);
            case 'custom':
                return this.generateCustom(analysis);
            default:
                return this.generateConventional(analysis);
        }
    }

    private analyzeChanges(changes: AnalyzedChange[]): CommitChangeAnalysis {
        const fileTypes = new Set<string>();
        const changeTypes = new Set<string>();
        let hasBreakingChanges = false;
        let primaryAction = '';

        for (const change of changes) {
            fileTypes.add(change.fileCategory);
            changeTypes.add(change.changeType);

            // Detect breaking changes using AnalyzedChange properties
            if (change.diff.includes('BREAKING') || change.diff.includes('breaking change') || change.changeType === 'deleted') {
                hasBreakingChanges = true;
            }
        }

        // Determine primary action (updated logic)
        if (changeTypes.has('added')) {
            primaryAction = fileTypes.has('test') ? 'test' : 'feat';
        } else if (changeTypes.has('deleted')) {
            primaryAction = 'refactor';
        } else if (fileTypes.has('docs')) {
            primaryAction = 'docs';
        } else if (fileTypes.has('test')) {
            primaryAction = 'test';
        } else if (fileTypes.has('config')) {
            primaryAction = 'chore';
        } else if (fileTypes.has('style')) {
            primaryAction = 'style';
        } else {
            primaryAction = 'fix';
        }

        return {
            primaryAction,
            hasBreakingChanges,
            fileTypes: Array.from(fileTypes),
            changeTypes: Array.from(changeTypes),
            scope: this.detectScope(changes),
            description: this.generateDescription(changes, primaryAction),
        };
    }

    private generateConventional(analysis: CommitChangeAnalysis): string {
        let message = analysis.primaryAction;

        if (analysis.scope) {
            message += `(${analysis.scope})`;
        }

        if (analysis.hasBreakingChanges) {
            message += '!';
        }

        message += `: ${analysis.description}`;

        // Ensure message doesn't exceed max length
        if (message.length > this.config.maxLength) {
            const colonIndex = message.indexOf(':');
            if (colonIndex !== -1) {
                const maxDesc = this.config.maxLength - colonIndex - 2;
                const truncatedDesc = analysis.description.substring(0, maxDesc - 3) + '...';
                message = message.substring(0, colonIndex + 2) + truncatedDesc;
            }
        }

        return message;
    }

    private generateSemantic(analysis: CommitChangeAnalysis): string {
        let prefix = 'PATCH';

        if (analysis.hasBreakingChanges) {
            prefix = 'BREAKING';
        } else if (analysis.primaryAction === 'feat') {
            prefix = 'FEATURE';
        } else if (analysis.primaryAction === 'fix') {
            prefix = 'BUGFIX';
        }

        return `${prefix}: ${analysis.description}`;
    }

    private generateCustom(analysis: CommitChangeAnalysis): string {
        // This would use user-defined templates
        return `${analysis.primaryAction}: ${analysis.description}`;
    }

    private getFileCategory(filePath: string): string {
        const path = filePath.toLowerCase();

        if (path.includes('test') || path.includes('spec')) return 'test';
        if (path.includes('doc') || path.includes('readme') || path.endsWith('.md')) return 'docs';
        if (path.includes('config') || path.includes('.json') || path.includes('.yml')) return 'config';
        if (path.includes('component') || path.includes('ui')) return 'ui';
        if (path.includes('api') || path.includes('service')) return 'api';
        if (path.includes('util') || path.includes('helper')) return 'utils';

        return 'code';
    }

    private detectScope(changes: AnalyzedChange[]): string | null {
        const files = changes.map((c) => c.filePath);

        // Look for common directory patterns
        const patterns = [
            { pattern: /^src\/components?\//, scope: 'components' },
            { pattern: /^src\/api\//, scope: 'api' },
            { pattern: /^src\/utils?\//, scope: 'utils' },
            { pattern: /^tests?\//, scope: 'tests' },
            { pattern: /^docs?\//, scope: 'docs' },
            { pattern: /^config\//, scope: 'config' },
        ];

        for (const { pattern, scope } of patterns) {
            if (files.some((f) => pattern.test(f))) {
                return scope;
            }
        }

        return null;
    }

    private generateDescription(changes: AnalyzedChange[], primaryAction: string): string {
        const fileCount = changes.length;
        const mainFile = changes[0]?.filePath;

        if (fileCount === 1 && mainFile) {
            const fileName =
                mainFile
                    .split('/')
                    .pop()
                    ?.replace(/\.[^/.]+$/, '') || 'file';

            switch (primaryAction) {
                case 'feat':
                    return `add ${fileName} functionality`;
                case 'fix':
                    return `resolve issue in ${fileName}`;
                case 'docs':
                    return `update ${fileName} documentation`;
                case 'test':
                    return `add tests for ${fileName}`;
                case 'refactor':
                    return `refactor ${fileName} implementation`;
                case 'style':
                    return `update ${fileName} styling`;
                default:
                    return `update ${fileName}`;
            }
        } else {
            switch (primaryAction) {
                case 'feat':
                    return `implement new features across ${fileCount} files`;
                case 'fix':
                    return `fix issues in ${fileCount} files`;
                case 'docs':
                    return `update documentation`;
                case 'test':
                    return `add comprehensive test coverage`;
                case 'refactor':
                    return `refactor codebase structure`;
                case 'style':
                    return `update styling across ${fileCount} files`;
                default:
                    return `update ${fileCount} files`;
            }
        }
    }
}

export { CommitGenerator };
