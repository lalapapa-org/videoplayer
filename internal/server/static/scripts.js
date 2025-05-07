let root = '';
let pathName = '';
let playingVideo = '';
let videoID = '';
let playlistFlag = 0;
let playlistID = '';
let videoTm = null;
let currentFocus = null;

const fileListContainer = document.getElementById('file-list-container');
const videoContainer = document.getElementById('video-container');

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

function createFileItem(file) {
    if (file.is_dir) {
        return `
            <li class="file-item" tabindex="0" onclick="enterDir('${file.path}')">
                <span class="file-icon">📂</span>
                <span class="file-name">${file.name}</span>
            </li>
        `;
    }
    return `
        <li class="file-item" tabindex="0" onclick="openFile('${file.path}')">
            <span class="file-icon">📄</span>
            <span class="file-name">${file.name}</span>
            <span class="file-size">${file.size}</span>
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
        const files = resp['items'];

        playlistFlag = resp['playlistFlag'];
        playlistID = resp['playlistID'];
        const canRemove = resp['canRemove'];

        const removeRoot = document.getElementById('removeRoot');
        removeRoot.style.display = canRemove ? 'inline' : 'none';

        const renameRoot = document.getElementById('renameRoot');
        renameRoot.style.display = canRemove ? 'inline' : 'none';

        const playList = document.getElementById('playlistGen');
        playList.style.display = playlistFlag === 0 ? 'none' : 'inline';
        playList.textContent = playlistFlag === 1 ? '▶️' : '生成播放列表';

        const rootUI = document.getElementById('root');
        rootUI.innerHTML = pathName;

        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';
        files.forEach((file) => {
            fileList.innerHTML += createFileItem(file);
        });

        initFocus(fileListContainer);
    } catch (error) {
        console.error('获取文件列表失败:', error);
        Swal.fire('错误', '无法获取文件列表，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

function enterDir(filename) {
    fetchFileList('enter', filename);
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

function openFile(filename) {
    isSwitchingPage = true;
    document.getElementById('playingVideo').textContent = '';
    fileListContainer.style.display = 'none';
    videoContainer.style.display = 'block';
    changeVideoSrc(filename);
    initFocus(videoContainer);
    setTimeout(() => {
        isSwitchingPage = false;
    }, 1000);
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
    openDialog('smbDialog');
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
    openDialog('directoryDialog');
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

function initFocus(container = document) {
    const setFocus = () => {
        const focusableElements = getFocusableElements(container);
        let firstItem = null;

        if (container === videoContainer) {
            firstItem = videoContainer.querySelector('.vjs-play-control') ||
                videoContainer.querySelector('.vjs-progress-control') ||
                videoContainer.querySelector('.vjs-volume-control') ||
                videoContainer.querySelector('.vjs-fullscreen-control') ||
                focusableElements[0];
            console.log('Focusable elements in videoContainer:', focusableElements.map(el => el.outerHTML));
        } else {
            firstItem = focusableElements[0];
        }

        if (firstItem && firstItem !== document.activeElement) {
            firstItem.focus();
            currentFocus = firstItem;
            console.log('Focus initialized on:', firstItem.outerHTML, 'isVideoPlaying:', isVideoPlaying);
        } else if (!firstItem) {
            console.warn('No focusable elements found in container:', container, 'isVideoPlaying:', isVideoPlaying);
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

function getFocusableElements(container = document) {
    const elements = Array.from(
        container.querySelectorAll(
            '.file-item, button, input, .current-path, #playlist li, [tabindex="0"], ' +
            '.vjs-control.vjs-button, .vjs-progress-control, .vjs-volume-control, .vjs-fullscreen-control'
        )
    ).filter((el) => {
        const isVisible = el.offsetParent !== null && !el.disabled;
        if (!isVisible && (el.classList.contains('vjs-play-control') || el.classList.contains('vjs-fullscreen-control'))) {
            console.warn('Control not visible:', el.outerHTML);
        }
        return isVisible;
    });
    console.log('Focusable elements:', elements.map(el => el.outerHTML));
    return elements;
}

function ensureVisible(element) {
    const container = element.closest('.file-list, #playlist, .dialog');
    if (container) {
        const rect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top < containerRect.top) {
            container.scrollTop -= containerRect.top - rect.top;
        } else if (rect.bottom > containerRect.bottom) {
            container.scrollTop += rect.bottom - containerRect.bottom;
        }
    }
}

function openDialog(dialogId) {
    const dialog = document.getElementById(dialogId);
    dialog.style.display = dialogId === 'playlistDialog' ? 'flex' : 'block';
    initFocus(dialog);
}

let isSwitchingPage = false; // 新增标志，防止快速切换

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        const event = args[0]; // 假设第一个参数是事件对象
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

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

    console.log('按键详情:', {
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        which: event.which,
        currentFocus: currentFocus?.outerHTML || 'null',
        isFullscreen: isPlayerFullscreen()
    });

    const dialogs = document.querySelectorAll(
        '#smbDialog, #renameRootDialog, #directoryDialog, #sourceSelectionDialog, #playlistDialog'
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
            console.log('未绑定的按键:', key, keyCode);
            return;
    }

    event.preventDefault();

    if (isPlayerFullscreen()) {
        switch (action) {
            case 'right':
                player.currentTime(player.currentTime() + 10);
                console.log('Full screen: Seek forward 10s');
                break;
            case 'left':
                player.currentTime(player.currentTime() - 10);
                console.log('Full screen: Seek backward 10s');
                break;
            case 'up':
                player.volume(Math.min(player.volume() + 0.1, 1));
                console.log('Full screen: Volume up', player.volume());
                break;
            case 'down':
                player.volume(Math.max(player.volume() - 0.1, 0));
                console.log('Full screen: Volume down', player.volume());
                break;
            case 'enter':
                if (player.paused()) {
                    player.play();
                    console.log('Full screen: Play');
                } else {
                    player.pause();
                    console.log('Full screen: Pause');
                }
                break;
            case 'escape':
                player.exitFullscreen();
                initFocus(videoContainer);
                console.log('Full screen: Exit fullscreen');
                break;
        }
    } else {
        switch (action) {
            case 'up':
                if (currentIndex > 0) {
                    currentFocus = focusableElements[currentIndex - 1];
                    currentFocus.focus();
                    ensureVisible(currentFocus);
                    console.log('Focus moved up to:', currentFocus.outerHTML);
                }
                break;
            case 'down':
                if (currentIndex < focusableElements.length - 1) {
                    currentFocus = focusableElements[currentIndex + 1];
                    currentFocus.focus();
                    ensureVisible(currentFocus);
                    console.log('Focus moved down to:', currentFocus.outerHTML);
                }
                break;
            case 'left':
                if (videoContainer.style.display === 'block') {
                    player.currentTime(player.currentTime() - 10);
                    console.log('Non-fullscreen: Seek backward 10s');
                } else if (isDialogOpen) {
                    const buttons = getFocusableElements(container).filter((el) => el.tagName === 'BUTTON');
                    const currentButtonIndex = buttons.indexOf(currentFocus);
                    if (currentButtonIndex > 0) {
                        currentFocus = buttons[currentButtonIndex - 1];
                        currentFocus.focus();
                        console.log('Focus moved left to:', currentFocus.outerHTML);
                    }
                }
                break;
            case 'right':
                if (videoContainer.style.display === 'block') {
                    player.currentTime(player.currentTime() + 10);
                    console.log('Non-fullscreen: Seek forward 10s');
                } else if (isDialogOpen) {
                    const buttons = getFocusableElements(container).filter((el) => el.tagName === 'BUTTON');
                    const currentButtonIndex = buttons.indexOf(currentFocus);
                    if (currentButtonIndex < buttons.length - 1) {
                        currentFocus = buttons[currentButtonIndex + 1];
                        currentFocus.focus();
                        console.log('Focus moved right to:', currentFocus.outerHTML);
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
                            if (isPlayerFullscreen()) {
                                player.exitFullscreen();
                                console.log('Enter triggered exit fullscreen');
                            } else {
                                player.requestFullscreen();
                                console.log('Enter triggered request fullscreen');
                            }
                        } else {
                            currentFocus.click();
                            console.log('Enter triggered click on:', currentFocus.outerHTML);
                        }
                        return; // 阻止后续 click 操作
                    } else if (currentFocus) {
                        currentFocus.click();
                        console.log('Enter triggered click on:', currentFocus.outerHTML);
                    } else {
                        if (player.paused()) {
                            player.play();
                            console.log('Enter triggered play (no focus)');
                        } else {
                            player.pause();
                            console.log('Enter triggered pause (no focus)');
                        }
                    }
                } else if (currentFocus) {
                    currentFocus.click();
                    console.log('Enter triggered click on:', currentFocus.outerHTML);
                }
                break;
            case 'escape':
                if (isDialogOpen) {
                    const openDialog = Array.from(dialogs).find(
                        (dialog) => dialog.style.display === 'block' || dialog.style.display === 'flex'
                    );
                    const cancelButton = openDialog.querySelector('button[onclick*="close"]');
                    if (cancelButton) {
                        cancelButton.click();
                        console.log('Escape closed dialog');
                    }
                } else if (videoContainer.style.display === 'block') {
                    isSwitchingPage = true;
                    videoBack();
                    console.log('Escape triggered videoBack');
                    setTimeout(() => {
                        isSwitchingPage = false;
                    }, 1000);
                } else if (fileListContainer.style.display === 'block') {
                    isSwitchingPage = true;
                    fetchFileList('leave');
                    console.log('Escape triggered fetchFileList(leave)');
                    setTimeout(() => {
                        isSwitchingPage = false;
                    }, 1000);
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
    if (fileListContainer.style.display === 'block') {
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

document.addEventListener('click', debounce(() => {
    if (fileListContainer.style.display === 'block') {
        initFocus(fileListContainer);
    } else if (videoContainer.style.display === 'block') {
        initFocus(videoContainer);
    }
}, 200));

document.addEventListener('focusin', (event) => {
    const focusableElements = getFocusableElements(document);
    if (focusableElements.includes(event.target)) {
        if (isVideoPlaying && event.target.classList.contains('vjs-control') && event.target !== currentFocus) {
            console.log('Preventing video.js auto-focus during playback');
            currentFocus.focus();
            return;
        }
        currentFocus = event.target;
        console.log('Focus changed to:', currentFocus.outerHTML);
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
    // 仅在特定条件下（如有未保存更改）显示退出提示
    const isPlayingVideo = videoContainer.style.display === 'block' && !player.paused();
    const hasOpenDialog = document.querySelectorAll(
        '#smbDialog, #renameRootDialog, #directoryDialog, #sourceSelectionDialog, #playlistDialog'
    ).some(dialog => dialog.style.display === 'block' || dialog.style.display === 'flex');

    if (isPlayingVideo || hasOpenDialog) {
        console.log('beforeunload triggered, preventing exit due to active video or dialog');
        event.preventDefault();
        event.returnValue = ''; // 触发浏览器默认提示（可根据需求禁用）
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