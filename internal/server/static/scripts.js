let root = '';
let pathName = '';
let playingVideo = ''
let videoID = '';
let playlistFlag = 0;
let playlistID = '';

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

// 创建文件项的HTML
function createFileItem(file) {
    if (file.is_dir) {
        return `
            <li class="file-item" onclick="enterDir('${file.path}')">
                <span class="file-icon">📂</span>
                <span class="file-name">${file.name}</span>
            </li>
        `;
    }

    return `
        <li class="file-item" onclick="openFile('${file.path}')">
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
            })
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        videoID = resp["video_id"];

        playingVideo = videoURL;

        player.src({src: '/videos?file=' + videoID,type: 'video/webm'});

        player.load();
        player.currentTime(resp["last_tm"]);
        player.play();
    } catch (error) {
        Swal.fire('错误', '无法获取文件，请稍后重试', 'error');
    } finally {
        hideLoading(); // 请求完成（成功或失败）时隐藏遮罩
    }
}

async function saveVideoTm(tm) {
    try {
        await fetch('/video/save-tm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                vid: videoID,
                tm:  Math.floor(tm),
            })
        });
    } catch (error) {
        console.error('save video tm failed:',videoID, tm, error);
    } finally {
    }
}

async function fetchFileList(op, dir) {
    showLoading(); // 请求开始时显示遮罩
    try {
        const response = await fetch('/browser', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                op: op,
                path: root,
                dir: dir
            })
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        root = resp["path"];
        pathName = resp["pathName"]
        const files = resp["items"];

        playlistFlag = resp["playlistFlag"]
        playlistID = resp["playlistID"]
        const canRemove = resp["canRemove"]

        const removeRoot = document.getElementById('removeRoot')
        if (canRemove) {
            removeRoot.style.display = 'inline';
        } else {
            removeRoot.style.display = 'none';
        }

        const renameRoot = document.getElementById('renameRoot')
        if (canRemove) {
            renameRoot.style.display = 'inline';
        } else {
            renameRoot.style.display = 'none';
        }


        const playList = document.getElementById('playlistGen')
        if (playlistFlag === 0) {
            playList.style.display = 'none';
        } else if (playlistFlag === 1) {
            playList.style.display = 'inline';
            playList.textContent = '▶️'
        } else {
            playList.style.display = 'inline';
            playList.textContent = '生成播放列表'
        }

        // 更新列表
        const rootUI = document.getElementById('root');
        rootUI.innerHTML = pathName;

        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';
        files.forEach(file => {
            fileList.innerHTML += createFileItem(file);
        });
    } catch (error) {
        console.error('获取文件列表失败:', error);
        Swal.fire('错误', '无法获取文件列表，请稍后重试', 'error');
    } finally {
        hideLoading(); // 请求完成（成功或失败）时隐藏遮罩
    }
}

function enterDir(filename) {
    fetchFileList("enter", filename).then(r => {});
}

let player = videojs('#video');
player.on('loadedmetadata', function() {
    //player.currentTime(0);
    //player.play();
});

//player.landscapeFullscreen();

let lastVideoTmReport = 0;

player.on("timeupdate", function(event) {
    if (Math.floor(Date.now() / 1000) - lastVideoTmReport > 2) {
        saveVideoTm(player.currentTime()).then(() => {});
        lastVideoTmReport = Math.floor(Date.now() / 1000);
    }
})
player.on('ended', async function () {
    await onPlayFinish();
});

player.on('error', function() {
    console.log('XXXXX',player.error);
});


videojs.hook('beforeerror', (player, err) => {
    if (err !== null) {
        const errMsg = err.message + err.toString();
        if (errMsg.includes('No compatible source') || errMsg.includes('Format error')
            || errMsg.includes('NotSupportedError')) {
            console.log('---8', "No compatible source", err)
        } else {
            console.log('err--', errMsg)
            console.log('err 2--', err)
        }
    }

    return err
})

function changeVideoSrc(file) {
    player.pause();
    setVideoSrc(root+"/"+file).then(() => {});;
}

function openFile(filename) {
    document.getElementById('playingVideo').textContent = '';
    document.getElementById('file-list-container').style.display = 'none';
    document.getElementById('video-container').style.display = 'block';
    changeVideoSrc(filename);
}

function videoBack() {
    player.pause();
    document.getElementById('video-container').style.display = 'none';
    document.getElementById('file-list-container').style.display = 'block';
    fetchFileList('flush').then(()=>{});
}

function openSourceSelectionDialog() {
    document.getElementById('sourceSelectionDialog').style.display = 'block';
}

function closeSourceSelectionDialog() {
    document.getElementById('sourceSelectionDialog').style.display = 'none';
}

function openSMBDialog() {
    document.getElementById('smbDialog').style.display = 'block';
    closeSourceSelectionDialog();
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
    }).then(()=>{});
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
    }).then(()=>{
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
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        const statusCode = resp["status_code"];
        const message = resp["message"];
        if (statusCode === 0) {
            Swal.fire({
                title: '成功',
                text: '测试成功',
                icon: 'success',
                customClass: {
                    popup: 'swal-popup-top'
                }
            });
            return;
        }

        Swal.fire({
            title: '失败',
            text: '测试失败: ' + message,
            icon: 'error',
            customClass: {
                popup: 'swal-popup-top'
            }
        });
    } catch (error) {
        console.error('获取文件列表失败:', error);
        Swal.fire({
            title: '错误',
            text: '无法获取文件列表，请稍后重试',
            icon: 'error',
            customClass: {
                popup: 'swal-popup-top'
            }
        });
    } finally {
        hideLoading(); // 请求完成（成功或失败）时隐藏遮罩
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
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        fetchFileList().then(()=>{});
    } catch (error) {
        console.error('获取文件列表失败:', error);
        Swal.fire('错误', '无法获取文件列表，请稍后重试', 'error');
    } finally {
        hideLoading(); // 请求完成（成功或失败）时隐藏遮罩
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
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        fetchFileList().then(()=>{});
    } catch (error) {
        console.error('重命名失败:', error);
        Swal.fire('错误', '重命名失败，请稍后重试', 'error');
    } finally {
        hideLoading(); // 请求完成（成功或失败）时隐藏遮罩
    }
}

function showRenameRootDialog() {
    closeRenameRootDialog();
    document.getElementById('reName').value = '';
    document.getElementById('renameRootDialog').style.display = 'block';
}

function closeRenameRootDialog() {
    document.getElementById('renameRootDialog').style.display = 'none';
}

function showDirectoryDialog() {
    closeSourceSelectionDialog();
    document.getElementById('directoryDialog').style.display = 'block';
}

function closeDirectoryDialog() {
    document.getElementById('directoryDialog').style.display = 'none';
}

function testDirectoryName() {
    const directoryName = document.getElementById('directoryName').value;
    console.log("测试目录名称:", directoryName);
    testRoot({
        rtype: 'local',
        local_path: directoryName,
    }).then(()=>{});
}

function confirmDirectoryName() {
    const directoryName = document.getElementById('directoryName').value;

    addRoot({
        rtype: 'local',
        local_path: directoryName,
    }).then(()=>{
        closeDirectoryDialog();
    });
}

async function playlistGen() {
    if (playlistFlag === 2) {
        await openPlaylistDialog();
    } else if (playlistFlag === 1) {
        root = playlistID;
        await fetchFileList("flush");
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
            })
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        const items = resp["items"];
        previewAndSavePlaylistDialog(items);
    } catch (error) {
        console.error('获取文件列表失败:', error);
        Swal.fire('错误', '无法获取文件列表，请稍后重试', 'error');
    } finally {
        hideLoading(); // 请求完成（成功或失败）时隐藏遮罩
    }
}

function previewAndSavePlaylistDialog(files) {
    const playlistDialog = document.getElementById('playlistDialog');
    const playlist = document.getElementById('playlist');
    playlist.innerHTML = ''; // 清空列表内容

    files.forEach((file, index) => {
        const li = document.createElement('li');
        li.textContent = file;
        li.draggable = true;
        li.style.padding = '10px';
        li.style.border = '1px solid #ccc';
        li.style.marginBottom = '5px';
        li.style.cursor = 'move';
        li.style.wordBreak = 'break-all';
        li.dataset.index = index;

        // 添加拖动事件
        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', e.target.dataset.index);
            e.target.classList.add('dragging');
            // Safari 兼容性：设置拖动图像
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

        // 添加拖出对话框删除功能
        li.addEventListener('dragend', (e) => {
            const rect = playlistDialog.getBoundingClientRect();
            if (
                e.clientX < rect.left || e.clientX > rect.right ||
                e.clientY < rect.top || e.clientY > rect.bottom
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
                        li.remove(); // 删除拖出的列表项
                    }
                });
            }
            e.target.classList.remove('dragging');
        });

        playlist.appendChild(li);
    });

    // 自动滚动功能
    playlist.addEventListener('dragover', (e) => {
        e.preventDefault();
        const scrollThreshold = 20; // 距离边缘的阈值
        const scrollSpeed = 5; // 滚动速度

        const rect = playlist.getBoundingClientRect();
        if (e.clientY < rect.top + scrollThreshold) {
            playlist.scrollTop -= scrollSpeed; // 向上滚动
        } else if (e.clientY > rect.bottom - scrollThreshold) {
            playlist.scrollTop += scrollSpeed; // 向下滚动
        }
    });

    const titleBar = document.getElementById("playlistTitle"); // 修复选择器错误

    playlistDialog.style.position = 'absolute';
    let isDragging = false;
    let offsetX = 0, offsetY = 0;

    titleBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - playlistDialog.offsetLeft;
        offsetY = e.clientY - playlistDialog.offsetTop;
        playlistDialog.style.zIndex = 1000; // 确保在最上层
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
}

function closePlaylistDialog() {
    document.getElementById('playlistDialog').style.display = 'none';
}

function confirmPlaylist() {
    const playlist = document.getElementById('playlist');
    const items = Array.from(playlist.children).map((li) => li.textContent);
    savePlaylist(items).then(()=>{
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
            })
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        // TODO
    } catch (error) {
        console.error('保存播放列表失败:', error);
        Swal.fire('错误', '无法保存播放列表，请稍后重试', 'error');
    } finally {
        hideLoading(); // 请求完成（成功或失败）时隐藏遮罩
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
            })
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        const next = resp["next"];
        if (curPlayingVideo === playingVideo) {
            if (next !== '') {
                changeVideoSrc(next);
            } else {
                videoBack();
            }
        }
    } catch (error) {
        console.error('保存播放列表失败:', error);
        Swal.fire('错误', '无法保存播放列表，请稍后重试', 'error');
    } finally {
        hideLoading(); // 请求完成（成功或失败）时隐藏遮罩
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
            })
        });

        if (!response.ok) {
            throw new Error('网络响应失败');
        }

        const resp = await response.json();
        const statusCode = resp["statusCode"];
        if (statusCode === 0) {
            root = '';

            Swal.fire({
                title: '成功',
                text: '移除成功',
                icon: 'success',
                customClass: {
                    popup: 'swal-popup-top'
                }
            });

            fetchFileList().then(()=>{});

            return
        }

        Swal.fire('错误', resp["message"], 'error');
    } catch (error) {
        console.error('保存播放列表失败:', error);
        Swal.fire('错误', '无法保存播放列表，请稍后重试', 'error');
    } finally {
        hideLoading(); // 请求完成（成功或失败）时隐藏遮罩
    }
}

function confirmRenameRoot() {
    const reNameText = document.getElementById('reName').value;

    reName({
        root: root,
        name: reNameText,
    }).then(()=>{
        closeRenameRootDialog();
    });
}

window.onload = function() {
    fetchFileList().then(()=>{});

    document.addEventListener('keydown', function(event) {
        // 仅在全屏模式下响应遥控器事件
        if (player.isFullscreen()) {
            switch(event.key) {
                case 'ArrowRight': // 右键：快进 10 秒
                    event.preventDefault();
                    player.currentTime(player.currentTime() + 10);
                    break;

                case 'ArrowLeft': // 左键：快退 10 秒
                    event.preventDefault();
                    player.currentTime(player.currentTime() - 10);
                    break;

                case 'Enter': // OK/Enter 键：播放/暂停
                    event.preventDefault();
                    if (player.paused()) {
                        player.play();
                    } else {
                        player.pause();
                    }
                    break;

                case 'ArrowUp': // 上键：音量增加
                    event.preventDefault();
                    player.volume(Math.min(player.volume() + 0.1, 1));
                    break;

                case 'ArrowDown': // 下键：音量减少
                    event.preventDefault();
                    player.volume(Math.max(player.volume() - 0.1, 0));
                    break;

                case 'Escape': // 退出键：退出全屏
                    event.preventDefault();
                    player.exitFullscreen();
                    break;

                default:
                    console.log('未绑定的按键:', event.key);
                    break;
            }
        }
    });
};

// 添加全局样式以确保 Swal 弹窗在最上层
const style = document.createElement('style');
style.innerHTML = `
    .swal-popup-top {
        z-index: 9999 !important; /* 提高 z-index 确保在所有元素之上 */
    }
    .swal2-container {
        z-index: 9999 !important; /* 确保 Swal2 弹窗容器也在最上层 */
    }
`;
document.head.appendChild(style);