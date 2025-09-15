import { scopePatterns } from './pattern';
import { AnalyzedChange } from '../change-analyzer';
import path from 'path';

/**
 * Determines the scope for a commit based on multiple strategies
 * @export function
 * @param files - Files in the commit
 * @returns Scope or null if no clear scope
 */
export function determineScope(files: AnalyzedChange[]): string {
    if (files.length === 0) return '';

    // Strategy 1: Semantic scope detection from file paths
    const semanticScopes = detectSemanticScopes(files);
    if (semanticScopes.length > 0) {
        const scope = selectBestScope(semanticScopes);
        if (scope) return scope;
    }

    // Strategy 2: Most common file category (only if it makes sense as scope)
    const categoryScope = getCategoryScope(files);
    if (categoryScope) return categoryScope;

    // Strategy 3: Most common detected feature
    const featureScope = getFeatureScope(files);
    if (featureScope) return featureScope;

    // Strategy 4: Common directory analysis
    const directoryScope = getDirectoryScope(files);
    if (directoryScope) return directoryScope;

    return '';
}

/**
 * Detects semantic scopes by analyzing file path patterns
 * @export function
 */
export function detectSemanticScopes(changes: AnalyzedChange[]): Array<{ name: string; confidence: number }> {
    const scopes: Map<string, number> = new Map();

    for (const change of changes) {
        const file = change.filePath.replace(/\\/g, '/');

        // Check against predefined scope patterns
        for (const { pattern, name, weight } of scopePatterns) {
            if (pattern.test(file)) {
                scopes.set(name, (scopes.get(name) || 0) + weight);
            }
        }

        // Extract meaningful directory names from path structure
        const directories = extractMeaningfulDirectories(file);
        for (const dir of directories) {
            if (!isGenericName(dir)) {
                scopes.set(dir, (scopes.get(dir) || 0) + 2);
            }
        }
    }

    const totalWeight = Array.from(scopes.values()).reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return [];

    return Array.from(scopes.entries())
        .map(([name, score]) => ({
            name: normalizeScope(name),
            confidence: score / totalWeight,
        }))
        .filter(({ confidence }) => confidence >= 0.05) // Filter out very low confidence scopes
        .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Extracts meaningful directory names from file path
 */
function extractMeaningfulDirectories(filePath: string): string[] {
    const dirs: string[] = [];
    const pathParts = filePath.split('/').filter((part) => part && part !== '.');

    // Skip common root directories and focus on meaningful parts
    const meaningfulParts = pathParts.filter((part) => !['src', 'lib', 'app', 'public', 'dist', 'build'].includes(part.toLowerCase()));

    // Take first 2-3 meaningful directory levels
    for (let i = 0; i < Math.min(meaningfulParts.length - 1, 3); i++) {
        const part = meaningfulParts[i];
        if (part && part.length > 2 && !isGenericName(part)) {
            dirs.push(part);
        }
    }

    return dirs;
}

/**
 * Normalizes scope names for consistency
 */
function normalizeScope(scope: string): string {
    return scope
        .toLowerCase()
        .replace(/[_\s]+/g, '-')
        .replace(/s$/, '') // Remove trailing 's' for plurals
        .substring(0, 20); // Limit length
}

/**
 * Selects the best scope from detected semantic scopes
 * @export function
 */
export function selectBestScope(scopes: Array<{ name: string; confidence: number }>): string {
    if (scopes.length === 0) return '';

    const [primary, secondary] = scopes;

    // Very high confidence single scope
    if (primary.confidence >= 0.7) {
        return primary.name;
    }

    // High confidence with clear winner
    if (primary.confidence >= 0.5 && (!secondary || primary.confidence > secondary.confidence * 1.5)) {
        return primary.name;
    }

    // Multiple scopes with similar confidence - combine them
    if (secondary && primary.confidence >= 0.3 && secondary.confidence >= 0.2 && primary.confidence / secondary.confidence < 1.8) {
        return `${primary.name}/${secondary.name}`;
    }

    // Medium confidence single scope
    if (primary.confidence >= 0.25) {
        return primary.name;
    }

    return '';
}

/**
 * Gets scope from most common file category (only for scope-appropriate categories)
 * @export function
 */
export function getCategoryScope(files: AnalyzedChange[]): string | null {
    const categoryCounts: Record<string, number> = {};

    for (const file of files) {
        if (!file.fileCategory) continue;
        categoryCounts[file.fileCategory] = (categoryCounts[file.fileCategory] || 0) + 1;
    }

    if (Object.keys(categoryCounts).length === 0) return null;

    const sortedCategories = Object.entries(categoryCounts).sort(([, a], [, b]) => b - a);

    const [topCategory, count] = sortedCategories[0];

    // Only use categories that make sense as scopes
    const scopeAppropriateCategories = new Set(['docs', 'test', 'config', 'build', 'ci', 'style', 'assets']);

    if (!scopeAppropriateCategories.has(topCategory)) {
        return null;
    }

    // Require clear majority (at least 60% of files)
    const threshold = Math.max(2, Math.ceil(files.length * 0.6));
    return count >= threshold ? topCategory : null;
}

/**
 * Gets scope from most common detected feature
 * @export function
 */
export function getFeatureScope(files: AnalyzedChange[]): string | null {
    const features = files.flatMap((f) => f.detectedFeatures || []);
    if (features.length === 0) return null;

    const featureCounts: Record<string, number> = {};

    for (const feature of features) {
        if (feature && !isGenericName(feature) && feature.length >= 3) {
            const normalized = normalizeScope(feature);
            featureCounts[normalized] = (featureCounts[normalized] || 0) + 1;
        }
    }

    if (Object.keys(featureCounts).length === 0) return null;

    const sortedFeatures = Object.entries(featureCounts).sort(([, a], [, b]) => b - a);

    const [mostCommon, count] = sortedFeatures[0];

    // Require at least 2 files to have the same feature
    return count >= 2 && count > features.length * 0.3 ? mostCommon : null;
}

/**
 * Gets scope from common directory analysis
 * @export function
 */
export function getDirectoryScope(files: AnalyzedChange[]): string | null {
    if (files.length < 2) return null;

    const directories = files.map((f) => path.dirname(f.filePath)).filter((dir) => dir !== '.' && dir !== '/');

    if (directories.length === 0) return null;

    const commonDir = findCommonDirectory(directories);
    if (!commonDir || isGenericName(commonDir)) return null;

    const lastPart = commonDir.split('/').pop();
    return lastPart && !isGenericName(lastPart) ? normalizeScope(lastPart) : null;
}

/**
 * Checks if a name is generic and shouldn't be used as scope
 * @export function
 */
export function isGenericName(name: string): boolean {
    const genericNames = new Set([
        // Common directories
        'src',
        'lib',
        'dist',
        'build',
        'node_modules',
        'public',
        'static',
        'test',
        'tests',
        'spec',
        'specs',
        '__tests__',
        '__specs__',
        'docs',
        'doc',
        'documentation',

        // Generic code organization
        'components',
        'component',
        'utils',
        'util',
        'helpers',
        'helper',
        'types',
        'type',
        '@types',
        'interfaces',
        'interface',
        'services',
        'service',
        'api',
        'apis',
        'hooks',
        'hook',
        'custom-hooks',
        'pages',
        'page',
        'views',
        'view',
        'screens',
        'screen',
        'layouts',
        'layout',
        'templates',
        'template',

        // Generic filenames
        'index',
        'main',
        'app',
        'application',
        'core',
        'base',
        'config',
        'configuration',
        'settings',
        'options',
        'constants',
        'constant',
        'enums',
        'enum',
        'models',
        'model',
        'entities',
        'entity',
        'schemas',
        'schema',

        // Build/tooling
        'scripts',
        'script',
        'tools',
        'tool',
        'bin',
        'assets',
        'asset',
        'images',
        'image',
        'styles',
        'style',
        'css',
        'scss',
        'sass',
        'less',

        // Other generic terms
        'common',
        'shared',
        'global',
        'general',
        'misc',
        'miscellaneous',
        'other',
        'others',
        'temp',
        'tmp',
        'backup',
        'old',
    ]);

    const normalized = name.toLowerCase().replace(/[_-]/g, '');
    return genericNames.has(normalized) || normalized.length < 3;
}

/**
 * Finds common directory among multiple paths
 * @export function
 */
export function findCommonDirectory(dirs: string[]): string {
    if (dirs.length === 0) return '';
    if (dirs.length === 1) return dirs[0];

    const pathParts = dirs.map((dir) => dir.split(path.sep).filter((part) => part && part !== '.'));

    const minLength = Math.min(...pathParts.map((parts) => parts.length));
    if (minLength === 0) return '';

    let commonParts: string[] = [];
    for (let i = 0; i < minLength; i++) {
        const currentPart = pathParts[0][i];
        const allSame = pathParts.every((parts) => parts[i] === currentPart);

        if (allSame) {
            commonParts.push(currentPart);
        } else {
            break;
        }
    }

    return commonParts.join(path.sep);
}
