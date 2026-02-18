
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
            background: rgba(255, 255, 255, 0.98); border: 2px solid #2563eb; border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); display: none; flex-direction: column; gap: 10px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        `;

        const tagsContainer = document.createElement('div');
        tagsContainer.id = 'or-tags';
        tagsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: center;';
        panel.appendChild(tagsContainer);

        document.body.appendChild(panel);
        loadTags();
        renderTags();

        const syncSelection = () => {
            const s = window.getSelection();
            if (s && !s.isCollapsed) {
                lastSelectedText = s.toString();
                panel.style.display = 'flex';
            } else {
                // Keep panel if it was just shown until user clicks outside or syncs
            }
        };

        document.addEventListener('selectionchange', syncSelection);
        document.addEventListener('touchend', () => setTimeout(syncSelection, 100), true);

        // Close on click outside
        document.addEventListener('mousedown', (e) => {
            if (!panel.contains(e.target)) {
                panel.style.display = 'none';
                lastSelectedText = "";
            }
        });
    }

    function createSimpleButton(text, onClick) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.type = 'button';
        btn.style.cssText = 'padding: 6px 12px; border-radius: 20px; border: 1px solid #d1d5db; background: #fff; color: #2563eb; font-weight: bold; cursor: pointer; font-size: 13px;';
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); onClick();
        });
        return btn;
    }

    function createTagButton(tag) {
        const container = document.createElement('div');
        container.style.cssText = 'background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 20px; display: inline-flex; align-items: center; overflow: hidden;';

        const btn = document.createElement('button');
        btn.innerText = tag.name;
        btn.type = 'button';
        btn.style.cssText = 'padding: 6px 12px; border: none; background: transparent; color: #2563eb; font-size: 13px; font-weight: bold; cursor: pointer;';
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); handleTagClick(tag);
        });
        container.appendChild(btn);

        if (tag.id !== 'null') {
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '&times;';
            delBtn.style.cssText = 'padding: 6px 8px; border: none; background: transparent; color: #9ca3af; cursor: pointer; font-size: 16px;';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation(); if (confirm('Del?')) { removeTag(tag.id); renderTags(); }
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

        // Add button at the beginning
        const addBtn = createSimpleButton('+', () => {
            const name = prompt('New tag:');
            if (name) { addTag(name); renderTags(); }
        });
        c.appendChild(addBtn);

        c.appendChild(createTagButton({ id: 'null', name: 'Default' }));
        currentTags.forEach(tag => c.appendChild(createTagButton(tag)));
    }

    async function handleTagClick(tag) {
        let exact = lastSelectedText || window.getSelection().toString();
        if (!exact) return;

        const bookInfo = parseTitle();
        if (!bookInfo) return;

        // Context extraction (helps OpenReader positioning)
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

        try {
            await uploadData({ annotations: [annotation] });
            // Cleanup on success
            const panel = document.getElementById('openreader-panel');
            if (panel) panel.style.display = 'none';
            lastSelectedText = "";
            if (window.getSelection) window.getSelection().removeAllRanges();
        } catch (e) {
            alert('SYNC FAILED: ' + e.message);
        }
    }

    function uploadData(data) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify(data);
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                try {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: API_URL,
                        headers: { 'Content-Type': 'application/json' },
                        data: payload,
                        onload: (res) => res.status >= 200 && res.status < 300 ? resolve() : reject(new Error('HTTP ' + res.status)),
                        onerror: () => reject(new Error('Network Error'))
                    });
                    return;
                } catch (e) { }
            }
            fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
                .then(res => res.ok ? resolve() : reject(new Error('Fetch ' + res.status)))
                .catch(err => reject(err));
        });
    }

    if (document.body) createUI();
    else window.addEventListener('DOMContentLoaded', createUI);

})();
