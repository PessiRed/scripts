
// ==UserScript==
// @name         iOS Selection Popup
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在选中文字后显示自定义悬浮菜单 (iOS Safari 优化版)
// @author       Gemini
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --- 1. 样式注入 ---
    const style = document.createElement('style');
    style.textContent = `
        #ios-custom-popup {
            position: absolute;
            z-index: 2147483647;
            display: none;
            background: rgba(28, 28, 30, 0.9);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 0.5px solid rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            padding: 6px;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0;
            user-select: none;
            -webkit-user-select: none;
        }

        .popup-item {
            color: white;
            font-size: 14px;
            font-family: -apple-system, system-ui, sans-serif;
            padding: 6px 12px;
            border-radius: 6px;
            white-space: nowrap;
        }

        .popup-item:active {
            background: rgba(255, 255, 255, 0.1);
        }

        .popup-divider {
            width: 0.5px;
            height: 16px;
            background: rgba(255, 255, 255, 0.2);
        }
    `;
    document.head.appendChild(style);

    // --- 2. 创建弹窗元素 ---
    const popup = document.createElement('div');
    popup.id = 'ios-custom-popup';
    popup.innerHTML = `
        <div class="popup-item" id="popup-copy">拷贝</div>
        <div class="popup-divider"></div>
        <div class="popup-item" id="popup-search">查询</div>
        <div class="popup-divider"></div>
        <div class="popup-item" id="popup-custom">测试</div>
    `;
    document.body.appendChild(popup);

    let lastSelectedText = "";

    // --- 3. 核心逻辑：获取位置并显示 ---
    const updatePopupPosition = () => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText.length > 0) {
            lastSelectedText = selectedText;
            const range = selection.getRangeAt(0);
            const rects = range.getClientRects();

            // 获取选中区域的最上方矩形
            const rect = rects[0];

            popup.style.display = 'flex';

            // 延迟计算宽度以确保渲染
            const popupWidth = popup.offsetWidth;
            const popupHeight = popup.offsetHeight;

            // 计算位置：在选中文字上方
            let top = rect.top + window.scrollY - popupHeight - 12;
            let left = rect.left + window.scrollX + (rect.width / 2) - (popupWidth / 2);

            // 边界检查：防止超出屏幕
            if (left < 10) left = 10;
            if (left + popupWidth > window.innerWidth - 10) {
                left = window.innerWidth - popupWidth - 10;
            }
            if (top < window.scrollY + 10) {
                // 如果上方没空间，显示在文字下方
                top = rect.bottom + window.scrollY + 12;
            }

            popup.style.top = `${top}px`;
            popup.style.left = `${left}px`;

            // 触发动画
            requestAnimationFrame(() => {
                popup.style.opacity = '1';
            });
        } else {
            hidePopup();
        }
    };

    const hidePopup = () => {
        popup.style.opacity = '0';
        setTimeout(() => {
            if (popup.style.opacity === '0') {
                popup.style.display = 'none';
            }
        }, 200);
    };

    // --- 4. 事件监听 ---

    // iOS 必须监听 touchend，因为选择状态在 touch 结束时才稳定
    document.addEventListener('touchend', () => {
        // 稍微延迟，等待系统菜单和选择范围更新
        setTimeout(updatePopupPosition, 100);
    }, false);

    // 点击页面其他位置隐藏
    document.addEventListener('touchstart', (e) => {
        if (!popup.contains(e.target)) {
            hidePopup();
        }
    }, false);

    // 按钮功能实现
    document.getElementById('popup-copy').addEventListener('click', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(lastSelectedText).then(() => {
            alert('已拷贝: ' + lastSelectedText.substring(0, 20) + '...');
            hidePopup();
        });
    });

    document.getElementById('popup-search').addEventListener('click', (e) => {
        e.preventDefault();
        window.open(`https://www.google.com/search?q=${encodeURIComponent(lastSelectedText)}`, '_blank');
        hidePopup();
    });

    document.getElementById('popup-custom').addEventListener('click', (e) => {
        e.preventDefault();
        alert('脚本测试成功！选中长度：' + lastSelectedText.length);
        hidePopup();
    });

})();
