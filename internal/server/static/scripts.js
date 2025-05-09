// 全局变量（保持不变）
let root = '';
let pathName = '';
let playingVideo = '';
let videoID = '';
let playlistFlag = 0;
let playlistID = '';
let videoTm = null;
let videoEndingTm = null;
let currentFocus = null;
let allFiles = [];
let itemHeight = 50;
let visibleItemsCount = 10;
let lastFocusedIndex = 0;
let maxPlaylistIndex = 0;

const fileListContainer = document.getElementById('file-list-container');
const videoContainer = document.getElementById('video-container');
const virtualListContainer = document.getElementById('virtual-list-container');
const virtualListScroller = document.getElementById('virtual-list-scroller');
const fileList = document.getElementById('fileList');

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function getFileNameFromPath(path) {
    const parts = path.split('/');
    return parts[parts.length - 1];
}

function truncateFileName(name, maxLength = 50) {
    return name.length > maxLength ? name.substring(0, maxLength - 3) + '...' : name;
}

function createFileItem(file, index) {
    const truncatedName = truncateFileName(file.name);
    const escapedName = truncatedName.replace(/"/g, '&quot;'); // 防止 XSS
    if (file.is_dir) {
        return `
            <li class="file-item" tabindex="0" data-path="${file.path}" data-index="${index}" onclick="enterDir('${file.path}')">
                <span class="file-icon">📂</span>
                <span class="file-name">${escapedName}</span>
            </li>
        `;
    }
    const fileSize = file.size ? file.size : ''; // 确保 file.size 存在
    return `
        <li class="file-item" tabindex="0" data-path="${file.path}" data-index="${index}" onclick="openFile('${file.path}')">
            <span class="file-icon">📄</span>
            <span class="file-name">${escapedName}</span>
            <span class="file-size">${fileSize}</span>
        </li>
    `;
}

async function setVideoSrc(videoURL) {
    showLoading();
    try {
        document.getElementById('playingVideo').textContent = getFileNameFromPath(videoURL);
        const response = await fetch('/s-video-id', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                video_url: videoURL,
            }),
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        videoID = resp['video_id'];
        playingVideo = videoURL;
        player.src({ src: '/videos?file=' + videoID, type: 'video/mp4' });
        lastVideoTmReport = Math.floor(Date.now() / 1000);
        player.load();
        videoTm = !isNaN(resp['last_tm']) && resp['last_tm'] >= 0 ? resp['last_tm'] : null;
        videoEndingTm = !isNaN(resp['skip_ending_tm']) && resp['skip_ending_tm'] >= 0 ? resp['skip_ending_tm'] : null;

        const playPromise = player.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                if (videoTm !== null) {
                    player.currentTime(videoTm);
                    videoTm = null;
                }
                // 移除 player.focus()
            });
            playPromise.catch((error) => {
                console.warn('Autoplay failed:', error);
                Swal.fire({
                    title: '提示',
                    text: '请点击播放按钮开始视频',
                    icon: 'info',
                    confirmButtonText: '好的',
                });
                const playButton = document.createElement('button');
                playButton.textContent = '播放';
                playButton.tabIndex = 0;
                playButton.onclick = () => {
                    player.play().then(() => {
                        if (videoTm !== null) {
                            player.currentTime(videoTm);
                            videoTm = null;
                        }
                    });
                    playButton.remove();
                };
                videoContainer.appendChild(playButton);
                initFocus(videoContainer);
            });
        }
    } catch (error) {
        console.error('Error in setVideoSrc:', error);
        Swal.fire('错误', '无法获取文件，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

async function saveVideoTm(tm) {
    if (videoTm !== null) {
        return;
    }

    try {
        await fetch('/video/save-tm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                vid: videoID,
                tm: Math.floor(tm),
            }),
        });
    } catch (error) {
        console.error('save video tm failed:', videoID, tm, error);
    }
}

function updateItemHeight() {
    const sampleItem = fileList.querySelector('.file-item');
    if (sampleItem) {
        itemHeight = sampleItem.getBoundingClientRect().height;
        const itemWidth = sampleItem.getBoundingClientRect().width;
        const containerWidth = virtualListContainer.getBoundingClientRect().width;
        console.log('Updated itemHeight:', itemHeight, 'itemWidth:', itemWidth, 'containerWidth:', containerWidth);
        if (itemWidth > containerWidth) {
            console.warn('file-item width exceeds container width, may cause horizontal scrollbar', {
                itemWidth,
                containerWidth
            });
        }
    } else {
        itemHeight = 50;
        console.log('Using default itemHeight:', itemHeight);
    }
}

function renderVirtualList(scrollTriggered = false, targetIndex = null) {
    const scrollTop = virtualListContainer.scrollTop;
    const containerHeight = virtualListContainer.clientHeight;
    const containerWidth = virtualListContainer.clientWidth;
    visibleItemsCount = Math.ceil(containerHeight / itemHeight) + 2;
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(startIndex + visibleItemsCount, allFiles.length);

    console.log('RenderVirtualList:', {
        scrollTriggered,
        targetIndex,
        startIndex,
        endIndex,
        scrollTop,
        visibleItemsCount,
        allFilesLength: allFiles.length,
        lastFocusedIndex,
        containerWidth
    });

    // 设置 scroller 高度和宽度
    virtualListScroller.style.height = `${allFiles.length * itemHeight}px`;
    virtualListScroller.style.width = '100%';

    // 渲染可视区域的列表项
    let html = '';
    for (let i = startIndex; i < endIndex; i++) {
        html += createFileItem(allFiles[i], i);
    }
    fileList.innerHTML = html;

    // 调整 fileList 的位置和宽度
    fileList.style.top = `${startIndex * itemHeight}px`;
    fileList.style.width = '100%';

    // 恢复或设置焦点
    let targetItem = null;
    if (targetIndex !== null && targetIndex >= startIndex && targetIndex < endIndex) {
        // 优先处理 targetIndex
        targetItem = fileList.querySelector(`.file-item[data-index="${targetIndex}"]`);
        console.log('Attempting to focus targetIndex:', targetIndex, 'targetItem:', targetItem);
    } else if (targetIndex !== null) {
        // targetIndex 不在可视区域，调整滚动并重新渲染
        const newScrollTop = Math.min(targetIndex * itemHeight, (allFiles.length - visibleItemsCount) * itemHeight);
        console.log('Target index not rendered, adjusting scrollTop:', newScrollTop);
        virtualListContainer.scrollTop = newScrollTop;
        requestAnimationFrame(() => {
            renderVirtualList(false, targetIndex);
        });
        return; // 提前返回，避免后续焦点逻辑
    } else if (scrollTriggered && lastFocusedIndex >= startIndex && lastFocusedIndex < endIndex) {
        // 滚动触发时恢复 lastFocusedIndex
        targetItem = fileList.querySelector(`.file-item[data-index="${lastFocusedIndex}"]`);
        console.log('Restoring lastFocusedIndex on scroll:', lastFocusedIndex, 'targetItem:', targetItem);
    } else if (currentFocus && currentFocus.classList.contains('file-item')) {
        // 最后尝试恢复 currentFocus
        const currentIndex = parseInt(currentFocus.dataset.index, 10);
        if (currentIndex >= startIndex && currentIndex < endIndex) {
            targetItem = fileList.querySelector(`.file-item[data-index="${currentIndex}"]`);
            console.log('Restoring currentIndex:', currentIndex, 'targetItem:', targetItem);
        }
    }

    if (targetItem && targetItem !== document.activeElement) {
        requestAnimationFrame(() => {
            targetItem.focus();
            currentFocus = targetItem;
            lastFocusedIndex = parseInt(targetItem.dataset.index, 10);
            ensureVisible(targetItem);
            console.log('Focused targetItem:', targetItem.dataset.index);
        });
    } else if (scrollTriggered && !targetItem && lastFocusedIndex < allFiles.length) {
        const firstVisibleItem = fileList.querySelector(`.file-item[data-index="${startIndex}"]`);
        if (firstVisibleItem) {
            requestAnimationFrame(() => {
                firstVisibleItem.focus();
                currentFocus = firstVisibleItem;
                lastFocusedIndex = startIndex;
                ensureVisible(firstVisibleItem);
                console.log('Focused first visible item after scroll:', startIndex);
            });
        }
    }
}

// 滚动事件监听
virtualListContainer.addEventListener('scroll', debounce(() => {
    renderVirtualList(true);
}, 50));

async function fetchFileList(op, dir) {
    showLoading();
    try {
        const response = await fetch('/browser', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                op: op,
                path: root,
                dir: dir,
            }),
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        root = resp['path'];
        pathName = resp['pathName'];
        allFiles = resp['items'];
        playlistFlag = resp['playlistFlag'];
        playlistID = resp['playlistID'];
        const canRemove = resp['canRemove'];

        // 检查文件名长度
        allFiles.forEach((file, index) => {
            if (file.name.length > 50) {
                console.warn(`Long filename detected at index ${index}:`, file.name);
            }
        });

        console.log('fetchFileList:', { allFilesLength: allFiles.length, root, pathName });

        // 更新 UI
        document.getElementById('removeRoot').style.display = canRemove ? 'inline' : 'none';
        document.getElementById('renameRoot').style.display = canRemove ? 'inline' : 'none';
        document.getElementById('playlistGen').style.display = playlistFlag === 0 ? 'none' : 'inline';
        document.getElementById('playlistGen').textContent = playlistFlag === 1 ? '▶️' : '生成播放列表';
        document.getElementById('setOpeningEnding').style.display = playlistFlag === 3 ? 'inline' : 'none';
        document.getElementById('root').innerHTML = pathName;

        // 查找 size 以 ▶️ 开头的 item，并设置焦点索引
        let focusIndex = 0;

        maxPlaylistIndex = -1;
        allFiles.forEach((file, index) => {
            maxPlaylistIndex = index;
            if (file.size && typeof file.size === 'string' && file.size.startsWith('▶️')) {
                focusIndex = index;
                console.log(`Found item with size starting with ▶️ at index ${index}:`, file.name);
            }
        });
        lastFocusedIndex = focusIndex;

        if (maxPlaylistIndex !== -1 && focusIndex < maxPlaylistIndex) {
            document.getElementById('videoPlayerNext').style.display = 'block';
        } else {
            document.getElementById('videoPlayerNext').style.display = 'none';
        }

        // 动态更新 itemHeight
        updateItemHeight();

        // 初始化虚拟列表，并传递焦点索引
        renderVirtualList(false, focusIndex);
    } catch (error) {
        console.error('获取文件列表失败:', error);
        Swal.fire('错误', '无法获取文件列表，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

function enterDir(path) {
    fetchFileList('enter', path);
}

function isPlayerFullscreen() {
    return (
        player.isFullscreen() ||
        !!document.fullscreenElement ||
        !!document.webkitFullscreenElement ||
        !!document.mozFullScreenElement ||
        !!document.msFullscreenElement
    );
}

let player = videojs('#video', {
    controlBar: {
        // 自定义控制栏设置（如果需要）
    },
    userActions: {
        hotkeys: false // 禁用默认键盘快捷键
    }
});

player.on('fullscreenchange', () => {
    if (isPlayerFullscreen()) {
        console.log('Entered fullscreen, initializing focus');
        initFocus(videoContainer);
    } else {
        console.log('Exited fullscreen, initializing focus');
        initFocus(videoContainer);
    }
});

player.on('canplay', function () {
    if (videoTm !== null && !isNaN(videoTm) && videoTm >= 0) {
        console.log('Canplay fired, attempting seek to:', videoTm);
        const trySeek = (attempt = 1) => {
            const seekable = player.seekable();
            if (seekable.length > 0 && videoTm >= seekable.start(0) && videoTm <= seekable.end(0)) {
                console.log('Setting video time to:', videoTm);
                player.currentTime(videoTm);
                console.log('Current time after seek:', player.currentTime());
                videoTm = null;
            } else if (attempt <= 3) {
                console.warn(`Seek attempt ${attempt} failed, retrying...`);
                setTimeout(() => trySeek(attempt + 1), 200);
            } else {
                console.error('Failed to seek after retries, giving up');
                videoTm = null;
            }
        };
        trySeek();
    }
});

let lastVideoTmReport = 0;

player.on('timeupdate', function () {
    if (Math.floor(Date.now() / 1000) - lastVideoTmReport > 2) {
        saveVideoTm(player.currentTime());
        lastVideoTmReport = Math.floor(Date.now() / 1000);
    }

    if (videoEndingTm !== null && videoEndingTm > 0) {
        const currentTime = player.currentTime();
        const duration = player.duration();
        if (!isNaN(duration) && duration > 0) {
            const remainingTime = duration - currentTime;
            if (remainingTime <= videoEndingTm) {
                console.log(`Remaining time (${remainingTime}s) <= videoEndingTm (${videoEndingTm}s), triggering videoNext`);
                videoNext();
                videoEndingTm = null;
            }
        }
    }
});

player.on('ended', async function () {
    await onPlayFinish();
});

player.on('error', function () {
    console.log('Video error:', player.error());
});

videojs.hook('beforeerror', (player, err) => {
    if (err !== null) {
        const errMsg = err.message + err.toString();
        if (errMsg.includes('No compatible source') || errMsg.includes('Format error') || errMsg.includes('NotSupportedError')) {
            console.log('Video source error:', err);
        } else {
            console.log('Video error:', errMsg, err);
        }
    }
    return err;
});

function changeVideoSrc(file) {
    player.pause();
    setVideoSrc(root + '/' + file);
}

function openFile(path) {
    isSwitchingPage = true;
    document.getElementById('playingVideo').textContent = '';
    fileListContainer.style.display = 'none';
    videoContainer.style.display = 'block';
    changeVideoSrc(path); // 直接使用完整路径
    initFocus(videoContainer);
    setTimeout(() => {
        isSwitchingPage = false;
    }, 1000);
}

async function videoNext() {
    await onPlayFinish();
}

function videoBack() {
    player.pause();
    videoContainer.style.display = 'none';
    fileListContainer.style.display = 'block';
    fetchFileList('flush');
}

function openSourceSelectionDialog() {
    openDialog('sourceSelectionDialog');
}

function closeSourceSelectionDialog() {
    document.getElementById('sourceSelectionDialog').style.display = 'none';
}

function openSMBDialog() {
    closeSourceSelectionDialog();
    const smbDialog = document.getElementById('smbDialog');
    smbDialog.style.display = 'block';
    setTimeout(() => {
        initFocus(smbDialog);
    }, 100); // 延迟确保DOM更新
}

function closeSMBDialog() {
    document.getElementById('smbDialog').style.display = 'none';
}

function testSMBConnection() {
    const address = document.getElementById('smbAddress').value;
    const username = document.getElementById('smbUsername').value;
    const password = document.getElementById('smbPassword').value;

    testRoot({
        rtype: 'smb',
        smb_address: address,
        smb_user: username,
        smb_password: password,
    });
}


function confirmSMB() {
    const address = document.getElementById('smbAddress').value;
    const username = document.getElementById('smbUsername').value;
    const password = document.getElementById('smbPassword').value;

    addRoot({
        rtype: 'smb',
        smb_address: address,
        smb_user: username,
        smb_password: password,
    }).then(() => {
        closeSMBDialog();
    });
}

async function testRoot(data) {
    showLoading();
    try {
        const response = await fetch('/test-root', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        const statusCode = resp['status_code'];
        const message = resp['message'];
        if (statusCode === 0) {
            Swal.fire({
                title: '成功',
                text: '测试成功',
                icon: 'success',
                customClass: { popup: 'swal-popup-top' },
            });
            return;
        }

        Swal.fire({
            title: '失败',
            text: '测试失败: ' + message,
            icon: 'error',
            customClass: { popup: 'swal-popup-top' },
        });
    } catch (error) {
        console.error('测试根目录失败:', error);
        Swal.fire({
            title: '错误',
            text: '无法测试根目录，请稍后重试',
            icon: 'error',
            customClass: { popup: 'swal-popup-top' },
        });
    } finally {
        hideLoading();
    }
}

async function addRoot(data) {
    showLoading();
    try {
        const response = await fetch('/add-root', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        fetchFileList();
    } catch (error) {
        console.error('添加根目录失败:', error);
        Swal.fire('错误', '无法添加根目录，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

async function reName(data) {
    showLoading();
    try {
        const response = await fetch('/rename-root', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        fetchFileList();
    } catch (error) {
        console.error('重命名失败:', error);
        Swal.fire('错误', '重命名失败，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

function showRenameRootDialog() {
    closeRenameRootDialog();
    document.getElementById('reName').value = '';
    openDialog('renameRootDialog');
}

function closeRenameRootDialog() {
    document.getElementById('renameRootDialog').style.display = 'none';
}


function showDirectoryDialog() {
    closeSourceSelectionDialog();
    const directoryDialog = document.getElementById('directoryDialog');
    directoryDialog.style.display = 'block';
    setTimeout(() => {
        initFocus(directoryDialog);
    }, 100); // 延迟确保DOM更新
}

function closeDirectoryDialog() {
    document.getElementById('directoryDialog').style.display = 'none';
}

function testDirectoryName() {
    const directoryName = document.getElementById('directoryName').value;
    testRoot({
        rtype: 'local',
        local_path: directoryName,
    });
}

function confirmDirectoryName() {
    const directoryName = document.getElementById('directoryName').value;
    addRoot({
        rtype: 'local',
        local_path: directoryName,
    }).then(() => {
        closeDirectoryDialog();
    });
}

// 打开片头片尾设置对话框
async function showOpeningEndingDialog() {
    const dialog = document.getElementById('openingEndingDialog');
    // 清空输入框
    document.getElementById('openingTm').value = '';
    document.getElementById('endingTm').value = '';

    // 显示加载提示
    showLoading();
    try {
        // 调用后端接口获取片头片尾数据
        const response = await fetch('/play-list/opening-ending?path='+root);

        if (!response.ok) {
            throw new Error('获取片头片尾数据失败');
        }

        const data = await response.json();
        // 填充输入框
        document.getElementById('openingTm').value = data.opening || 0;
        document.getElementById('endingTm').value = data.ending || 0;
    } catch (error) {
        console.error('获取片头片尾数据失败:', error);
        Swal.fire({
            title: '错误',
            text: '无法获取片头片尾数据，请稍后重试',
            icon: 'error',
            customClass: { popup: 'swal-popup-top' },
        });
    } finally {
        hideLoading();
    }

    // 显示对话框
    dialog.style.display = 'block';
    setTimeout(() => {
        initFocus(dialog);
    }, 100); // 延迟确保 DOM 更新
}

// 关闭片头片尾设置对话框
function closeOpeningEndingDialog() {
    document.getElementById('openingEndingDialog').style.display = 'none';
}

// 确认片头片尾设置并调用后端接口
async function confirmOpeningEnding() {
    const openingTm = parseInt(document.getElementById('openingTm').value, 10);
    const endingTm = parseInt(document.getElementById('endingTm').value, 10);

    // 验证输入
    if (isNaN(openingTm) || isNaN(endingTm) || openingTm < 0 || endingTm < 0) {
        Swal.fire({
            title: '错误',
            text: '请输入有效的片头和片尾时间（非负整数）',
            icon: 'error',
            customClass: { popup: 'swal-popup-top' },
        });
        return;
    }

    showLoading();
    try {
        const response = await fetch('/play-list/opening-ending', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: root,
                openingTm: openingTm,
                endingTm: endingTm,
            }),
        });

        if (response.status === 200) {
            Swal.fire({
                title: '成功',
                text: '片头片尾设置成功',
                icon: 'success',
                customClass: { popup: 'swal-popup-top' },
            });
            closeOpeningEndingDialog();
            // 可选：刷新文件列表以反映可能的更新
            await fetchFileList();
        } else {
            throw new Error('设置片头片尾失败');
        }
    } catch (error) {
        console.error('设置片头片尾失败:', error);
        Swal.fire({
            title: '错误',
            text: '无法设置片头片尾，请稍后重试',
            icon: 'error',
            customClass: { popup: 'swal-popup-top' },
        });
    } finally {
        hideLoading();
    }
}

async function playlistGen() {
    if (playlistFlag === 2) {
        await openPlaylistDialog();
    } else if (playlistFlag === 1) {
        root = playlistID;
        await fetchFileList('flush');
    }
}

async function openPlaylistDialog() {
    showLoading();
    try {
        const response = await fetch('play-list/preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: root,
                only_video_files: true,
            }),
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        const items = resp['items'];
        previewAndSavePlaylistDialog(items);
    } catch (error) {
        console.error('获取播放列表失败:', error);
        Swal.fire('错误', '无法获取播放列表，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

function previewAndSavePlaylistDialog(files) {
    const playlistDialog = document.getElementById('playlistDialog');
    const playlist = document.getElementById('playlist');
    playlist.innerHTML = '';

    files.forEach((file, index) => {
        const li = document.createElement('li');
        li.textContent = file;
        li.tabIndex = 0;
        li.style.padding = '10px';
        li.style.border = '1px solid #ccc';
        li.style.marginBottom = '5px';
        li.style.cursor = 'move';
        li.style.wordBreak = 'break-all';
        li.dataset.index = index;

        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', e.target.dataset.index);
            e.target.classList.add('dragging');
            const dragImage = document.createElement('div');
            dragImage.textContent = e.target.textContent;
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-9999px';
            dragImage.style.left = '-9999px';
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, 0, 0);
            setTimeout(() => document.body.removeChild(dragImage), 0);
        });

        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = document.querySelector('.dragging');
            const targetItem = e.target.closest('li');
            if (draggingItem && targetItem && draggingItem !== targetItem) {
                const playlist = targetItem.parentNode;
                const draggingIndex = [...playlist.children].indexOf(draggingItem);
                const targetIndex = [...playlist.children].indexOf(targetItem);

                if (draggingIndex < targetIndex) {
                    playlist.insertBefore(draggingItem, targetItem.nextSibling);
                } else {
                    playlist.insertBefore(draggingItem, targetItem);
                }
            }
        });

        li.addEventListener('drop', (e) => {
            e.preventDefault();
            e.target.classList.remove('dragging');
        });

        li.addEventListener('dragend', (e) => {
            const rect = playlistDialog.getBoundingClientRect();
            if (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
            ) {
                Swal.fire({
                    title: '确认删除',
                    text: '确定要删除此条目吗？',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: '删除',
                    cancelButtonText: '取消',
                }).then((result) => {
                    if (result.isConfirmed) {
                        li.remove();
                    }
                });
            }
            e.target.classList.remove('dragging');
        });

        playlist.appendChild(li);
    });

    playlist.addEventListener('dragover', (e) => {
        e.preventDefault();
        const scrollThreshold = 20;
        const scrollSpeed = 5;
        const rect = playlist.getBoundingClientRect();
        if (e.clientY < rect.top + scrollThreshold) {
            playlist.scrollTop -= scrollSpeed;
        } else if (e.clientY > rect.bottom - scrollThreshold) {
            playlist.scrollTop += scrollSpeed;
        }
    });

    const titleBar = document.getElementById('playlistTitle');
    playlistDialog.style.position = 'absolute';
    let isDragging = false;
    let offsetX = 0,
        offsetY = 0;

    titleBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - playlistDialog.offsetLeft;
        offsetY = e.clientY - playlistDialog.offsetTop;
        playlistDialog.style.zIndex = 1000;
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            playlistDialog.style.left = `${e.clientX - offsetX}px`;
            playlistDialog.style.top = `${e.clientY - offsetY}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    playlistDialog.style.display = 'flex';
    initFocus(playlistDialog);
}

function closePlaylistDialog() {
    document.getElementById('playlistDialog').style.display = 'none';
}

function confirmPlaylist() {
    const playlist = document.getElementById('playlist');
    const items = Array.from(playlist.children).map((li) => li.textContent);
    savePlaylist(items).then(() => {
        closePlaylistDialog();
    });
}

async function savePlaylist(items) {
    showLoading();
    try {
        const response = await fetch('play-list/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: root,
                items: items,
            }),
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        await fetchFileList();
    } catch (error) {
        console.error('保存播放列表失败:', error);
        Swal.fire('错误', '无法保存播放列表，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

async function onPlayFinish() {
    showLoading();
    try {
        const curPlayingVideo = playingVideo;

        const response = await fetch('/video/play/finished', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: curPlayingVideo,
            }),
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        const next = resp['next'];
        if (curPlayingVideo === playingVideo) {
            if (next !== '') {
                changeVideoSrc(next);
            } else {
                videoBack();
            }
        }
    } catch (error) {
        console.error('播放完成处理失败:', error);
        Swal.fire('错误', '无法处理播放完成，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

async function removeRoot() {
    showLoading();
    try {
        const response = await fetch('/remove-root', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: root,
            }),
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        const statusCode = resp['statusCode'];
        if (statusCode === 0) {
            root = '';
            Swal.fire({
                title: '成功',
                text: '移除成功',
                icon: 'success',
                customClass: { popup: 'swal-popup-top' },
            });
            fetchFileList();
            return;
        }

        Swal.fire('错误', resp['message'], 'error');
    } catch (error) {
        console.error('移除根目录失败:', error);
        Swal.fire('错误', '无法移除根目录，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

function confirmRenameRoot() {
    const reNameText = document.getElementById('reName').value;
    reName({
        root: root,
        name: reNameText,
    }).then(() => {
        closeRenameRootDialog();
    });
}

// 初始化焦点
function initFocus(container = document) {
    const setFocus = () => {
        const focusableElements = getFocusableElements(container);
        let firstItem = null;

        if (container === fileListContainer) {
            // 优先选择 controls 中的第一个按钮
            firstItem = focusableElements.find(el => el.closest('.controls')) ||
                focusableElements.find(el => el.classList.contains('current-path')) ||
                focusableElements.find(el => el.classList.contains('file-item')) ||
                focusableElements[0];
        } else if (container === videoContainer) {
            firstItem = videoContainer.querySelector('.vjs-play-control') ||
                videoContainer.querySelector('.vjs-progress-control') ||
                videoContainer.querySelector('.vjs-volume-control') ||
                videoContainer.querySelector('.vjs-fullscreen-control') ||
                focusableElements[0];
        } else {
            firstItem = focusableElements[0];
        }

        if (firstItem && firstItem !== document.activeElement) {
            firstItem.focus();
            currentFocus = firstItem;
            if (firstItem.classList.contains('file-item')) {
                lastFocusedIndex = parseInt(firstItem.dataset.index, 10) || 0;
            }
            ensureVisible(firstItem);
        } else if (!firstItem) {
            document.body.focus();
            currentFocus = document.body;
        }
    };

    if (container === videoContainer) {
        setTimeout(setFocus, 100);
    } else {
        setFocus();
    }
}

// 获取可聚焦元素
function getFocusableElements(container = document) {
    const elements = Array.from(
        container.querySelectorAll(
            '.file-item, button, input, #playlist li, [tabindex="0"], ' +
            '.vjs-control.vjs-button, .vjs-progress-control, .vjs-volume-control, .vjs-fullscreen-control'
        )
    ).filter((el) => {
        const isVisible = el.offsetParent !== null && !el.disabled;
        return isVisible;
    });

    // 返回所有可聚焦元素，保持 DOM 顺序
    return elements;
}

// 确保焦点在列表项上移动时滚动
function ensureVisible(element, direction = null) {
    if (element.classList.contains('file-item')) {
        const container = element.closest('.virtual-list-container');
        if (container && container.classList.contains('virtual-list-container')) {
            const index = parseInt(element.dataset.index, 10);
            if (isNaN(index)) return;

            const scrollTop = virtualListContainer.scrollTop;
            const containerHeight = virtualListContainer.clientHeight;
            const itemTop = index * itemHeight;
            const itemBottom = itemTop + itemHeight;

            console.log('EnsureVisible:', {
                index,
                direction,
                scrollTop,
                containerHeight,
                itemTop,
                itemBottom,
                visibleItemsCount
            });

            if (itemTop < scrollTop) {
                // 目标在上方，滚动到顶部对齐
                virtualListContainer.scrollTop = itemTop;
                console.log('Scrolling to top:', itemTop);
            } else if (itemBottom > scrollTop + containerHeight) {
                // 目标在下方，滚动到底部对齐
                virtualListContainer.scrollTop = itemBottom - containerHeight;
                console.log('Scrolling to bottom:', itemBottom - containerHeight);
            }
        }
    }
}

function openDialog(dialogId) {
    const dialog = document.getElementById(dialogId);
    dialog.style.display = dialogId === 'playlistDialog' ? 'flex' : 'block';
    setTimeout(() => {
        initFocus(dialog);
    }, 100); // 延迟确保DOM更新
}

let isSwitchingPage = false; // 新增标志，防止快速切换

const debouncedPlayPause = debounce((event) => {
    if (currentFocus.classList.contains('vjs-play-control')) {
        console.log('Debounced enter on .vjs-play-control, paused:', player.paused());
        if (player.paused()) {
            player.play();
            console.log('Enter triggered play on .vjs-play-control');
        } else {
            player.pause();
            console.log('Enter triggered pause on .vjs-play-control');
            // 延迟检查暂停状态
            setTimeout(() => {
                if (!player.paused()) {
                    console.warn('Unexpected play after pause, forcing pause');
                    player.pause();
                }
            }, 100);
        }
        event.stopPropagation();
        event.preventDefault();
    }
}, 300);

const debouncedMuteToggle = debounce((event) => {
    if (currentFocus.classList.contains('vjs-mute-control')) {
        console.log('Debounced enter on .vjs-mute-control, muted:', player.muted());
        player.muted(!player.muted());
        console.log('Enter triggered mute toggle, muted:', player.muted());
        event.stopPropagation();
        event.preventDefault();
    }
}, 300);

document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' || event.keyCode === 27 || event.key === 'Back') {
        console.log('Global Escape/Back key captured:', {
            key: event.key,
            code: event.code,
            keyCode: event.keyCode,
            which: event.which
        });
        event.preventDefault();
        event.stopPropagation();
    }
}, { capture: true });

document.addEventListener('keydown', function (event) {
    if (isSwitchingPage) {
        event.preventDefault();
        console.log('Ignoring keydown during page switch:', event.key);
        return;
    }

    const dialogs = document.querySelectorAll(
        '#smbDialog, #renameRootDialog, #directoryDialog, #sourceSelectionDialog, #playlistDialog, #openingEndingDialog'
    );
    const isDialogOpen = Array.from(dialogs).some(
        (dialog) => dialog.style.display === 'block' || dialog.style.display === 'flex'
    );

    let focusableElements = [];
    let container = document;
    if (isDialogOpen) {
        container = Array.from(dialogs).find(
            (dialog) => dialog.style.display === 'block' || dialog.style.display === 'flex'
        );
        focusableElements = getFocusableElements(container);
    } else if (videoContainer.style.display === 'block') {
        container = videoContainer;
        focusableElements = getFocusableElements(videoContainer);
    } else {
        container = fileListContainer;
        focusableElements = getFocusableElements(fileListContainer);
    }

    const currentIndex = focusableElements.indexOf(document.activeElement);
    if (currentIndex >= 0) {
        currentFocus = focusableElements[currentIndex];
    } else if (focusableElements.length > 0) {
        currentFocus = focusableElements[0];
        currentFocus.focus();
    }

    const key = event.key;
    const keyCode = event.keyCode || event.which;

    let action = null;
    switch (true) {
        case key === 'ArrowUp' || key === 'Up' || keyCode === 38:
            action = 'up';
            break;
        case key === 'ArrowDown' || key === 'Down' || keyCode === 40:
            action = 'down';
            break;
        case key === 'ArrowLeft' || key === 'Left' || keyCode === 37:
            action = 'left';
            break;
        case key === 'ArrowRight' || key === 'Right' || keyCode === 39:
            action = 'right';
            break;
        case key === 'Enter' || key === 'OK' || keyCode === 13:
            action = 'enter';
            break;
        case key === 'Escape' || key === 'Back' || keyCode === 27:
            action = 'escape';
            break;
        default:
            return;
    }

    event.preventDefault();

    console.log('Keydown:', {
        action,
        currentIndex,
        itemIndex: currentFocus?.dataset?.index,
        scrollTop: virtualListContainer.scrollTop,
        focusableElementsLength: focusableElements.length
    });

    if (isPlayerFullscreen()) {
        switch (action) {
            case 'right':
                player.currentTime(player.currentTime() + 10);
                break;
            case 'left':
                player.currentTime(player.currentTime() - 10);
                break;
            case 'up':
                player.volume(Math.min(player.volume() + 0.1, 1));
                break;
            case 'down':
                player.volume(Math.max(player.volume() - 0.1, 0));
                break;
            case 'enter':
                if (player.paused()) player.play();
                else player.pause();
                break;
            case 'escape':
                player.exitFullscreen();
                initFocus(videoContainer);
                break;
        }
    } else {
        switch (action) {
            case 'up':
                if (container === fileListContainer) {
                    if (currentFocus.classList.contains('file-item') && currentFocus.dataset.index !== undefined) {
                        const itemIndex = parseInt(currentFocus.dataset.index, 10);
                        if (itemIndex > 0) {
                            const prevIndex = itemIndex - 1;
                            const startIndex = Math.floor(virtualListContainer.scrollTop / itemHeight);
                            if (prevIndex < startIndex) {
                                virtualListContainer.scrollTop = prevIndex * itemHeight;
                                renderVirtualList(false, prevIndex);
                            } else {
                                const prevItem = fileList.querySelector(`.file-item[data-index="${prevIndex}"]`);
                                if (prevItem) {
                                    prevItem.focus();
                                    currentFocus = prevItem;
                                    lastFocusedIndex = prevIndex;
                                    ensureVisible(prevItem, 'up');
                                }
                            }
                        } else {
                            // 移到列表前一个元素（例如 .. 或 .current-path）
                            const prevElement = focusableElements[currentIndex - 1];
                            if (prevElement) {
                                prevElement.focus();
                                currentFocus = prevElement;
                                if (prevElement.classList.contains('file-item')) {
                                    lastFocusedIndex = parseInt(prevElement.dataset.index, 10) || 0;
                                } else {
                                    lastFocusedIndex = 0;
                                }
                            }
                        }
                    } else if (currentIndex > 0) {
                        const prevElement = focusableElements[currentIndex - 1];
                        prevElement.focus();
                        currentFocus = prevElement;
                        if (prevElement.classList.contains('file-item') && prevElement.dataset.index !== undefined) {
                            lastFocusedIndex = parseInt(prevElement.dataset.index, 10);
                            ensureVisible(prevElement, 'up');
                        } else {
                            lastFocusedIndex = 0;
                        }
                    }
                } else {
                    if (currentIndex > 0) {
                        currentFocus = focusableElements[currentIndex - 1];
                        currentFocus.focus();
                    }
                }
                break;
            case 'down':
                if (container === fileListContainer) {
                    if (currentFocus.classList.contains('file-item') && currentFocus.dataset.index !== undefined) {
                        const itemIndex = parseInt(currentFocus.dataset.index, 10);
                        if (itemIndex < allFiles.length - 1) {
                            const nextIndex = itemIndex + 1;
                            const startIndex = Math.floor(virtualListContainer.scrollTop / itemHeight);
                            const endIndex = Math.min(startIndex + visibleItemsCount, allFiles.length);
                            console.log('Down:', { itemIndex, nextIndex, startIndex, endIndex });
                            if (nextIndex >= endIndex) {
                                const newScrollTop = Math.min(nextIndex * itemHeight, (allFiles.length - visibleItemsCount) * itemHeight);
                                virtualListContainer.scrollTop = newScrollTop;
                                renderVirtualList(false, nextIndex);
                            } else {
                                const nextItem = fileList.querySelector(`.file-item[data-index="${nextIndex}"]`);
                                if (nextItem) {
                                    nextItem.focus();
                                    currentFocus = nextItem;
                                    lastFocusedIndex = nextIndex;
                                    ensureVisible(nextItem, 'down');
                                } else {
                                    // 强制渲染并聚焦
                                    const newScrollTop = Math.min(nextIndex * itemHeight, (allFiles.length - visibleItemsCount) * itemHeight);
                                    virtualListContainer.scrollTop = newScrollTop;
                                    renderVirtualList(false, nextIndex);
                                }
                            }
                        } else {
                            console.log('Reached end of file list, no further navigation');
                        }
                    } else if (currentIndex < focusableElements.length - 1) {
                        const nextElement = focusableElements[currentIndex + 1];
                        nextElement.focus();
                        currentFocus = nextElement;
                        if (nextElement.classList.contains('file-item') && nextElement.dataset.index !== undefined) {
                            lastFocusedIndex = parseInt(nextElement.dataset.index, 10);
                            ensureVisible(nextElement, 'down');
                        } else {
                            lastFocusedIndex = 0;
                        }
                    }
                } else {
                    if (currentIndex < focusableElements.length - 1) {
                        currentFocus = focusableElements[currentIndex + 1];
                        currentFocus.focus();
                    }
                }
                break;
            case 'left':
                if (container === fileListContainer && currentFocus.classList.contains('file-item')) {
                    const prevElement = focusableElements.find((el, idx) => idx < currentIndex && !el.classList.contains('file-item'));
                    if (prevElement) {
                        prevElement.focus();
                        currentFocus = prevElement;
                        lastFocusedIndex = 0;
                    }
                } else if (videoContainer.style.display === 'block') {
                    player.currentTime(player.currentTime() - 10);
                } else if (isDialogOpen) {
                    const buttons = focusableElements.filter((el) => el.tagName === 'BUTTON');
                    const currentButtonIndex = buttons.indexOf(currentFocus);
                    if (currentButtonIndex > 0) {
                        currentFocus = buttons[currentButtonIndex - 1];
                        currentFocus.focus();
                    }
                }
                break;
            case 'right':
                if (container === fileListContainer && currentFocus.classList.contains('file-item')) {
                    const nextElement = focusableElements.find((el, idx) => idx > currentIndex && !el.classList.contains('file-item'));
                    if (nextElement) {
                        nextElement.focus();
                        currentFocus = nextElement;
                        lastFocusedIndex = 0;
                    }
                } else if (videoContainer.style.display === 'block') {
                    player.currentTime(player.currentTime() + 10);
                } else if (isDialogOpen) {
                    const buttons = focusableElements.filter((el) => el.tagName === 'BUTTON');
                    const currentButtonIndex = buttons.indexOf(currentFocus);
                    if (currentButtonIndex < buttons.length - 1) {
                        currentFocus = buttons[currentButtonIndex + 1];
                        currentFocus.focus();
                    }
                }
                break;
            case 'enter':
                if (videoContainer.style.display === 'block') {
                    const isVideoControl = currentFocus && (
                        currentFocus.classList.contains('vjs-control') ||
                        currentFocus.closest('.vjs-progress-control') ||
                        currentFocus.closest('.vjs-volume-control') ||
                        currentFocus.closest('.vjs-fullscreen-control')
                    );
                    if (isVideoControl) {
                        if (currentFocus.classList.contains('vjs-play-control')) {
                            debouncedPlayPause(event);
                        } else if (currentFocus.classList.contains('vjs-mute-control')) {
                            debouncedMuteToggle(event);
                        } else if (currentFocus.classList.contains('vjs-fullscreen-control')) {
                            if (isPlayerFullscreen()) player.exitFullscreen();
                            else player.requestFullscreen();
                        } else {
                            currentFocus.click();
                        }
                        return;
                    } else if (currentFocus) {
                        currentFocus.click();
                    } else {
                        if (player.paused()) player.play();
                        else player.pause();
                    }
                } else if (currentFocus) {
                    currentFocus.click();
                }
                break;
            case 'escape':
                if (isDialogOpen) {
                    const openDialog = Array.from(dialogs).find(
                        (dialog) => dialog.style.display === 'block' || dialog.style.display === 'flex'
                    );
                    const cancelButton = openDialog.querySelector('button[onclick*="close"]');
                    if (cancelButton) cancelButton.click();
                } else if (videoContainer.style.display === 'block') {
                    isSwitchingPage = true;
                    videoBack();
                    setTimeout(() => { isSwitchingPage = false; }, 1000);
                } else if (fileListContainer.style.display === 'block') {
                    isSwitchingPage = true;
                    fetchFileList('leave');
                    setTimeout(() => { isSwitchingPage = false; }, 1000);
                }
                break;
        }
    }
}, { capture: true });

let isVideoPlaying = false; // 新增标志，跟踪视频播放状态

player.on('play', () => {
    isVideoPlaying = true;
    console.log('Video is playing, isVideoPlaying:', isVideoPlaying);
});

player.on('pause', () => {
    isVideoPlaying = false;
    console.log('Video is paused, isVideoPlaying:', isVideoPlaying);
});

// 监听 DOM 变化，重新初始化焦点
const observer = new MutationObserver(() => {
    if (isSwitchingPage) {
        console.log('MutationObserver ignored during page switch');
        return;
    }
    if (isVideoPlaying && videoContainer.style.display === 'block') {
        console.log('MutationObserver ignored during video playback');
        return;
    }
    // 仅在 fileListContainer 显示且焦点不在 file-item 上时初始化焦点
    if (fileListContainer.style.display === 'block' && (!currentFocus || !currentFocus.classList.contains('file-item'))) {
        console.log('Initializing focus for fileListContainer');
        initFocus(fileListContainer);
    } else if (videoContainer.style.display === 'block') {
        console.log('Initializing focus for videoContainer');
        initFocus(videoContainer);
    }
});
observer.observe(document.body, { childList: true, subtree: true });

window.onload = function () {
    fetchFileList();
};

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}


document.addEventListener('focusin', (event) => {
    const focusableElements = getFocusableElements(document);
    if (!focusableElements.includes(event.target)) {
        console.log('Ignoring focusin on non-focusable element:', event.target.outerHTML);
        return;
    }

    const dialogs = document.querySelectorAll(
        '#smbDialog, #renameRootDialog, #directoryDialog, #sourceSelectionDialog, #playlistDialog, #openingEndingDialog'
    );
    const isDialogOpen = Array.from(dialogs).some(
        (dialog) => dialog.style.display === 'block' || dialog.style.display === 'flex'
    );

    // 检测是否由鼠标点击触发
    const isMouseClick = event.detail === 0 && event.target === event.currentTarget;

    if (isDialogOpen && !event.target.closest('.dialog') && !isMouseClick) {
        // 仅在非鼠标点击（如键盘导航或自动焦点）时限制焦点到对话框
        const openDialog = Array.from(dialogs).find(
            (dialog) => dialog.style.display === 'block' || dialog.style.display === 'flex'
        );
        console.log('Preventing focus outside dialog (non-mouse), restoring to', openDialog.id);
        setTimeout(() => {
            initFocus(openDialog);
        }, 100);
        return;
    }

    if (isVideoPlaying && event.target.classList.contains('vjs-control') && event.target !== currentFocus && !isMouseClick) {
        // 仅在非鼠标点击时阻止视频控件自动焦点
        console.log('Preventing video.js auto-focus during playback (non-mouse)');
        currentFocus.focus();
        return;
    }

    // 更新 currentFocus，仅在鼠标点击或有效焦点变化时
    currentFocus = event.target;
    console.log('Focus changed to:', currentFocus.outerHTML);

    // 如果是 file-item，更新 lastFocusedIndex
    if (currentFocus.classList.contains('file-item')) {
        lastFocusedIndex = parseInt(currentFocus.dataset.index, 10) || 0;
    }
});

const style = document.createElement('style');
style.innerHTML = `
    .swal-popup-top {
        z-index: 9999 !important;
    }
    .swal2-container {
        z-index: 9999 !important;
    }
`;
document.head.appendChild(style);

window.addEventListener('beforeunload', (event) => {
    const isPlayingVideo = videoContainer.style.display === 'block' && !player.paused();
    const hasOpenDialog = document.querySelectorAll(
        '#smbDialog, #renameRootDialog, #directoryDialog, #sourceSelectionDialog, #playlistDialog, #openingEndingDialog'
    ).some(dialog => dialog.style.display === 'block' || dialog.style.display === 'flex');

    if (isPlayingVideo || hasOpenDialog) {
        console.log('beforeunload triggered, preventing exit due to active video or dialog');
        event.preventDefault();
        event.returnValue = '';
    } else {
        console.log('beforeunload allowed: no active video or dialog');
    }
});

window.goBack = function () {
    console.log('goBack called, videoContainer.display:', videoContainer.style.display, 'pathName:', pathName);

    // Check if on the video playback page
    if (videoContainer.style.display === 'block') {
        console.log('On video playback page, returning false');
        isSwitchingPage = true;
        videoBack();
        setTimeout(() => {
            isSwitchingPage = false;
        }, 1000);
        return false;
    }

    // Check if current path is not empty
    if (pathName !== '') {
        console.log('Path is not empty, simulating click on .. (fetchFileList leave)');
        isSwitchingPage = true;
        fetchFileList('leave');
        setTimeout(() => {
            isSwitchingPage = false;
        }, 1000);
        return false;
    }

    // No video playing and at root path, allow back action
    console.log('At root path with no video, returning true');
    return true;
};