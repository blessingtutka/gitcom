class Config {
    private defaults: ConfigDefaults;

    constructor() {
        this.defaults = {
            commitStyle: 'conventional',
            maxLength: 72,
            autoStage: false,
            showAnalysis: true,
            customTemplate: '{type}({scope}): {description}',
            commitTypes: {
                feat: 'A new feature',
                fix: 'A bug fix',
                docs: 'Documentation only changes',
                style: 'Changes that do not affect the meaning of the code',
                refactor: 'A code change that neither fixes a bug nor adds a feature',
                perf: 'A code change that improves performance',
                test: 'Adding missing tests or correcting existing tests',
                chore: 'Changes to the build process or auxiliary tools',
            },
        };
    }

    get<K extends keyof ConfigDefaults>(key: K): ConfigDefaults[K] {
        return this.defaults[key];
    }

    set<K extends keyof ConfigDefaults>(key: K, value: ConfigDefaults[K]): void {
        this.defaults[key] = value;
    }

    getCommitTypes(): CommitTypes {
        return this.get('commitTypes');
    }

    getCommitStyle(): ConfigDefaults['commitStyle'] {
        return this.get('commitStyle');
    }

    getMaxLength(): number {
        return this.get('maxLength');
    }

    shouldAutoStage(): boolean {
        return this.get('autoStage');
    }

    shouldShowAnalysis(): boolean {
        return this.get('showAnalysis');
    }

    getCustomTemplate(): string {
        return this.get('customTemplate');
    }
}

export { Config };
