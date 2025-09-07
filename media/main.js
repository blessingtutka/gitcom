const vscode = acquireVsCodeApi();
        
// Utility function for HTML escaping
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Define all functions immediately to ensure they're available for onclick handlers
function generateCommit() {
    try {
        console.log('generateCommit called');
        vscode.postMessage({ command: 'generateCommit' });
    } catch (error) {
        console.error('Error in generateCommit:', error);
    }
}

function generateLegacyCommit() {
    try {
        console.log('generateLegacyCommit called');
        vscode.postMessage({ command: 'generateLegacyCommit' });
    } catch (error) {
        console.error('Error in generateLegacyCommit:', error);
    }
}

function resetIntelligentCommitSettings() {
    try {
        console.log('resetIntelligentCommitSettings called');
        if (confirm('Reset all intelligent commit settings to defaults? This cannot be undone.')) {
            vscode.postMessage({ command: 'resetIntelligentCommitSettings' });
        }
    } catch (error) {
        console.error('Error in resetIntelligentCommitSettings:', error);
    }
}

function executeCommitPlan() {
    try {
        console.log('executeCommitPlan called');
        vscode.postMessage({ command: 'executeCommitPlan' });
    } catch (error) {
        console.error('Error in executeCommitPlan:', error);
    }
}

function cancelCommitPlan() {
    try {
        console.log('cancelCommitPlan called');
        vscode.postMessage({ command: 'cancelCommitPlan' });
    } catch (error) {
        console.error('Error in cancelCommitPlan:', error);
    }
}

function closeError() {
    try {
        const errorDisplay = document.getElementById('errorDisplay');
        if (errorDisplay) errorDisplay.style.display = 'none';
    } catch (error) {
        console.error('Error in closeError:', error);
    }
}

function closeSuccess() {
    try {
        const successDisplay = document.getElementById('successDisplay');
        if (successDisplay) successDisplay.style.display = 'none';
    } catch (error) {
        console.error('Error in closeSuccess:', error);
    }
}

function pushCommits() {
    try {
        vscode.postMessage({ command: 'pushCommits' });
    } catch (error) {
        console.error('Error in pushCommits:', error);
    }
}

function removeCommit(index) {
    try {
        vscode.postMessage({ command: 'removeCommit', index: index });
    } catch (error) {
        console.error('Error in removeCommit:', error);
    }
}

function editCommit(index) {
    try {
        if (currentData && currentData.commitHistory && currentData.commitHistory[index]) {
            const newMessage = prompt('Edit commit message:', currentData.commitHistory[index].message);
            if (newMessage && newMessage !== currentData.commitHistory[index].message) {
                vscode.postMessage({ command: 'editCommit', index: index, newMessage: newMessage });
            }
        }
    } catch (error) {
        console.error('Error in editCommit:', error);
    }
}

function editCommitMessage(groupId, currentMessage) {
    try {
        const newMessage = prompt('Edit commit message:', currentMessage);
        if (newMessage && newMessage !== currentMessage) {
            vscode.postMessage({ 
                command: 'editCommitMessage', 
                groupId: groupId, 
                newMessage: newMessage 
            });
        }
    } catch (error) {
        console.error('Error in editCommitMessage:', error);
    }
}

function removeFileFromGroup(filePath, groupId) {
    try {
        vscode.postMessage({ 
            command: 'removeFileFromGroup', 
            filePath: filePath, 
            groupId: groupId 
        });
    } catch (error) {
        console.error('Error in removeFileFromGroup:', error);
    }
}

// Make all functions globally available for onclick handlers
window.generateCommit = generateCommit;
window.generateLegacyCommit = generateLegacyCommit;
window.resetIntelligentCommitSettings = resetIntelligentCommitSettings;
window.executeCommitPlan = executeCommitPlan;
window.cancelCommitPlan = cancelCommitPlan;
window.closeError = closeError;
window.closeSuccess = closeSuccess;
window.pushCommits = pushCommits;
window.removeCommit = removeCommit;
window.editCommit = editCommit;
window.editCommitMessage = editCommitMessage;
window.removeFileFromGroup = removeFileFromGroup;



let currentData = {
    settings: {
        commitStyle: 'conventional',
        detailLevel: 'normal',
        maxLength: 72,
        autoStage: true,
        batchCommits: false
    },
    commitHistory: [],
    unpushedCount: 0,
    commitPlan: null,
    isAnalyzing: false,
    analysisProgress: { phase: '', message: '', progress: 0 }
};

// Signal that webview is ready
window.addEventListener('load', () => {
    console.log('GitCom webview loaded successfully');
    console.log('Available functions:', Object.keys(window).filter(key => typeof window[key] === 'function' && key.includes('Commit')));
    
    vscode.postMessage({ command: 'ready' });
});

// Also send ready message immediately in case load event already fired
setTimeout(() => {
    console.log('GitCom webview sending delayed ready message');
    vscode.postMessage({ command: 'ready' });
}, 100);

// Add error handler for uncaught errors
window.addEventListener('error', (event) => {
    console.error('GitCom webview error:', event.error);
    console.error('Error details:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
});

// Listen for messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'update') {
        currentData = message.data;
        updateUI();
    } else if (message.command === 'showError') {
        showError(message.error);
    } else if (message.command === 'showSuccess') {
        showSuccess(message.success);
    }
});

function updateUI() {
    try {
        console.log('Updating UI with data:', currentData);
        
        // Update settings with fallbacks
        const settings = currentData.settings || {};
        const commitStyleEl = document.getElementById('commitStyle');
        const detailLevelEl = document.getElementById('detailLevel');
        const maxLengthEl = document.getElementById('maxLength');
        const autoStageEl = document.getElementById('autoStage');
        const batchCommitsEl = document.getElementById('batchCommits');
        const enableIntelligentCommitsEl = document.getElementById('enableIntelligentCommits');
        const maxFilesPerCommitEl = document.getElementById('maxFilesPerCommit');
        const groupingStrategyEl = document.getElementById('groupingStrategy');
        const separateTestCommitsEl = document.getElementById('separateTestCommits');
        const enableFeatureDetectionEl = document.getElementById('enableFeatureDetection');
        const enableBreakingChangeDetectionEl = document.getElementById('enableBreakingChangeDetection');
        const prioritizeFeaturesEl = document.getElementById('prioritizeFeatures');
        const maxCommitMessageLengthEl = document.getElementById('maxCommitMessageLength');
        
        if (commitStyleEl) commitStyleEl.value = settings.commitStyle || 'conventional';
        if (detailLevelEl) detailLevelEl.value = settings.detailLevel || 'normal';
        if (maxLengthEl) maxLengthEl.value = settings.maxLength || 72;
        if (autoStageEl) autoStageEl.checked = settings.autoStage !== false;
        if (batchCommitsEl) batchCommitsEl.checked = settings.batchCommits === true;
        if (enableIntelligentCommitsEl) enableIntelligentCommitsEl.checked = settings.enableIntelligentCommits !== false;
        if (maxFilesPerCommitEl) maxFilesPerCommitEl.value = settings.maxFilesPerCommit || 10;
        if (groupingStrategyEl) groupingStrategyEl.value = settings.groupingStrategy || 'intelligent';
        if (separateTestCommitsEl) separateTestCommitsEl.checked = settings.separateTestCommits !== false;
        if (enableFeatureDetectionEl) enableFeatureDetectionEl.checked = settings.enableFeatureDetection !== false;
        if (enableBreakingChangeDetectionEl) enableBreakingChangeDetectionEl.checked = settings.enableBreakingChangeDetection !== false;
        if (prioritizeFeaturesEl) prioritizeFeaturesEl.checked = settings.prioritizeFeatures !== false;
        if (maxCommitMessageLengthEl) maxCommitMessageLengthEl.value = settings.maxCommitMessageLength || 72;
        
        // Update button text and visibility based on intelligent commits setting
        const generateButton = document.getElementById('generateButton');
        const legacyButton = document.getElementById('legacyButton');
        
        if (generateButton && legacyButton) {
            if (settings.enableIntelligentCommits !== false) {
                generateButton.textContent = 'Generate Intelligent Commits';
                legacyButton.style.display = 'block';
            } else {
                generateButton.textContent = 'Generate AI Commit';
                legacyButton.style.display = 'none';
            }
        }
    
        // Update unpushed badge
        const unpushedBadge = document.getElementById('unpushedBadge');
        const pushButton = document.getElementById('pushButton');
        
        if (unpushedBadge && pushButton) {
            if (currentData.unpushedCount > 0) {
                unpushedBadge.textContent = currentData.unpushedCount + ' unpushed';
                unpushedBadge.style.display = 'inline';
                pushButton.disabled = false;
            } else {
                unpushedBadge.style.display = 'none';
                pushButton.disabled = true;
            }
        }
        
        // Update commit history
        updateCommitHistory();
        
        // Update analysis progress
        updateAnalysisProgress();
        
        // Update commit plan
        updateCommitPlan();
    } catch (error) {
        console.error('Error updating UI:', error);
    }
}

function updateCommitHistory() {
    const historyContainer = document.getElementById('commitHistory');
    
    if (!currentData.commitHistory || currentData.commitHistory.length === 0) {
        historyContainer.innerHTML = '<div class="empty-state">No commits generated yet. Use "Generate AI Commit" to get started.</div>';
        return;
    }
    
    historyContainer.innerHTML = currentData.commitHistory.map((commit, index) => 
        '<div class="commit-item">' +
            '<div class="commit-message">' + escapeHtml(commit.message) + '</div>' +
            '<div class="commit-meta">' +
                '<span>' + new Date(commit.timestamp).toLocaleString() + '</span>' +
                '<span class="status-badge ' + (commit.pushed ? 'pushed' : 'unpushed') + '">' +
                    (commit.pushed ? 'Pushed' : 'Unpushed') +
                '</span>' +
            '</div>' +
            '<div class="commit-actions">' +
                '<button class="small-button" onclick="editCommit(' + index + ')">Edit</button>' +
                '<button class="small-button" onclick="removeCommit(' + index + ')">Remove</button>' +
            '</div>' +
        '</div>'
    ).join('');
}

// Setting change handlers
document.getElementById('commitStyle').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.commitStyle', value: e.target.value });
});

document.getElementById('detailLevel').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.detailLevel', value: e.target.value });
});

document.getElementById('maxLength').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.maxLength', value: parseInt(e.target.value) });
});

document.getElementById('autoStage').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.autoStage', value: e.target.checked });
});

document.getElementById('batchCommits').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.batchCommits', value: e.target.checked });
});

document.getElementById('enableIntelligentCommits').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.enableIntelligentCommits', value: e.target.checked });
});

document.getElementById('maxFilesPerCommit').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.maxFilesPerCommit', value: parseInt(e.target.value) });
});

document.getElementById('groupingStrategy').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.groupingStrategy', value: e.target.value });
});

document.getElementById('separateTestCommits').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.separateTestCommits', value: e.target.checked });
});

document.getElementById('enableFeatureDetection').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.enableFeatureDetection', value: e.target.checked });
});

document.getElementById('enableBreakingChangeDetection').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.enableBreakingChangeDetection', value: e.target.checked });
});

document.getElementById('prioritizeFeatures').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.prioritizeFeatures', value: e.target.checked });
});

document.getElementById('maxCommitMessageLength').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateSetting', key: 'gitcom.maxCommitMessageLength', value: parseInt(e.target.value) });
});





function removeFileFromGroup(filePath, groupId) {
    if (confirm('Remove this file from the commit group?')) {
        vscode.postMessage({ 
            command: 'removeFileFromGroup', 
            filePath: filePath, 
            groupId: groupId 
        });
    }
}

function updateAnalysisProgress() {
    const progressSection = document.getElementById('analysisProgress');
    const generateButton = document.getElementById('generateButton');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const progressPhase = document.getElementById('progressPhase');
    const progressStep = document.getElementById('progressStep');
    const progressDetails = document.getElementById('progressDetails');
    
    if (currentData.isAnalyzing) {
        progressSection.style.display = 'block';
        generateButton.disabled = true;
        generateButton.textContent = 'Analyzing...';
        
        const progress = currentData.analysisProgress;
        
        if (progressFill) {
            progressFill.style.width = progress.progress + '%';
        }
        
        if (progressText) {
            progressText.textContent = progress.message;
        }
        
        if (progressPhase) {
            progressPhase.textContent = progress.phase || 'Processing';
        }
        
        if (progressStep && progress.details) {
            const details = progress.details;
            if (details.step && details.totalSteps) {
                progressStep.textContent = 'Step ' + details.step + ' of ' + details.totalSteps;
            }
        }
        
        if (progressDetails && progress.details) {
            const details = progress.details;
            let detailText = '';
            
            if (details.filesAnalyzed) {
                detailText = 'Analyzed ' + details.filesAnalyzed + ' files';
            } else if (details.groupsCreated) {
                detailText = 'Created ' + details.groupsCreated + ' commit groups';
            } else if (details.currentCommit && details.totalCommits) {
                detailText = 'Processing commit ' + details.currentCommit + '/' + details.totalCommits;
            } else if (details.currentAction) {
                detailText = details.currentAction.replace(/_/g, ' ');
            }
            
            progressDetails.textContent = detailText;
        }
    } else {
        progressSection.style.display = 'none';
        generateButton.disabled = false;
        generateButton.textContent = 'Generate AI Commit';
    }
}

function showError(errorInfo) {
    const errorDisplay = document.getElementById('errorDisplay');
    const errorTitle = document.getElementById('errorTitle');
    const errorMessage = document.getElementById('errorMessage');
    const errorDetails = document.getElementById('errorDetails');
    const errorActions = document.getElementById('errorActions');
    
    errorDisplay.style.display = 'block';
    
    if (errorTitle) {
        errorTitle.textContent = errorInfo.title || 'Error';
    }
    
    if (errorMessage) {
        errorMessage.textContent = errorInfo.message;
    }
    
    if (errorDetails && errorInfo.details) {
        errorDetails.style.display = 'block';
        errorDetails.textContent = JSON.stringify(errorInfo.details, null, 2);
    } else if (errorDetails) {
        errorDetails.style.display = 'none';
    }
    
    if (errorActions && errorInfo.suggestedActions) {
        errorActions.innerHTML = errorInfo.suggestedActions.map(action => 
            '<div class="error-action">' + escapeHtml(action) + '</div>'
        ).join('');
    }
    
    // Auto-hide after 10 seconds for non-critical errors
    if (!errorInfo.details || errorInfo.details.errorType !== 'critical') {
        setTimeout(() => {
            closeError();
        }, 10000);
    }
}

function showSuccess(successInfo) {
    const successDisplay = document.getElementById('successDisplay');
    const successMessage = document.getElementById('successMessage');
    const successDetails = document.getElementById('successDetails');
    
    successDisplay.style.display = 'block';
    
    if (successMessage) {
        successMessage.textContent = successInfo.message;
    }
    
    if (successDetails && successInfo.details) {
        let detailsHtml = '';
        
        if (successInfo.details.commits) {
            detailsHtml += '<div><strong>Commits:</strong> ' + successInfo.details.commits + '</div>';
        }
        
        if (successInfo.details.files) {
            detailsHtml += '<div><strong>Files:</strong> ' + successInfo.details.files + '</div>';
        }
        
        if (successInfo.details.estimatedTime) {
            detailsHtml += '<div><strong>Estimated Time:</strong> ' + successInfo.details.estimatedTime + '</div>';
        }
        
        if (successInfo.details.warnings && successInfo.details.warnings.length > 0) {
            detailsHtml += '<div><strong>Warnings:</strong> ' + successInfo.details.warnings.length + '</div>';
        }
        
        successDetails.innerHTML = detailsHtml;
    }
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        closeSuccess();
    }, 5000);
}



function toggleErrorDetails() {
    const errorDetails = document.getElementById('errorDetails');
    if (errorDetails.style.display === 'none') {
        errorDetails.style.display = 'block';
    } else {
        errorDetails.style.display = 'none';
    }
}

function updateCommitPlan() {
    const commitPlanSection = document.getElementById('commitPlanSection');
    
    if (currentData.commitPlan && currentData.commitPlan.groups.length > 0) {
        commitPlanSection.style.display = 'block';
        renderCommitPlanSummary();
        renderCommitGroups();
    } else {
        commitPlanSection.style.display = 'none';
    }
}

function renderCommitPlanSummary() {
    const summaryContainer = document.getElementById('commitPlanSummary');
    const plan = currentData.commitPlan;
    
    let warningsHtml = '';
    if (plan.warnings && plan.warnings.length > 0) {
        warningsHtml = plan.warnings.map(warning => 
            '<div class="warning-item">⚠️ ' + escapeHtml(warning) + '</div>'
        ).join('');
    }
    
    summaryContainer.innerHTML = 
        '<div class="summary-stats">' +
            '<div class="stat-item">' +
                '<div class="stat-value">' + plan.commitCount + '</div>' +
                '<div class="stat-label">Commits</div>' +
            '</div>' +
            '<div class="stat-item">' +
                '<div class="stat-value">' + plan.totalFiles + '</div>' +
                '<div class="stat-label">Files</div>' +
            '</div>' +
            '<div class="stat-item">' +
                '<div class="stat-value">' + Math.ceil(plan.estimatedTime / 60) + 'm</div>' +
                '<div class="stat-label">Est. Time</div>' +
            '</div>' +
        '</div>' +
        warningsHtml;
}

function renderCommitGroups() {
    const groupsContainer = document.getElementById('commitGroups');
    const groups = currentData.commitPlan.groups;
    
    groupsContainer.innerHTML = groups.map((group, index) => {
        const filesHtml = group.files.map(file => {
            const safeFilePath = escapeHtml(file.filePath).replace(/'/g, '&#39;');
            const safeGroupId = group.id.replace(/'/g, '&#39;');
            
            return '<div class="file-item">' +
                '<span class="file-change-type change-type-' + file.changeType + '">' + 
                    file.changeType.charAt(0).toUpperCase() +
                '</span>' +
                '<span class="file-path">' + escapeHtml(file.filePath) + '</span>' +
                '<span class="file-stats">+' + file.linesAdded + ' -' + file.linesRemoved + '</span>' +
                '<div class="file-actions">' +
                    '<button class="file-action-button" onclick="removeFileFromGroup(\'' + 
                        safeFilePath + '\', \'' + safeGroupId + '\')">Remove</button>' +
                '</div>' +
            '</div>';
        }).join('');
        
        const safeGroupId = group.id.replace(/'/g, '&#39;');
        const safeMessage = escapeHtml(group.message).replace(/'/g, '&#39;');
        
        return '<div class="commit-group">' +
            '<div class="commit-group-header">' +
                '<span class="commit-type-badge commit-type-' + group.type + '">' + group.type + '</span>' +
                '<div class="commit-message" onclick="editCommitMessage(\'' + safeGroupId + '\', \'' + 
                    safeMessage + '\')">' + escapeHtml(group.message) + '</div>' +
                '<div class="commit-group-stats">' + group.fileCount + ' files</div>' +
            '</div>' +
            '<div class="commit-group-files">' + filesHtml + '</div>' +
        '</div>';
    }).join('');
}
