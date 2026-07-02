document.addEventListener('DOMContentLoaded', () => {
    // State
    let allReleaseNotes = [];
    let filteredReleaseNotes = [];
    let activeCategory = 'all';
    let searchQuery = '';
    let selectedNote = null;
    let addedTags = new Set(['#BigQuery', '#GoogleCloud']);

    // DOM Elements
    const elements = {
        refreshBtn: document.getElementById('refreshBtn'),
        syncIcon: document.getElementById('syncIcon'),
        syncStatus: document.getElementById('syncStatus'),
        syncStatusText: document.getElementById('syncStatusText'),
        searchInput: document.getElementById('searchInput'),
        clearSearchBtn: document.getElementById('clearSearchBtn'),
        categoryFilters: document.getElementById('categoryFilters'),
        
        // Stats
        statTotalDays: document.getElementById('statTotalDays'),
        statTotalItems: document.getElementById('statTotalItems'),
        lastSyncTime: document.getElementById('lastSyncTime'),
        
        // Category counts
        countAll: document.getElementById('countAll'),
        countFeature: document.getElementById('countFeature'),
        countChange: document.getElementById('countChange'),
        countFix: document.getElementById('countFix'),
        countDeprecated: document.getElementById('countDeprecated'),
        
        // Layout Sections
        skeletonLoader: document.getElementById('skeletonLoader'),
        errorState: document.getElementById('errorState'),
        errorMsgText: document.getElementById('errorMsgText'),
        errorRetryBtn: document.getElementById('errorRetryBtn'),
        emptyState: document.getElementById('emptyState'),
        resetFiltersBtn: document.getElementById('resetFiltersBtn'),
        timelineContainer: document.getElementById('timelineContainer'),
        
        // Modal
        tweetModal: document.getElementById('tweetModal'),
        closeModalBtn: document.getElementById('closeModalBtn'),
        tweetPreviewText: document.getElementById('tweetPreviewText'),
        tweetEditText: document.getElementById('tweetEditText'),
        charCounter: document.getElementById('charCounter'),
        charIndicatorBar: document.getElementById('charIndicatorBar'),
        hashtagChips: document.querySelectorAll('.hashtag-chip'),
        copyTweetBtn: document.getElementById('copyTweetBtn'),
        copyText: document.getElementById('copyText'),
        copyIcon: document.getElementById('copyIcon'),
        postTweetBtn: document.getElementById('postTweetBtn'),
        
        // Toast
        toastNotification: document.getElementById('toastNotification'),
        toastMessage: document.getElementById('toastMessage')
    };

    // Helper: Strip HTML tags for Tweet formatting
    function stripHtml(htmlStr) {
        let doc = new DOMParser().parseFromString(htmlStr, 'text/html');
        return doc.body.textContent || "";
    }

    // Helper: Format relative timestamp
    function formatTime(isoString) {
        if (!isoString) return 'Never';
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString();
    }

    // Helper: Toast notification display
    function showToast(message, isError = false) {
        elements.toastMessage.textContent = message;
        elements.toastNotification.className = 'toast-notification';
        if (isError) {
            elements.toastNotification.style.background = 'var(--color-deprecated)';
            elements.toastNotification.style.boxShadow = '0 10px 25px rgba(248, 113, 113, 0.3)';
            elements.toastNotification.querySelector('i').className = 'fa-solid fa-circle-xmark toast-icon';
        } else {
            elements.toastNotification.style.background = '';
            elements.toastNotification.style.boxShadow = '';
            elements.toastNotification.querySelector('i').className = 'fa-solid fa-circle-check toast-icon';
        }
        elements.toastNotification.classList.remove('hidden');
        
        setTimeout(() => {
            elements.toastNotification.classList.add('hidden');
        }, 3000);
    }

    // Fetch Release Notes from Flask API
    async function fetchReleaseNotes(forceRefresh = false) {
        showLoadingState();
        
        const url = `/api/release-notes${forceRefresh ? '?refresh=true' : ''}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            
            if (result.status === 'success' || result.status === 'partial_error') {
                allReleaseNotes = result.data;
                
                // Show toast warning if it's a partial error (network fell back to cache)
                if (result.status === 'partial_error') {
                    showToast(result.message, true);
                    updateSyncIndicator('error', 'Sync Failed (Offline)');
                } else {
                    updateSyncIndicator('live', 'Synchronized');
                }
                
                updateStats(result.last_fetched);
                applyFiltersAndRender();
            } else {
                throw new Error(result.message || 'Unknown error occurred.');
            }
        } catch (error) {
            console.error('Fetch error:', error);
            showErrorState(error.message);
            updateSyncIndicator('error', 'Connection Error');
        }
    }

    // Update Sync indicator bar
    function updateSyncIndicator(type, label) {
        elements.syncStatus.className = 'sync-status';
        const indicator = elements.syncStatus.querySelector('.status-indicator');
        
        indicator.className = 'status-indicator';
        if (type === 'live') {
            indicator.classList.add('status-live');
        } else if (type === 'syncing') {
            indicator.classList.add('status-syncing');
        } else {
            indicator.classList.add('status-error');
        }
        
        elements.syncStatusText.textContent = label;
    }

    // Show loading state
    function showLoadingState() {
        elements.skeletonLoader.classList.remove('hidden');
        elements.errorState.classList.add('hidden');
        elements.emptyState.classList.add('hidden');
        elements.timelineContainer.classList.add('hidden');
        
        elements.refreshBtn.disabled = true;
        elements.syncIcon.classList.add('spin');
        updateSyncIndicator('syncing', 'Syncing feed...');
    }

    // Show error state
    function showErrorState(errorMsg) {
        elements.skeletonLoader.classList.add('hidden');
        elements.timelineContainer.classList.add('hidden');
        elements.emptyState.classList.add('hidden');
        
        elements.errorMsgText.textContent = errorMsg || 'We were unable to load the release notes feed. Please verify the URL or try syncing again.';
        elements.errorState.classList.remove('hidden');
        
        elements.refreshBtn.disabled = false;
        elements.syncIcon.classList.remove('spin');
    }

    // Calculate & update dashboard statistics
    function updateStats(lastFetchedTime) {
        elements.refreshBtn.disabled = false;
        elements.syncIcon.classList.remove('spin');
        elements.lastSyncTime.textContent = formatTime(lastFetchedTime);
        
        let totalItems = 0;
        let catCounts = { Feature: 0, Change: 0, Fix: 0, Deprecated: 0 };
        
        allReleaseNotes.forEach(day => {
            totalItems += day.items.length;
            day.items.forEach(item => {
                if (catCounts[item.type] !== undefined) {
                    catCounts[item.type]++;
                }
            });
        });
        
        elements.statTotalDays.textContent = allReleaseNotes.length;
        elements.statTotalItems.textContent = totalItems;
        
        elements.countAll.textContent = totalItems;
        elements.countFeature.textContent = catCounts.Feature;
        elements.countChange.textContent = catCounts.Change;
        elements.countFix.textContent = catCounts.Fix;
        elements.countDeprecated.textContent = catCounts.Deprecated;
    }

    // Apply Filter & Search logic, then call render
    function applyFiltersAndRender() {
        filteredReleaseNotes = [];
        
        allReleaseNotes.forEach(day => {
            const filteredItems = day.items.filter(item => {
                // Category filter
                const matchesCategory = activeCategory === 'all' || item.type.toLowerCase() === activeCategory.toLowerCase();
                
                // Search query filter
                let matchesSearch = true;
                if (searchQuery.trim() !== '') {
                    const textContent = (item.type + ' ' + stripHtml(item.body) + ' ' + day.date).toLowerCase();
                    matchesSearch = textContent.includes(searchQuery.toLowerCase());
                }
                
                return matchesCategory && matchesSearch;
            });
            
            if (filteredItems.length > 0) {
                filteredReleaseNotes.push({
                    ...day,
                    items: filteredItems
                });
            }
        });
        
        renderTimeline();
    }

    // Render timeline items dynamically
    function renderTimeline() {
        elements.skeletonLoader.classList.add('hidden');
        
        if (filteredReleaseNotes.length === 0) {
            elements.timelineContainer.classList.add('hidden');
            elements.emptyState.classList.remove('hidden');
            return;
        }
        
        elements.emptyState.classList.add('hidden');
        elements.timelineContainer.innerHTML = '';
        
        filteredReleaseNotes.forEach(day => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'timeline-group';
            
            const dateHeader = document.createElement('h3');
            dateHeader.className = 'timeline-date-title';
            dateHeader.innerHTML = `<i class="fa-regular fa-calendar-days"></i> ${day.formatted_date}`;
            groupDiv.appendChild(dateHeader);
            
            const cardsList = document.createElement('div');
            cardsList.className = 'timeline-cards-list';
            
            day.items.forEach(item => {
                const cardDiv = document.createElement('div');
                cardDiv.className = 'release-card';
                
                // Header (Badge & Link)
                const headerDiv = document.createElement('div');
                headerDiv.className = 'card-header';
                
                const typeClass = `badge-${item.type.toLowerCase()}`;
                const iconClass = getTypeIcon(item.type);
                headerDiv.innerHTML = `
                    <span class="badge ${typeClass}">
                        <i class="${iconClass}"></i> ${item.type}
                    </span>
                    ${day.link ? `
                        <a href="${day.link}" target="_blank" rel="noopener noreferrer" class="card-source-link" title="Open source Google Cloud documentation">
                            docs.cloud.google.com <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </a>
                    ` : ''}
                `;
                cardDiv.appendChild(headerDiv);
                
                // Body
                const bodyDiv = document.createElement('div');
                bodyDiv.className = 'card-body';
                bodyDiv.innerHTML = item.body;
                cardDiv.appendChild(bodyDiv);
                
                // Footer (Tweet button)
                const footerDiv = document.createElement('div');
                footerDiv.className = 'card-footer';
                
                const tweetBtn = document.createElement('button');
                tweetBtn.className = 'btn btn-secondary btn-card-tweet';
                tweetBtn.innerHTML = `<i class="fa-brands fa-x-twitter"></i> Prepare Tweet`;
                tweetBtn.addEventListener('click', () => openTweetModal(item, day));
                
                footerDiv.appendChild(tweetBtn);
                cardDiv.appendChild(footerDiv);
                
                cardsList.appendChild(cardDiv);
            });
            
            groupDiv.appendChild(cardsList);
            elements.timelineContainer.appendChild(groupDiv);
        });
        
        elements.timelineContainer.classList.remove('hidden');
    }

    // Get specific icon for update type
    function getTypeIcon(type) {
        switch(type) {
            case 'Feature': return 'fa-solid fa-cube';
            case 'Change': return 'fa-solid fa-sliders';
            case 'Fix': return 'fa-solid fa-wrench';
            case 'Deprecated': return 'fa-solid fa-ban';
            default: return 'fa-solid fa-circle-info';
        }
    }

    // --- TWEET COMPOSER MODAL LOGIC ---
    
    function openTweetModal(item, day) {
        selectedNote = { item, day };
        
        // Reset hashtag chip UI states
        elements.hashtagChips.forEach(chip => {
            const tag = chip.dataset.tag;
            if (addedTags.has(tag)) {
                chip.classList.add('added');
            } else {
                chip.classList.remove('added');
            }
        });
        
        generateDraftText();
        
        // Show modal with animation trigger
        elements.tweetModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeTweetModal() {
        elements.tweetModal.classList.add('hidden');
        document.body.style.overflow = '';
        selectedNote = null;
        
        // Reset copy button feedback
        elements.copyText.textContent = 'Copy Clipboard';
        elements.copyIcon.className = 'fa-regular fa-copy';
    }

    // Strip HTML, smart summarize, add tags and link to form standard tweet draft
    function generateDraftText() {
        if (!selectedNote) return;
        
        const { item, day } = selectedNote;
        const plainText = stripHtml(item.body);
        
        const tagString = Array.from(addedTags).join(' ');
        const dateStr = day.date;
        const typeStr = item.type;
        
        // Link to release note anchor
        const linkStr = day.link || 'https://cloud.google.com/bigquery/docs/release-notes';
        
        // Calculate max description length based on dynamic fields
        // 280 (Twitter limit) - template boilerplate - tag string length - link length (~23 characters reserved by Twitter)
        const placeholderLinkLength = 23;
        const templateHeader = `📢 BigQuery ${typeStr} (${dateStr}):\n\n`;
        const templateFooter = `\n\nRead more: ${linkStr}\n${tagString}`;
        
        const boilerplateLength = templateHeader.length + 12 + placeholderLinkLength + tagString.length; // 12 extra safety characters
        const maxDescLength = 280 - boilerplateLength;
        
        let truncatedDesc = plainText;
        if (plainText.length > maxDescLength) {
            truncatedDesc = plainText.substring(0, maxDescLength - 3).trim() + '...';
        }
        
        const tweetText = `📢 BigQuery ${typeStr} (${dateStr}):\n\n"${truncatedDesc}"\n\nRead more: ${linkStr}\n\n${tagString}`;
        
        elements.tweetEditText.value = tweetText;
        updateTweetPreviewAndCounter();
    }

    // Sync live preview card and update character limits
    function updateTweetPreviewAndCounter() {
        const text = elements.tweetEditText.value;
        
        // Replace links visually in preview to mimic Twitter length
        let previewHtml = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/(https?:\/\/[^\s]+)/g, '<span class="tweet-link">$1</span>')
            .replace(/(#[a-zA-Z0-9_]+)/g, '<span class="tweet-hashtag">$1</span>');
            
        elements.tweetPreviewText.innerHTML = previewHtml;
        
        // Twitter character counter counts any URL as 23 chars
        const twitterCharCount = getTwitterCharCount(text);
        
        elements.charCounter.textContent = `${twitterCharCount}/280`;
        
        // Update circular/percentage indicator
        const percentage = Math.min((twitterCharCount / 280) * 100, 100);
        elements.charIndicatorBar.style.width = `${percentage}%`;
        
        // Visual warning states
        elements.charCounter.className = 'char-counter';
        elements.charIndicatorBar.className = 'char-indicator-bar-fill';
        
        if (twitterCharCount > 280) {
            elements.charCounter.classList.add('danger');
            elements.charIndicatorBar.classList.add('danger');
            elements.postTweetBtn.disabled = true;
        } else if (twitterCharCount >= 260) {
            elements.charCounter.classList.add('warning');
            elements.charIndicatorBar.classList.add('warning');
            elements.postTweetBtn.disabled = false;
        } else {
            elements.postTweetBtn.disabled = false;
        }
    }

    // Helper: Twitter counts any URL as exactly 23 characters
    function getTwitterCharCount(str) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = str.match(urlRegex) || [];
        
        let length = str.replace(urlRegex, '').length;
        length += urls.length * 23;
        
        return length;
    }

    // --- EVENT LISTENERS ---

    // Sync Buttons
    elements.refreshBtn.addEventListener('click', () => fetchReleaseNotes(true));
    elements.errorRetryBtn.addEventListener('click', () => fetchReleaseNotes(true));

    // Category Buttons
    elements.categoryFilters.addEventListener('click', (e) => {
        const filterBtn = e.target.closest('.filter-btn');
        if (!filterBtn) return;
        
        // Remove active state from all
        elements.categoryFilters.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        
        // Add to active
        filterBtn.classList.add('active');
        activeCategory = filterBtn.dataset.type;
        
        applyFiltersAndRender();
    });

    // Search Input
    elements.searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        if (searchQuery.trim() !== '') {
            elements.clearSearchBtn.style.display = 'block';
        } else {
            elements.clearSearchBtn.style.display = 'none';
        }
        applyFiltersAndRender();
    });

    // Clear Search
    elements.clearSearchBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        searchQuery = '';
        elements.clearSearchBtn.style.display = 'none';
        elements.searchInput.focus();
        applyFiltersAndRender();
    });

    // Reset Filters from Empty state
    elements.resetFiltersBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        searchQuery = '';
        elements.clearSearchBtn.style.display = 'none';
        
        elements.categoryFilters.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        elements.btnFilterAll.classList.add('active');
        activeCategory = 'all';
        
        applyFiltersAndRender();
    });

    // Modal Close
    elements.closeModalBtn.addEventListener('click', closeTweetModal);
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) closeTweetModal();
    });

    // Live edit text area update
    elements.tweetEditText.addEventListener('input', updateTweetPreviewAndCounter);

    // Hashtag Chip toggle action
    elements.hashtagChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const tag = chip.dataset.tag;
            if (addedTags.has(tag)) {
                addedTags.delete(tag);
                chip.classList.remove('added');
            } else {
                addedTags.add(tag);
                chip.classList.add('added');
            }
            generateDraftText();
        });
    });

    // Copy to Clipboard
    elements.copyTweetBtn.addEventListener('click', async () => {
        const text = elements.tweetEditText.value;
        try {
            await navigator.clipboard.writeText(text);
            
            // Visual success indicator
            elements.copyText.textContent = 'Copied!';
            elements.copyIcon.className = 'fa-solid fa-circle-check';
            showToast('Tweet content copied to clipboard!');
            
            setTimeout(() => {
                elements.copyText.textContent = 'Copy Clipboard';
                elements.copyIcon.className = 'fa-regular fa-copy';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            showToast('Unable to copy. Please select and copy manually.', true);
        }
    });

    // Post to Twitter/X Intent
    elements.postTweetBtn.addEventListener('click', () => {
        const text = elements.tweetEditText.value;
        const encodedText = encodeURIComponent(text);
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
        window.open(twitterUrl, '_blank', 'noopener,noreferrer');
        closeTweetModal();
        showToast('Redirected to X (Twitter) draft composer!');
    });

    // Initial feed fetch
    fetchReleaseNotes(false);
});
