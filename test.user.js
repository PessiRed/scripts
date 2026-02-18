
// ==UserScript==
// @name         OpenReader - 69shuba Sync
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Sync highlights to specialized web_annotations table
// @author       OpenReader
// @match        https://www.69shuba.com/*
// @connect      openreader-api.pessired.workers.dev
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const API_URL = 'https://openreader-api.pessired.workers.dev/api/web/sync';
    const TAGS_STORAGE_KEY = 'openreader_tags';

    // --- State ---
    let currentTags = [];
    let lastSelectedText = "";

    function uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function parseTitle() {
        const parts = document.title.split(/[_\-]/);
        if (parts.length === 0) return null;
        const bookName = parts[0].trim();
        const fullChapterTitle = parts.length > 1 ? parts[1].trim() : "Unknown";
        const match = fullChapterTitle.match(/第(\d+)章/);
        const chapterIndex = match ? parseInt(match[1], 10) : 0;
        return { bookName, chapterTitle: fullChapterTitle, chapterIndex };
    }

    function createUI() {
        const panel = document.createElement('div');
        panel.id = 'openreader-panel';
        panel.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            width: 90%; max-width: 600px; padding: 12px; z-index: 2147483647;
            background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            border: 2px solid #2563eb; border-radius: 16px;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2); display: flex; flex-direction: column; gap: 10px;
            font-family: -apple-system, BlinkMacSystemFont; transition: all 0.3s ease;
        `;

        const statusArea = document.createElement('div');
        statusArea.id = 'or-status';
        statusArea.style.cssText = 'font-size: 12px; color: #666; text-align: center; height: 20px;';
        statusArea.innerText = 'OpenReader Ready';
        panel.appendChild(statusArea);

        const tagsContainer = document.createElement('div');
        tagsContainer.id = 'or-tags';
        tagsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;';
        panel.appendChild(tagsContainer);

        const controls = document.createElement('div');
        controls.style.cssText = 'display: flex; justify-content: center; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.05);';
        const addTagBtn = createSimpleButton('+', () => {
            const name = prompt('New tag:');
            if (name) { addTag(name); renderTags(); }
        });
        controls.appendChild(addTagBtn);
        panel.appendChild(controls);

        document.body.appendChild(panel);
        loadTags();
        renderTags();

        document.addEventListener('selectionchange', () => {
            const s = window.getSelection();
            if (s && !s.isCollapsed) {
                lastSelectedText = s.toString();
                updateStatus(true);
            }
        });

        // iOS Specific: Capture on touchend
        document.addEventListener('touchend', () => {
            setTimeout(() => {
                const s = window.getSelection();
                if (s && !s.isCollapsed) {
                    lastSelectedText = s.toString();
                    updateStatus(true);
                }
            }, 50);
        }, true);
    }

    function createSimpleButton(text, onClick) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.style.cssText = 'padding: 6px 15px; border-radius: 20px; border: none; background: #f3f4f6; color: #374151; cursor: pointer;';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });
        return btn;
    }

    function createTagButton(tag) {
        const container = document.createElement('div');
        container.style.cssText = `background: ${tag.id === 'null' ? '#f9fafb' : '#eff6ff'}; border-radius: 20px; display: inline-flex; align-items: center; overflow: hidden;`;

        const btn = document.createElement('button');
        btn.innerText = tag.name;
        btn.style.cssText = `padding: 6px 12px; border: none; background: transparent; color: ${tag.id === 'null' ? '#4b5563' : '#2563eb'}; font-size: 13px; font-weight: 500; cursor: pointer;`;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleTagClick(tag);
        });
        container.appendChild(btn);

        if (tag.id !== 'null') {
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '&times;';
            delBtn.style.cssText = 'padding: 6px 8px; border: none; background: transparent; color: #9ca3af; cursor: pointer;';
            delBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('Delete locally?')) { removeTag(tag.id); renderTags(); }
            });
            container.appendChild(delBtn);
        }
        return container;
    }

    function loadTags() {
        const stored = localStorage.getItem(TAGS_STORAGE_KEY);
        currentTags = stored ? JSON.parse(stored) : [];
    }

    function addTag(name) {
        currentTags.push({ id: uuidv4(), name: name });
        localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(currentTags));
    }

    function removeTag(id) {
        currentTags = currentTags.filter(t => t.id !== id);
        localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(currentTags));
    }

    function renderTags() {
        const c = document.getElementById('or-tags');
        if (!c) return;
        c.innerHTML = '';
        c.appendChild(createTagButton({ id: 'null', name: 'Default' }));
        currentTags.forEach(tag => c.appendChild(createTagButton(tag)));
    }

    function updateStatus(hasSelection = false) {
        const s = window.getSelection();
        const el = document.getElementById('or-status');
        if (!el) return;
        if (hasSelection || (s && !s.isCollapsed)) {
            el.innerText = 'Captured! Ready to sync';
            el.style.color = '#10b981';
        } else {
            el.innerText = 'OpenReader Ready';
            el.style.color = '#666';
        }
    }

    async function handleTagClick(tag) {
        let exact = lastSelectedText || window.getSelection().toString();

        if (!exact) {
            exact = prompt('No selection found. Type manually:', '');
            if (exact === null) return;
        }

        const bookInfo = parseTitle();
        if (!bookInfo) {
            alert('Debug Error: Failed to parse title from ' + document.title);
            return;
        }

        // Context extraction
        let prefix = "";
        let suffix = "";
        try {
            const contentDiv = document.querySelector('.txtnav') || document.body;
            const allText = contentDiv.innerText;
            const totalIndex = allText.indexOf(exact);
            if (totalIndex !== -1) {
                prefix = totalIndex > 30 ? allText.substring(totalIndex - 30, totalIndex) : allText.substring(0, totalIndex);
                suffix = allText.substring(totalIndex + exact.length, totalIndex + exact.length + 30);
            }
        } catch (e) { console.warn('Context extraction failed', e); }

        const annotation = {
            id: uuidv4(),
            book_title: bookInfo.bookName,
            chapter_index: bookInfo.chapterIndex,
            chapter_title: bookInfo.chapterTitle,
            tag_name: tag.id === 'null' ? null : tag.name,
            quote: { exact, prefix, suffix },
            created_at: Date.now()
        };

        alert('Step 2: Payload ready, sending to ' + API_URL); // Step 2: Payload Check

        try {
            await uploadData({ annotations: [annotation] });
            alert('SYNC SUCCESS ✅');
            lastSelectedText = "";
            updateStatus(false);
            if (window.getSelection) window.getSelection().removeAllRanges();
        } catch (e) {
            alert('SYNC FAILED: ' + e.message);
        }
    }

    function uploadData(data) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify(data);

            // Try GM_xmlhttpRequest if available (bypasses some CORS restrictions)
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                try {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: API_URL,
                        headers: { 'Content-Type': 'application/json' },
                        data: payload,
                        onload: (res) => {
                            if (res.status >= 200 && res.status < 300) resolve();
                            else reject(new Error('Server Status ' + res.status + ': ' + res.responseText));
                        },
                        onerror: (err) => reject(new Error('XHR Error: ' + JSON.stringify(err))),
                        ontimeout: () => reject(new Error('XHR Timeout'))
                    });
                    return;
                } catch (e) { console.warn('GM_xmlhttpRequest failed, falling back to fetch', e); }
            }

            // Fallback to standard fetch
            fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                mode: 'cors',
                body: payload
            })
                .then(res => {
                    if (res.ok) resolve();
                    else res.text().then(txt => reject(new Error('Fetch Status ' + res.status + ': ' + txt)));
                })
                .catch(err => reject(new Error('Fetch Error: ' + err.message)));
        });
    }

    function showToast(msg, type) {
        const el = document.getElementById('or-status');
        if (!el) return;
        el.innerText = msg;
        el.style.color = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#2563eb');
        setTimeout(() => { el.innerText = 'OpenReader Ready'; el.style.color = '#666'; }, 2000);
    }

    if (document.body) createUI();
    else window.addEventListener('DOMContentLoaded', createUI);

})();
