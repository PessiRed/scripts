
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

    function uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function parseTitle() {
        const titleParts = document.title.split('-');
        if (titleParts.length < 2) return null;
        const bookName = titleParts[0].trim();
        const fullChapterTitle = titleParts[1].trim();
        const match = fullChapterTitle.match(/第(\d+)章/);
        const chapterIndex = match ? parseInt(match[1], 10) : 0;
        return { bookName, chapterTitle: fullChapterTitle, chapterIndex };
    }

    function createUI() {
        const panel = document.createElement('div');
        panel.id = 'openreader-panel';
        panel.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            width: 90%; max-width: 600px; padding: 12px; z-index: 9999;
            background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 16px;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1); display: flex; flex-direction: column; gap: 10px;
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
        document.addEventListener('selectionchange', updateStatus);
    }

    function createSimpleButton(text, onClick) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.style.cssText = 'padding: 6px 15px; border-radius: 20px; border: none; background: #f3f4f6; color: #374151; cursor: pointer;';
        btn.onclick = onClick;
        return btn;
    }

    function createTagButton(tag) {
        const container = document.createElement('div');
        container.style.cssText = `background: ${tag.id === 'null' ? '#f9fafb' : '#eff6ff'}; border-radius: 20px; display: inline-flex; align-items: center; overflow: hidden;`;

        const btn = document.createElement('button');
        btn.innerText = tag.name;
        btn.style.cssText = `padding: 6px 12px; border: none; background: transparent; color: ${tag.id === 'null' ? '#4b5563' : '#2563eb'}; font-size: 13px; font-weight: 500; cursor: pointer;`;
        btn.onclick = () => handleTagClick(tag);
        container.appendChild(btn);

        if (tag.id !== 'null') {
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '&times;';
            delBtn.style.cssText = 'padding: 6px 8px; border: none; background: transparent; color: #9ca3af; cursor: pointer;';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Delete locally?')) { removeTag(tag.id); renderTags(); }
            };
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

    function updateStatus() {
        const s = window.getSelection();
        const el = document.getElementById('or-status');
        if (!el) return;
        if (s && !s.isCollapsed) {
            el.innerText = 'Click a tag to save selection';
            el.style.color = '#2563eb';
        } else {
            el.innerText = 'OpenReader Ready';
            el.style.color = '#666';
        }
    }

    async function handleTagClick(tag) {
        const s = window.getSelection();
        if (!s || s.isCollapsed) { showToast('Select text first', 'error'); return; }

        const exact = s.toString();
        const bookInfo = parseTitle();
        if (!bookInfo) return;

        // Context extraction
        const contentDiv = document.querySelector('.txtnav') || document.body;
        const allText = contentDiv.innerText;
        const totalIndex = allText.indexOf(exact);
        const prefix = totalIndex > 30 ? allText.substring(totalIndex - 30, totalIndex) : allText.substring(0, totalIndex);
        const suffix = allText.substring(totalIndex + exact.length, totalIndex + exact.length + 30);

        const annotation = {
            id: uuidv4(),
            book_title: bookInfo.bookName,
            chapter_index: bookInfo.chapterIndex,
            chapter_title: bookInfo.chapterTitle,
            tag_name: tag.id === 'null' ? null : tag.name,
            quote: { exact, prefix, suffix },
            created_at: Date.now()
        };

        showToast('Saving...', 'info');
        try {
            await uploadData({ annotations: [annotation] });
            showToast('Saved!', 'success');
            window.getSelection().removeAllRanges();
        } catch (e) {
            showToast('Failed', 'error');
        }
    }

    function uploadData(data) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: API_URL,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(data),
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        resolve();
                    } else {
                        console.error('Upload failed status:', res.status, res.responseText);
                        reject(new Error(res.statusText));
                    }
                },
                onerror: (err) => {
                    console.error('GM_xmlhttpRequest error:', err);
                    reject(err);
                }
            });
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
