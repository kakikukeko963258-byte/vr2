import * as THREE from 'three';

export class VRControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.enabled = true;
        this.useGyro = false;

        // ジャイロデータ
        this.deviceOrientation = {
            alpha: 0,
            beta: 0,
            gamma: 0,
            orient: 0
        };

        // タッチ/マウス回転用
        this.touchRotation = {
            pitch: 0, // 上下回転 (X軸)
            yaw: 0    // 左右回転 (Y軸)
        };
        
        // センタリング用オフセット
        this.alphaOffset = 0;
        this.recenterRequested = false;

        // 一時計算用オブジェクト
        this.zee = new THREE.Vector3(0, 0, 1);
        this.euler = new THREE.Euler();
        this.q0 = new THREE.Quaternion();
        this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90 deg X軸回転

        // バインド
        this.onDeviceOrientation = this.onDeviceOrientation.bind(this);
        this.onScreenOrientation = this.onScreenOrientation.bind(this);
        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchMove = this.onTouchMove.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);

        this.initListeners();
    }

    initListeners() {
        // 画面の向きの変更
        window.addEventListener('orientationchange', this.onScreenOrientation, false);
        window.addEventListener('resize', this.onScreenOrientation, false);

        // マウスとタッチのフォールバック (キャンバスは pointer-events: none のため document にバインド)
        document.addEventListener('touchstart', this.onTouchStart, { passive: false });
        document.addEventListener('touchmove', this.onTouchMove, { passive: false });
        
        // PC用のマウスドラッグ操作
        this.isMouseDown = false;
        this.previousMousePosition = { x: 0, y: 0 };
        document.addEventListener('mousedown', this.onMouseDown, false);
        document.addEventListener('mousemove', this.onMouseMove, false);
        document.addEventListener('mouseup', this.onMouseUp, false);

        // 初期の画面向きを取得
        this.onScreenOrientation();
    }

    // イベント発生源が HUD などの UI 要素かどうか判定する
    isUIElement(target) {
        if (!target) return false;
        let el = target;
        while (el) {
            if (el.id === 'hud-panel' || el.id === 'setup-screen' || el.id === 'orientation-warning' || el.id === 'loading-screen') {
                return true;
            }
            el = el.parentElement;
        }
        return false;
    }

    // ジャイロパーミッションの要求（iOS 13+ 専用、クリックイベント内から実行する必要あり）
    async requestPermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const response = await DeviceOrientationEvent.requestPermission();
                if (response === 'granted') {
                    window.addEventListener('deviceorientation', this.onDeviceOrientation, false);
                    this.useGyro = true;
                    return true;
                }
                return false;
            } catch (e) {
                console.error('DeviceOrientation permission request error:', e);
                return false;
            }
        } else {
            // Androidやデスクトップなど、パーミッション不要なブラウザ
            if ('ondeviceorientation' in window) {
                window.addEventListener('deviceorientation', this.onDeviceOrientation, false);
                this.useGyro = true;
                return true;
            }
            return false;
        }
    }

    onDeviceOrientation(event) {
        if (!this.enabled) return;

        // alpha: z軸回転 (0〜360度)
        // beta: x軸回転 (-180〜180度)
        // gamma: y軸回転 (-90〜90度)
        this.deviceOrientation.alpha = event.alpha || 0;
        this.deviceOrientation.beta = event.beta || 0;
        this.deviceOrientation.gamma = event.gamma || 0;

        // 初めてジャイロイベントをキャッチしたときにセンタリングを要求する
        if (this.alphaOffset === 0 && event.alpha !== null) {
            this.recenterRequested = true;
        }
    }

    onScreenOrientation() {
        // window.orientation は非推奨だがiOSで最も安定して動作する
        this.deviceOrientation.orient = window.orientation ? THREE.MathUtils.degToRad(window.orientation) : 0;
        
        if (screen.orientation && screen.orientation.angle) {
            this.deviceOrientation.orient = THREE.MathUtils.degToRad(screen.orientation.angle);
        }
    }

    // --- マウス/タッチ操作 ---

    onTouchStart(e) {
        if (!this.enabled || this.useGyro) return;
        if (this.isUIElement(e.target)) return; // HUDなどのUI操作時はカメラ回転を無視

        if (e.touches.length === 1) {
            this.previousMousePosition.x = e.touches[0].pageX;
            this.previousMousePosition.y = e.touches[0].pageY;
        }
    }

    onTouchMove(e) {
        if (!this.enabled || this.useGyro) return;
        if (this.isUIElement(e.target)) return; // HUDなどのUI操作時はスルー

        if (e.touches.length === 1) {
            e.preventDefault(); // スクロール防止
            const deltaX = e.touches[0].pageX - this.previousMousePosition.x;
            const deltaY = e.touches[0].pageY - this.previousMousePosition.y;

            // スピード調整
            this.touchRotation.yaw -= deltaX * 0.005;
            this.touchRotation.pitch -= deltaY * 0.005;
            this.clampPitch();

            this.previousMousePosition.x = e.touches[0].pageX;
            this.previousMousePosition.y = e.touches[0].pageY;
        }
    }

    onMouseDown(e) {
        if (!this.enabled || this.useGyro) return;
        if (this.isUIElement(e.target)) return; // UI操作時

        this.isMouseDown = true;
        this.previousMousePosition.x = e.clientX;
        this.previousMousePosition.y = e.clientY;
    }

    onMouseMove(e) {
        if (!this.enabled || !this.isMouseDown || this.useGyro) return;
        if (this.isUIElement(e.target)) return;

        const deltaX = e.clientX - this.previousMousePosition.x;
        const deltaY = e.clientY - this.previousMousePosition.y;

        this.touchRotation.yaw -= deltaX * 0.003;
        this.touchRotation.pitch -= deltaY * 0.003;
        this.clampPitch();

        this.previousMousePosition.x = e.clientX;
        this.previousMousePosition.y = e.clientY;
    }

    onMouseUp() {
        this.isMouseDown = false;
    }

    clampPitch() {
        // カメラの上下角を制限 (真上や真下を向きすぎないようにする)
        const maxPitch = Math.PI / 2.5; // 約72度
        this.touchRotation.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.touchRotation.pitch));
    }

    // センタリング（現在向いている方向を正面にする）
    recenter() {
        if (this.useGyro) {
            // ジャイロモード時: 現在のalpha角をオフセットとして記録
            this.alphaOffset = -this.deviceOrientation.alpha;
        } else {
            // タッチモード時: 回転角度をリセット
            this.touchRotation.pitch = 0;
            this.touchRotation.yaw = 0;
        }
    }

    update() {
        if (!this.enabled) return;

        if (this.useGyro) {
            // ジャイロセンサーから回転を計算
            const alpha = THREE.MathUtils.degToRad(this.deviceOrientation.alpha) + THREE.MathUtils.degToRad(this.alphaOffset);
            const beta = THREE.MathUtils.degToRad(this.deviceOrientation.beta);
            const gamma = THREE.MathUtils.degToRad(this.deviceOrientation.gamma);
            const orient = this.deviceOrientation.orient;

            this.euler.set(beta, alpha, -gamma, 'YXZ'); // iOS/Androidの標準オイラーシーケンス

            const q = this.camera.quaternion;
            q.setFromEuler(this.euler); // デバイス座標にセット
            q.multiply(this.q1); // ワールド座標（-X軸90度回転）へ調整
            q.multiply(this.q0.setFromAxisAngle(this.zee, -orient)); // 画面回転角度で補正

            // 初回自動センタリング要求の処理
            if (this.recenterRequested) {
                this.recenter();
                this.recenterRequested = false;
            }
        } else {
            // タッチまたはマウスドラッグから回転を計算
            this.euler.set(this.touchRotation.pitch, this.touchRotation.yaw, 0, 'YXZ');
            this.camera.quaternion.setFromEuler(this.euler);
        }
    }

    // イベントリスナーのクリア
    dispose() {
        window.removeEventListener('orientationchange', this.onScreenOrientation);
        window.removeEventListener('resize', this.onScreenOrientation);
        window.removeEventListener('deviceorientation', this.onDeviceOrientation);
        
        this.domElement.removeEventListener('touchstart', this.onTouchStart);
        this.domElement.removeEventListener('touchmove', this.onTouchMove);
        this.domElement.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
        
        this.enabled = false;
    }
}
