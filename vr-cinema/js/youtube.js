import { AdjustableStereoEffect } from './stereo.js';

export class YouTubeManager {
    constructor(sceneManager, controlsManager) {
        this.sceneManager = sceneManager;
        this.controlsManager = controlsManager;

        this.players = {
            normal: null,
            left: null,
            right: null
        };

        this.states = {
            normal: -1,
            left: -1,
            right: -1
        };

        this.currentVideoId = 'jNQXAC9IVRw'; // デフォルト紹介動画
        this.isStereo = false;
        
        // 基本音量設定 (0〜100)
        this.baseVolume = 50;
        this.currentVolume = 50;

        // 同期関連
        this.syncIntervalId = null;
        this.lastSyncTime = 0;

        // 空間オーディオ用の最終更新角度
        this.lastSpatialAngle = 0;
        this.spatialAudioEnabled = true;

        // バインド
        this.onPlayerStateChange = this.onPlayerStateChange.bind(this);
    }

    // プレイヤーの初期化 (IFrame API の準備完了後に呼ぶ)
    initPlayers() {
        return new Promise((resolve) => {
            let loadedCount = 0;
            const checkResolve = () => {
                loadedCount++;
                if (loadedCount === 3) {
                    resolve();
                }
            };

            // 通常モード用プレイヤー
            this.players.normal = new YT.Player('yt-normal', {
                height: '100%',
                width: '100%',
                videoId: this.currentVideoId,
                playerVars: {
                    controls: 1,
                    rel: 0,
                    showinfo: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    fs: 0 // フルスクリーンボタン無効化 (自前でVRするため)
                },
                events: {
                    'onReady': () => {
                        this.players.normal.setVolume(this.baseVolume);
                        checkResolve();
                    },
                    'onStateChange': (e) => this.onPlayerStateChange('normal', e)
                }
            });

            // ステレオ左目用プレイヤー (音あり、コントロールなし)
            this.players.left = new YT.Player('yt-left', {
                height: '100%',
                width: '100%',
                videoId: this.currentVideoId,
                playerVars: {
                    controls: 0,
                    rel: 0,
                    disablekb: 1,
                    fs: 0,
                    playsinline: 1,
                    modestbranding: 1
                },
                events: {
                    'onReady': () => {
                        this.players.left.setVolume(this.baseVolume);
                        checkResolve();
                    },
                    'onStateChange': (e) => this.onPlayerStateChange('left', e)
                }
            });

            // ステレオ右目用プレイヤー (完全ミュート、コントロールなし)
            this.players.right = new YT.Player('yt-right', {
                height: '100%',
                width: '100%',
                videoId: this.currentVideoId,
                playerVars: {
                    controls: 0,
                    rel: 0,
                    disablekb: 1,
                    fs: 0,
                    playsinline: 1,
                    modestbranding: 1
                },
                events: {
                    'onReady': () => {
                        this.players.right.mute(); // 右は完全にミュート
                        checkResolve();
                    },
                    'onStateChange': (e) => this.onPlayerStateChange('right', e)
                }
            });
        });
    }

    onPlayerStateChange(playerKey, event) {
        const state = event.data;
        this.states[playerKey] = state;

        // 再生ステータスに応じて劇場の照明を切り替える
        if (playerKey === (this.isStereo ? 'left' : 'normal')) {
            const isPlaying = (state === YT.PlayerState.PLAYING);
            this.sceneManager.updateLightsForPlayState(isPlaying);
        }
    }

    // 動画をキュー、またはロードする
    loadVideo(videoId) {
        this.currentVideoId = videoId;
        
        if (this.isStereo) {
            // ステレオプレイヤー両方にロード
            if (this.players.left && this.players.left.loadVideoById) {
                this.players.left.loadVideoById(videoId);
            }
            if (this.players.right && this.players.right.loadVideoById) {
                this.players.right.loadVideoById(videoId);
                this.players.right.mute(); // ロード後も確実にミュート
            }
        } else {
            // 通常プレイヤーにロード
            if (this.players.normal && this.players.normal.loadVideoById) {
                this.players.normal.loadVideoById(videoId);
            }
        }
    }

    // VRモード（ステレオ）と通常モードの切り替え
    setStereoMode(isStereo) {
        this.isStereo = isStereo;

        const normalContainer = document.getElementById('yt-normal-container');
        const stereoContainer = document.getElementById('yt-stereo-container');

        if (isStereo) {
            // 通常からステレオへ切り替え
            normalContainer.classList.add('hidden');
            stereoContainer.classList.remove('hidden');

            // 現在の再生時間と状態を取得してステレオへ引き継ぐ
            if (this.players.normal) {
                const curTime = this.players.normal.getCurrentTime();
                const normalState = this.states.normal;

                // 左・右プレイヤーに反映
                if (this.players.left && this.players.left.seekTo) {
                    this.players.left.seekTo(curTime, true);
                    this.players.right.seekTo(curTime, true);

                    if (normalState === YT.PlayerState.PLAYING) {
                        this.players.left.playVideo();
                        this.players.right.playVideo();
                    } else {
                        this.players.left.pauseVideo();
                        this.players.right.pauseVideo();
                    }
                }
                this.players.normal.pauseVideo();
            }

            this.startSyncLoop();
        } else {
            // ステレオから通常へ切り替え
            normalContainer.classList.remove('hidden');
            stereoContainer.classList.add('hidden');

            this.stopSyncLoop();

            // 左プレーヤーの状態を通常へ引き継ぐ
            if (this.players.left) {
                const curTime = this.players.left.getCurrentTime();
                const leftState = this.states.left;

                if (this.players.normal && this.players.normal.seekTo) {
                    this.players.normal.seekTo(curTime, true);
                    if (leftState === YT.PlayerState.PLAYING) {
                        this.players.normal.playVideo();
                    } else {
                        this.players.normal.pauseVideo();
                    }
                }

                // ステレオ用は両方一時停止
                this.players.left.pauseVideo();
                this.players.right.pauseVideo();
            }
        }
    }

    // 左右の同期ループ
    startSyncLoop() {
        this.stopSyncLoop();
        
        this.syncIntervalId = setInterval(() => {
            this.syncLeftRightPlayers();
        }, 100); // 100msごとに高精度で同期チェック
    }

    stopSyncLoop() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
    }

    syncLeftRightPlayers() {
        if (!this.players.left || !this.players.right || !this.isStereo) return;
        
        // 両方のAPIメソッドが有効であることを確認
        if (typeof this.players.left.getCurrentTime !== 'function' || 
            typeof this.players.right.getCurrentTime !== 'function') return;

        const leftTime = this.players.left.getCurrentTime();
        const rightTime = this.players.right.getCurrentTime();
        const leftState = this.states.left;
        const rightState = this.states.right;

        // 1. 再生状態の同期
        if (leftState !== rightState && leftState !== YT.PlayerState.BUFFERING) {
            if (leftState === YT.PlayerState.PLAYING) {
                this.players.right.playVideo();
            } else if (leftState === YT.PlayerState.PAUSED) {
                this.players.right.pauseVideo();
            }
        }

        // 2. 再生位置（タイムラグ）の同期
        const drift = Math.abs(leftTime - rightTime);
        if (drift > 0.08) { // 80ms以上のズレでシーク同期
            this.players.right.seekTo(leftTime, true);
        }
    }

    // 空間オーディオ風の音量計算（毎フレーム呼ぶ）
    updateSpatialAudio() {
        if (!this.spatialAudioEnabled) return;

        const activePlayer = this.isStereo ? this.players.left : this.players.normal;
        if (!activePlayer || typeof activePlayer.setVolume !== 'function') return;

        // カメラの向き（Quaternion）から正面方向（ワールドZ負方向）に対する角度差を計算
        const camera = this.controlsManager.camera;
        
        // カメラの正面ベクトルを取得
        const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        
        // スクリーン方向ベクトル（簡易的に常に Z = -1 方向）
        const screenDir = new THREE.Vector3(0, 0, -1);
        
        // 2つのベクトルの内積（1.0 = 正面、-1.0 = 真後ろ）
        const dotProduct = lookDir.dot(screenDir);

        // 内積から角度差 (ラジアン) を計算
        const angleDiff = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

        // 変化が非常に小さい場合は更新をスキップ（API負荷削減、ノイズ防止）
        if (Math.abs(angleDiff - this.lastSpatialAngle) < 0.03) return; // 約1.7度以下の変化は無視
        this.lastSpatialAngle = angleDiff;

        // 音量減衰の計算: 正面=1.0、真横=0.7、真後ろ=0.35
        // 角度が大きくなるほど減衰する
        // angleDiff は 0 (正面) から Math.PI (真後ろ、約3.14)
        const attenuation = 0.35 + 0.65 * Math.pow(Math.cos(angleDiff / 2), 2); // 角度半減のコサイン二乗で滑らかに

        // ボリューム適用
        const targetVolume = Math.round(this.baseVolume * attenuation);
        
        if (targetVolume !== this.currentVolume) {
            this.currentVolume = targetVolume;
            activePlayer.setVolume(this.currentVolume);
        }
    }

    // 基本音量の変更
    setBaseVolume(volume) {
        this.baseVolume = Math.max(0, Math.min(100, volume));
        this.lastSpatialAngle = -999; // 次回強制アップデート
        this.updateSpatialAudio();
    }

    // 毎フレーム呼び出され、3Dスクリーンの位置に合わせてYouTubeのIFrame位置と形状を更新（投影）する
    updateIframeProjection(stereoEffect) {
        const screenHole = this.sceneManager.meshes.screenHole;
        if (!screenHole) return;

        const camera = this.controlsManager.camera;
        const corners2D = stereoEffect.projectScreenCorners(screenHole, camera, this.isStereo);

        // スクリーンのアスペクト比に基づき元の解像度を設定 (16:9)
        const w = 1920;
        const h = 1080;

        if (!this.isStereo) {
            // 通常モード
            const iframe = document.getElementById('yt-normal');
            if (iframe && corners2D.normal) {
                // ホモグラフィ行列を適用して3Dスクリーンの歪みを再現
                const matrixCSS = AdjustableStereoEffect.getHomographyMatrix3D(w, h, corners2D.normal);
                iframe.style.width = w + 'px';
                iframe.style.height = h + 'px';
                iframe.style.transform = `translate(0, 0) ${matrixCSS}`;
                
                // カメラの後ろにスクリーンがある場合は非表示にする (裏返り防止)
                const screenPos = new THREE.Vector3(0, this.sceneManager.screenSettings.yOffset, -this.sceneManager.screenSettings.distance);
                const toScreen = screenPos.sub(camera.position).normalize();
                const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                if (lookDir.dot(toScreen) < 0.2) {
                    iframe.style.opacity = '0';
                } else {
                    iframe.style.opacity = '1';
                }
            }
        } else {
            // ステレオモード (左右それぞれ個別に投影)
            const iframeL = document.getElementById('yt-left'); // YT APIが置き換えたiframe要素を直接取得
            const iframeR = document.getElementById('yt-right');

            const screenPos = new THREE.Vector3(0, this.sceneManager.screenSettings.yOffset, -this.sceneManager.screenSettings.distance);
            const toScreen = screenPos.sub(camera.position).normalize();
            const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const isBehind = lookDir.dot(toScreen) < 0.2;

            if (iframeL && corners2D.left) {
                const matrixCSS = AdjustableStereoEffect.getHomographyMatrix3D(w, h, corners2D.left);
                iframeL.style.width = w + 'px';
                iframeL.style.height = h + 'px';
                iframeL.style.transform = `translate(0, 0) ${matrixCSS}`;
                iframeL.style.opacity = isBehind ? '0' : '1';
            }

            if (iframeR && corners2D.right) {
                const matrixCSS = AdjustableStereoEffect.getHomographyMatrix3D(w, h, corners2D.right);
                iframeR.style.width = w + 'px';
                iframeR.style.height = h + 'px';
                iframeR.style.transform = `translate(0, 0) ${matrixCSS}`;
                iframeR.style.opacity = isBehind ? '0' : '1';
            }
        }
    }

    // 再生/一時停止トグル
    togglePlay() {
        const activePlayer = this.isStereo ? this.players.left : this.players.normal;
        const activeState = this.isStereo ? this.states.left : this.states.normal;

        if (!activePlayer) return;

        if (activeState === YT.PlayerState.PLAYING) {
            activePlayer.pauseVideo();
            if (this.isStereo && this.players.right) {
                this.players.right.pauseVideo();
            }
        } else {
            activePlayer.playVideo();
            if (this.isStereo && this.players.right) {
                this.players.right.playVideo();
            }
        }
    }

    // 解放処理
    dispose() {
        this.stopSyncLoop();
        
        try {
            if (this.players.normal && this.players.normal.destroy) this.players.normal.destroy();
            if (this.players.left && this.players.left.destroy) this.players.left.destroy();
            if (this.players.right && this.players.right.destroy) this.players.right.destroy();
        } catch (e) {
            console.error('Error destroying YT players:', e);
        }

        this.players = { normal: null, left: null, right: null };
        this.states = { normal: -1, left: -1, right: -1 };
    }
}
