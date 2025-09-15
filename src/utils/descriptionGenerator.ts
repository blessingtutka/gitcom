import path from 'path';
import { AnalyzedChange } from '../change-analyzer';

export function generateSingleFileDescription(change: AnalyzedChange, action: string): string {
    const fileName = getFriendlyFileName(change.filePath);
    const fileCategory = change.fileCategory;

    const singleFileDescriptors: Record<string, (name: string, category: string) => string> = {
        feat: (name, category) => {
            if (category === 'component') return `add ${name} component`;
            if (category === 'api') return `implement ${name} endpoint`;
            if (category === 'util') return `add ${name} utility`;
            return `implement ${name} feature`;
        },
        fix: (name, category) => {
            if (category === 'component') return `fix ${name} component bug`;
            if (category === 'api') return `resolve ${name} endpoint issue`;
            return `fix ${name} issue`;
        },
        docs: (name, category) => {
            if (category === 'api') return `document ${name} API`;
            if (category === 'component') return `add ${name} component docs`;
            return `update ${name} documentation`;
        },
        test: (name, category) => {
            if (category === 'component') return `add ${name} component tests`;
            if (category === 'util') return `test ${name} utility`;
            return `add ${name} test coverage`;
        },
        refactor: (name, category) => {
            if (category === 'component') return `refactor ${name} component`;
            if (category === 'util') return `clean up ${name} utility`;
            return `refactor ${name} code`;
        },
        style: (name, category) => {
            if (category === 'component') return `update ${name} component styles`;
            return `improve ${name} ${name.toLowerCase() == 'style' ? '' : 'styling'}`;
        },
        chore: (name, category) => {
            if (category === 'config') return `update ${name} configuration`;
            if (category === 'deps') return `update ${name} dependencies`;
            return `maintain ${name}`;
        },
        perf: (name, category) => {
            if (category === 'component') return `optimize ${name} component performance`;
            if (category === 'api') return `improve ${name} endpoint performance`;
            return `optimize ${name} performance`;
        },
    };

    const descriptor = singleFileDescriptors[action];
    return descriptor ? descriptor(fileName, fileCategory) : `update ${fileName}`;
}

export function generateMultiFileDescription(changes: AnalyzedChange[], action: string, primaryScope: string): string {
    const fileCount = changes.length;
    const totalLines = changes.reduce((sum, change) => sum + change.linesAdded + change.linesRemoved, 0);
    const addedFiles = changes.filter((c) => c.changeType === 'added').length;
    const modifiedFiles = changes.filter((c) => c.changeType === 'modified').length;
    const deletedFiles = changes.filter((c) => c.changeType === 'deleted').length;
    const categories = new Set(changes.map((c) => c.fileCategory));

    // Get scope context for better descriptions
    const scopeContext = getScopeContext(primaryScope);

    const multiFileDescriptors: Record<string, string> = {
        feat: getFeatDescription(scopeContext, fileCount, addedFiles, totalLines, categories),
        fix: getFixDescription(scopeContext, fileCount, totalLines, categories, deletedFiles),
        docs: getDocsDescription(scopeContext, fileCount, categories),
        test: getTestDescription(scopeContext, fileCount, addedFiles, categories),
        refactor: getRefactorDescription(scopeContext, fileCount, totalLines, categories),
        style: getStyleDescription(scopeContext, fileCount, totalLines, categories),
        chore: getChoreDescription(scopeContext, fileCount, categories),
        perf: getPerfDescription(scopeContext, fileCount, totalLines),
    };

    return multiFileDescriptors[action] || `updates ${scopeContext}`;
}

function getScopeContext(primaryScope: string): string {
    if (!primaryScope) {
        return 'project';
    }

    const scopeMap: Record<string, string> = {
        // Frontend
        components: 'UI components',
        ui: 'user interface',
        pages: 'page components',
        assets: 'assets',
        public: 'public assets',

        // Backend
        api: 'API',
        services: 'services',
        controllers: 'controllers',
        models: 'data models',
        routes: 'routes',

        // Core
        core: 'core functionality',
        utils: 'utilities',
        types: 'type definitions',
        constants: 'constants',

        // Infrastructure
        config: '',
        build: 'build system',
        scripts: 'scripts',
        deps: 'dependencies',

        // Documentation & Testing
        docs: 'documentation',
        tests: 'tests',
        storybook: 'Storybook',

        // Styling
        styles: 'styles',
        css: 'CSS',
        scss: 'SCSS',

        // React specific
        hooks: 'React hooks',
    };

    return scopeMap[primaryScope] || primaryScope;
}

function getFeatDescription(scope: string, fileCount: number, addedFiles: number, totalLines: number, categories: Set<string>): string {
    if (addedFiles >= fileCount * 0.7) {
        if (categories.has('component')) return `implement new ${scope} components`;
        if (categories.has('api')) return `add new ${scope} endpoints`;
        return `add ${scope}`;
    }

    if (totalLines > 500) {
        return `major ${scope} feature implementation`;
    }

    if (fileCount <= 3) {
        return `enhance ${scope} with new features`;
    }

    return `implement ${scope} features`;
}

function getFixDescription(scope: string, fileCount: number, totalLines: number, categories: Set<string>, deletedFiles: number): string {
    if (categories.has('test')) {
        return `fix ${scope} test failures`;
    }

    if (deletedFiles > 0) {
        return `clean up and fix ${scope} issues`;
    }

    if (totalLines > 300) {
        return `comprehensive ${scope} bug fixes`;
    }

    if (fileCount <= 3) {
        return `resolve ${scope} issues`;
    }

    return `fix ${scope} bugs`;
}

function getDocsDescription(scope: string, fileCount: number, categories: Set<string>): string {
    if (categories.has('api')) {
        return `update ${scope} API documentation`;
    }

    if (categories.has('component')) {
        return `improve ${scope} component documentation`;
    }

    if (fileCount > 5) {
        return `comprehensive ${scope} documentation update`;
    }

    return `update ${scope} documentation`;
}

function getTestDescription(scope: string, fileCount: number, addedFiles: number, categories: Set<string>): string {
    if (addedFiles >= fileCount * 0.6) {
        return `add comprehensive ${scope} test coverage`;
    }

    if (categories.has('component')) {
        return `enhance ${scope} component testing`;
    }

    if (fileCount <= 3) {
        return `improve ${scope} test coverage`;
    }

    return `update ${scope} test suite`;
}

function getRefactorDescription(scope: string, fileCount: number, totalLines: number, categories: Set<string>): string {
    if (totalLines > 1000) {
        return `major ${scope} code restructuring`;
    }

    if (categories.has('component')) {
        return `refactor ${scope} components`;
    }

    if (fileCount <= 3) {
        return `optimize ${scope} code structure`;
    }

    return `refactor ${scope} implementation`;
}

function getStyleDescription(scope: string, fileCount: number, totalLines: number, categories: Set<string>): string {
    if (totalLines > 200) {
        return `major ${scope} styling update`;
    }

    if (categories.has('component')) {
        return `update ${scope} component styles`;
    }

    if (fileCount <= 3) {
        return `improve ${scope} styling`;
    }

    return `update ${scope} styles`;
}

function getChoreDescription(scope: string, fileCount: number, categories: Set<string>): string {
    if (categories.has('config') || scope == 'config') {
        return `update config`;
    }

    if (categories.has('deps')) {
        return `update ${scope} dependencies`;
    }

    if (fileCount > 10) {
        return `maintain ${scope} infrastructure`;
    }

    return `routine ${scope} maintenance`;
}

function getPerfDescription(scope: string, fileCount: number, totalLines: number): string {
    if (totalLines > 100) {
        return `significant ${scope} performance optimization`;
    }

    if (fileCount <= 3) {
        return `optimize ${scope} performance`;
    }

    return `enhance ${scope} performance`;
}

function getFriendlyFileName(filePath: string): string {
    const baseName = path.basename(filePath, path.extname(filePath));

    if (baseName === 'index') {
        const dirName = path.dirname(filePath).split('/').pop() || '';
        return dirName || 'module';
    }

    // Handle common naming patterns
    const friendlyName = baseName
        .toLocaleLowerCase()
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())
        .replace(/\s+/g, ' ')
        .trim();

    return friendlyName.replace(/\b(Component|Container|Page|Screen|Service|Util|Helper|Hook)\b/gi, '').trim() || 'file';
}
