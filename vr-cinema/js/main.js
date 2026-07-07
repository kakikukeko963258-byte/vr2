import * as THREE from 'three';
import { CinemaScene } from './scene.js';
import { AdjustableStereoEffect } from './stereo.js';
import { VRControls } from './controls.js';
import { GazeSystem } from './gaze.js';
import { YouTubeManager } from './youtube.js';
import { HUDManager } from './hud.js';
import { VRBrowser } from './vr-browser.js';
import { YouTubeSearch } from './search.js';

class App {
    constructor() {
        this.renderer = null;
        this.camera = null;
        this.clock = new THREE.Clock();
        this.animationFrameId = null;

        // モジュールマネージャー
        this.sceneManager = null;
        this.stereoEffect = null;
        this.controlsManager = null;
        this.gazeSystem = null;
        this.youtubeManager = null;
        this.hudManager = null;
        this.vrBrowser = null;
        
        // 3D VRメニュー
        this.vrMenuMesh = null;
        this.vrMenuButtons = [];

        // Piped検索（セットアップ画面用）
        this.setupSearch = new YouTubeSearch();

        // 状態
        this.isStereo = false;
        this.wakeLock = null;
        this.ytApiReady = false;

        this.initDOM();
        this.bindSetupEvents();
        this.checkOrientation();
    }

    initDOM() {
        this.setupScreen = document.getElementById('setup-screen');
        this.loadingScreen = document.getElementById('loading-screen');
        this.loadingStatus = document.getElementById('loading-status');
        this.theaterScreen = document.getElementById('theater-screen');
        this.orientationWarning = document.getElementById('orientation-warning');
        
        this.youtubeInput = document.getElementById('youtube-input');
        this.searchBtn = document.getElementById('search-btn');
        this.enterTheaterBtn = document.getElementById('enter-theater-btn');
        this.searchResultsGrid = document.getElementById('search-results-grid');
        this.searchResultsSection = document.getElementById('search-results-section');

        this.canvas = document.getElementById('three-canvas');
    }

    bindSetupEvents() {
        // キーワード検索 / URL読込
        this.searchBtn.addEventListener('click', () => this.handleSetupSearch());
        this.youtubeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSetupSearch();
        });

        // チップ（クイック再生）クリック
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const videoId = e.target.getAttribute('data-id');
                this.youtubeInput.value = `https://www.youtube.com/watch?v=${videoId}`;
                this.selectVideo(videoId);
            });
        });

        // シアターに入る
        this.enterTheaterBtn.addEventListener('click', () => this.enterTheater());

        // 画面の向き・リサイズ監視
        window.addEventListener('resize', () => {
            this.checkOrientation();
            this.handleResize();
        });
        window.addEventListener('orientationchange', () => this.checkOrientation());
    }

    checkOrientation() {
        // 縦向きか横向きか判定 (横長表示が必須)
        const isPortrait = window.innerHeight > window.innerWidth;
        if (isPortrait) {
            this.orientationWarning.classList.add('active');
            this.orientationWarning.style.display = 'flex';
        } else {
            this.orientationWarning.classList.remove('active');
            this.orientationWarning.style.display = 'none';
        }
    }

    // セットアップ画面での検索・動画解析
    async handleSetupSearch() {
        const input = this.youtubeInput.value.trim();
        if (input === '') return;

        // 1. YouTubeのURLかIDであるか確認
        const videoId = this.parseYouTubeId(input);
        if (videoId) {
            this.selectVideo(videoId);
            this.showSetupMessage('動画が検出されました。シアターに入れます！');
            return;
        }

        // 2. URLでない場合は、キーワードとしてPiped APIで検索
        this.searchBtn.disabled = true;
        this.searchBtn.textContent = '検索中...';
        this.searchResultsGrid.innerHTML = '';
        this.searchResultsSection.classList.remove('hidden');

        try {
            const results = await this.setupSearch.search(input);
            this.searchBtn.disabled = false;
            this.searchBtn.textContent = '検索 / 読込';

            if (results.length === 0) {
                this.searchResultsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">結果が見つかりませんでした。</p>';
                return;
            }

            results.forEach(item => {
                const card = document.createElement('div');
                card.className = 'result-card';
                card.innerHTML = `
                    <img src="${item.thumbnail}" alt="Thumbnail" onerror="this.src='https://via.placeholder.com/120x90/000/fff?text=No+Image'">
                    <div class="card-info">
                        <div class="card-title">${item.title}</div>
                        <div class="card-channel">${item.uploader}</div>
                        <div class="card-meta">${item.views} • ${item.duration}</div>
                    </div>
                `;
                card.addEventListener('click', () => {
                    document.querySelectorAll('.result-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    this.youtubeInput.value = `https://www.youtube.com/watch?v=${item.id}`;
                    this.selectVideo(item.id);
                });
                this.searchResultsGrid.appendChild(card);
            });
        } catch (e) {
            console.error('Setup Search error:', e);
            this.searchBtn.disabled = false;
            this.searchBtn.textContent = '検索 / 読込';
            this.searchResultsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:red;">エラー: ${e.message}</p>`;
        }
    }

    parseYouTubeId(url) {
        // 各種YouTube URLパターンの正規表現
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            return match[2];
        }
        
        // 11文字のベアIDかチェック
        if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return url;
        }

        // Shorts, Live などのURL対応
        const shortsRegExp = /\/(shorts|live)\/([a-zA-Z0-9_-]{11})/;
        const shortsMatch = url.match(shortsRegExp);
        if (shortsMatch && shortsMatch[2]) {
            return shortsMatch[2];
        }

        return null;
    }

    selectVideo(videoId) {
        this.selectedVideoId = videoId;
        this.enterTheaterBtn.removeAttribute('disabled');
        this.enterTheaterBtn.classList.remove('disabled');
    }

    showSetupMessage(msg) {
        const info = document.createElement('p');
        info.style.color = 'var(--primary)';
        info.style.marginTop = '10px';
        info.style.fontSize = '0.9rem';
        info.style.textAlign = 'center';
        info.textContent = msg;

        const container = document.querySelector('.input-section');
        const prevInfo = container.querySelector('.info-msg');
        if (prevInfo) prevInfo.remove();
        info.className = 'info-msg';
        container.appendChild(info);
    }

    // シアターへの入場（初期化と3D構築開始）
    async enterTheater() {
        if (!this.selectedVideoId) return;

        // ローディング開始
        this.setupScreen.classList.remove('active');
        this.loadingScreen.classList.add('active');
        this.loadingStatus.textContent = '3D空間を構築しています...';

        // iOS のオーディオコンテキスト有効化およびジャイロ許可の事前準備
        // (ユーザーインタラクションの直下でなければ実行できないため)
        
        // 1. WebGL レンダラーの初期化
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true, // 背景を透過（YouTubeの重ね合わせのため）
            powerPreference: "high-performance"
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 重いのでピクセル比は最大2に制限
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.autoClear = false;

        // 2. カメラ
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
        // カメラの初期位置 (中央列、アイレベル約1.6m)
        this.camera.position.set(0, 1.6, 6.0); 

        // 3. マネージャー群の初期化
        this.sceneManager = new CinemaScene();
        this.stereoEffect = new AdjustableStereoEffect(this.renderer);
        this.controlsManager = new VRControls(this.camera, this.canvas);
        this.gazeSystem = new GazeSystem(this.camera, this.sceneManager.scene);
        this.youtubeManager = new YouTubeManager(this.sceneManager, this.controlsManager);
        this.vrBrowser = new VRBrowser(this.sceneManager.scene, this.camera, this.gazeSystem, this.youtubeManager);

        this.hudManager = new HUDManager(
            this.sceneManager,
            this.controlsManager,
            this.youtubeManager,
            () => this.toggleVRMode(),
            () => this.exitTheater()
        );

        // IPD変更時にステレオエフェクトを更新するコールバックを設定
        this.hudManager.onIPDChange = (ipd) => {
            this.stereoEffect.setIPD(ipd);
        };

        // 初期設定の適用 (サイズ、距離、IPD)
        this.hudManager.applyInitialSettings(this.stereoEffect);

        // 4. VR 3Dコントロールメニュー（再生、ブラウザ開閉、退出）の構築
        this.buildVRMenu();

        // 5. YouTube IFrame APIの読み込みとプレイヤー準備
        this.loadingStatus.textContent = 'YouTubeプレイヤーをロード中...';
        
        try {
            await this.youtubeManager.initPlayers();
            this.youtubeManager.loadVideo(this.selectedVideoId);
        } catch (e) {
            console.error('Failed to load YouTube players:', e);
            alert('YouTubeの読み込みに失敗しました。再読み込みしてください。');
            this.exitTheater();
            return;
        }

        // 6. ジャイロセンサー許可要求
        this.loadingStatus.textContent = 'センサーの権限を確認しています...';
        await this.controlsManager.requestPermission();

        // スリープロック取得
        this.requestWakeLock();

        // 画面切り替え
        this.loadingScreen.classList.remove('active');
        this.theaterScreen.style.display = 'block';

        // レンダーループ開始
        this.clock.start();
        this.animate();
    }

    // VR用の3Dに浮かぶコントロールパネルを構築
    buildVRMenu() {
        const menuWidth = 2.4;
        const menuHeight = 0.5;
        const buttonCount = 3;

        // メインメニューの背景板
        const menuCanvas = document.createElement('canvas');
        menuCanvas.width = 768;
        menuCanvas.height = 160;
        const ctx = menuCanvas.getContext('2d');

        // メニューの再描画メソッド（ホバー等に対応）
        const drawMenu = (hoverIdx = -1) => {
            ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
            ctx.fillRect(0, 0, 768, 160);
            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, 764, 156);

            const buttons = ['再生/一時停止', '検索ブラウザ 🔍', '退出 🚪'];
            const btnW = 220;
            const btnH = 90;
            const startX = 40;
            const spacing = 44;

            buttons.forEach((label, idx) => {
                const x = startX + idx * (btnW + spacing);
                const y = 35;

                const isHover = hoverIdx === idx;
                
                // ボタン背景
                ctx.fillStyle = isHover ? '#d4af37' : 'rgba(255, 255, 255, 0.08)';
                ctx.fillRect(x, y, btnW, btnH);
                ctx.strokeStyle = isHover ? '#ffffff' : 'rgba(214, 175, 55, 0.3)';
                ctx.strokeRect(x, y, btnW, btnH);

                // ラベル
                ctx.fillStyle = isHover ? '#000000' : '#ffffff';
                ctx.font = 'bold 24px "Noto Sans JP"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, x + btnW/2, y + btnH/2);
            });

            menuTexture.needsUpdate = true;
        };

        const menuTexture = new THREE.CanvasTexture(menuCanvas);
        const material = new THREE.MeshBasicMaterial({
            map: menuTexture,
            transparent: true,
            side: THREE.DoubleSide
        });

        const geometry = new THREE.PlaneGeometry(menuWidth, menuHeight);
        this.vrMenuMesh = new THREE.Mesh(geometry, material);
        
        // 視聴者の少し手前、足元付近に配置
        this.vrMenuMesh.position.set(0, 0.5, 3.2); // Z = 3.2、カメラは Z = 6.0、スクリーンは Z = -12.0
        this.vrMenuMesh.rotation.x = -Math.PI / 6; // 少し上向きに傾けて見やすくする
        
        this.sceneManager.scene.add(this.vrMenuMesh);

        // ボタンごとの個別のGaze検知用ダミーオブジェクト（透明な当たり判定ボックス）を乗せる
        const btnGeo = new THREE.PlaneGeometry(0.7, 0.35);
        const btnMat = new THREE.MeshBasicMaterial({ visible: false }); // 非表示
        
        const btnXOffsets = [-0.85, 0, 0.85];

        for (let i = 0; i < buttonCount; i++) {
            const btnMesh = new THREE.Mesh(btnGeo, btnMat);
            btnMesh.position.set(btnXOffsets[i], 0, 0.01);
            this.vrMenuMesh.add(btnMesh); // 親メニューの子にする

            // ゲイズハンドラーの登録
            this.gazeSystem.registerObject(btnMesh, {
                onOver: () => drawMenu(i),
                onOut: () => drawMenu(-1),
                onClick: () => {
                    if (i === 0) {
                        this.youtubeManager.togglePlay();
                    } else if (i === 1) {
                        // 3D VRブラウザパネルの表示・非表示トグル
                        this.vrBrowser.setVisible(!this.vrBrowser.visible);
                    } else if (i === 2) {
                        this.exitTheater();
                    }
                }
            });

            this.vrMenuButtons.push(btnMesh);
        }

        drawMenu(); // 初回描画
    }

    // VRモード（ステレオ2画面）と通常モード（1画面）のトグル
    toggleVRMode() {
        this.isStereo = !this.isStereo;

        const nose = document.getElementById('nose-bridge');
        const divider = document.getElementById('vr-divider');
        const vrBtn = document.getElementById('btn-vr-toggle');

        this.youtubeManager.setStereoMode(this.isStereo);
        this.gazeSystem.setEnabled(this.isStereo); // VR時のみ視線カーソルON

        if (this.isStereo) {
            // VR モード
            nose.classList.remove('hidden');
            divider.classList.remove('hidden');
            vrBtn.textContent = '📱 通常モード';
            vrBtn.classList.remove('primary');
            vrBtn.classList.add('danger');

            // VR時は自動でデバイスにフルスクリーンを要求 (可能なら)
            this.requestFullscreen();
            
            // 視線の邪魔にならないよう、2D HUDパネルは自動で畳む
            document.getElementById('hud-panel').classList.add('collapsed');
        } else {
            // 通常モード
            nose.classList.add('hidden');
            divider.classList.add('hidden');
            vrBtn.textContent = '🕶️ VRモード切替';
            vrBtn.classList.remove('danger');
            vrBtn.classList.add('primary');

            this.exitFullscreen();
        }

        this.handleResize(); // 各種コンテナアスペクトの更新
    }

    requestFullscreen() {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) docEl.requestFullscreen();
        else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
        else if (docEl.mozRequestFullScreen) docEl.mozRequestFullScreen();
        else if (docEl.msRequestFullscreen) docEl.msRequestFullscreen();
    }

    exitFullscreen() {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
    }

    // 画面スリープ防止 (iOS 16.4+ 対応)
    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('[App] Wake Lock is active');
            } catch (err) {
                console.warn('[App] Wake lock request failed:', err.message);
            }
        }
    }

    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release().then(() => {
                this.wakeLock = null;
                console.log('[App] Wake Lock released');
            });
        }
    }

    handleResize() {
        if (!this.renderer || !this.camera) return;

        const w = window.innerWidth;
        const h = window.innerHeight;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();

        if (this.stereoEffect) {
            this.stereoEffect.setSize(w, h);
        }
    }

    // メインアニメーション（レンダーループ）
    animate() {
        this.animationFrameId = requestAnimationFrame(() => this.animate());

        const deltaTime = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();

        // 1. ヘッドトラッキングの更新
        if (this.controlsManager) {
            this.controlsManager.update();
        }

        // 2. 空間オーディオ音量減衰の更新
        if (this.youtubeManager) {
            this.youtubeManager.updateSpatialAudio();
        }

        // 3. ゲイズシステムの更新
        if (this.gazeSystem && this.isStereo) {
            this.gazeSystem.update(deltaTime);
        }

        // 4. VR内3Dブラウザのホバー更新
        if (this.vrBrowser && this.vrBrowser.visible) {
            this.vrBrowser.update();
        }

        // 5. 3Dシーンのアニメーション（星のまたたきなど）
        if (this.sceneManager) {
            this.sceneManager.animate(elapsedTime);
        }

        // 6. レンダリング実行
        if (this.isStereo && this.stereoEffect && this.sceneManager) {
            this.stereoEffect.render(this.sceneManager.scene, this.camera);
        } else if (this.renderer && this.sceneManager) {
            this.renderer.render(this.sceneManager.scene, this.camera);
        }

        // 7. YouTube iframe の3D座標へのフィッティング投影
        if (this.youtubeManager && this.stereoEffect) {
            this.youtubeManager.updateIframeProjection(this.stereoEffect);
        }
    }

    // シアターの終了、セットアップ画面へ戻る
    exitTheater() {
        // アニメーション停止
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        this.releaseWakeLock();
        this.exitFullscreen();

        // VRモードの解除
        if (this.isStereo) {
            this.toggleVRMode();
        }

        // 各種モジュールの解体
        if (this.gazeSystem) {
            this.gazeSystem.clearObjects();
            this.gazeSystem.setEnabled(false);
            this.gazeSystem = null;
        }

        if (this.controlsManager) {
            this.controlsManager.dispose();
            this.controlsManager = null;
        }

        if (this.youtubeManager) {
            this.youtubeManager.dispose();
            this.youtubeManager = null;
        }

        if (this.sceneManager) {
            this.sceneManager.dispose();
            this.sceneManager = null;
        }

        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }

        this.vrMenuMesh = null;
        this.vrMenuButtons = [];
        this.vrBrowser = null;
        this.hudManager = null;
        this.camera = null;

        // UIの切り替え
        this.theaterScreen.style.display = 'none';
        this.setupScreen.classList.add('active');
        
        // 入力値をリセット
        this.youtubeInput.value = '';
        this.enterTheaterBtn.setAttribute('disabled', 'true');
        this.enterTheaterBtn.classList.add('disabled');
        this.searchResultsSection.classList.add('hidden');
        this.searchResultsGrid.innerHTML = '';
        
        const prevInfo = document.querySelector('.info-msg');
        if (prevInfo) prevInfo.remove();
    }
}

// アプリの初期化
window.addEventListener('DOMContentLoaded', () => {
    // グローバルにAppインスタンスを作成
    window.app = new App();
});
