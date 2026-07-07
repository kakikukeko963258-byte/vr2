import * as THREE from 'three';

export class GazeSystem {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        
        this.raycaster = new THREE.Raycaster();
        this.interactiveObjects = [];

        this.hoveredObject = null;
        this.dwellTime = 0;
        this.dwellThreshold = 2.0; // 2秒間見つめたらクリック

        // HTML要素 (SVG レティクル)
        this.progressElements = document.querySelectorAll('.reticle-progress');
        this.reticleContainer = document.getElementById('gaze-cursor-container');
        
        // 円周 (2 * PI * r) r=40
        this.maxDashOffset = 251.2;

        this.enabled = false;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (enabled) {
            this.reticleContainer.classList.remove('hidden');
            this.resetReticle();
        } else {
            this.reticleContainer.classList.add('hidden');
            this.clearHover();
        }
    }

    /**
     * インタラクティブな3Dオブジェクトを登録する
     * @param {THREE.Object3D} object 登録するオブジェクト
     * @param {Object} handlers イベントハンドラ { onOver, onOut, onClick }
     */
    registerObject(object, handlers) {
        object.userData.gazeHandlers = handlers;
        
        // すでに登録されているかチェック
        if (!this.interactiveObjects.includes(object)) {
            this.interactiveObjects.push(object);
        }
    }

    /**
     * オブジェクトの登録を解除する
     */
    unregisterObject(object) {
        const index = this.interactiveObjects.indexOf(object);
        if (index > -1) {
            this.interactiveObjects.splice(index, 1);
        }
        delete object.userData.gazeHandlers;
    }

    // 全ての登録済みオブジェクトをクリア
    clearObjects() {
        this.interactiveObjects.forEach(obj => {
            delete obj.userData.gazeHandlers;
        });
        this.interactiveObjects = [];
        this.hoveredObject = null;
    }

    // ドウェルタイマーのリセットとレティクル描画初期化
    resetReticle() {
        this.dwellTime = 0;
        this.progressElements.forEach(el => {
            el.style.strokeDashoffset = this.maxDashOffset;
        });
    }

    // ホバー状態の解除
    clearHover() {
        if (this.hoveredObject) {
            const handlers = this.hoveredObject.userData.gazeHandlers;
            if (handlers && typeof handlers.onOut === 'function') {
                handlers.onOut(this.hoveredObject);
            }
            this.hoveredObject = null;
        }
        this.resetReticle();
    }

    /**
     * 毎フレームのアップデート
     * @param {number} deltaTime 前回のフレームからの経過時間 (秒)
     */
    update(deltaTime) {
        if (!this.enabled || this.interactiveObjects.length === 0) return;

        // 画面中心 (NDC 0,0) からレイを射出
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        
        // 登録されているオブジェクト群との交差判定
        const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

        if (intersects.length > 0) {
            // 最も手前にあるオブジェクトを取得
            // グループの子要素がヒットした場合は、ハンドラを持つ親を探す
            let hitObject = intersects[0].object;
            while (hitObject && !hitObject.userData.gazeHandlers && hitObject.parent) {
                hitObject = hitObject.parent;
            }

            if (hitObject && hitObject.userData.gazeHandlers) {
                if (hitObject === this.hoveredObject) {
                    // 同じオブジェクトをホバーし続けている場合: タイマー進行
                    this.dwellTime += deltaTime;
                    
                    // レティクルの円形アニメーション進捗を更新
                    const progress = Math.min(1.0, this.dwellTime / this.dwellThreshold);
                    const offset = this.maxDashOffset * (1.0 - progress);
                    
                    this.progressElements.forEach(el => {
                        el.style.strokeDashoffset = offset;
                    });

                    // 2秒経過したらクリック発火
                    if (this.dwellTime >= this.dwellThreshold) {
                        this.triggerClick(hitObject);
                    }
                } else {
                    // 新しいオブジェクトに視線が移った場合
                    this.clearHover();
                    
                    this.hoveredObject = hitObject;
                    this.dwellTime = 0;

                    const handlers = hitObject.userData.gazeHandlers;
                    if (handlers && typeof handlers.onOver === 'function') {
                        handlers.onOver(hitObject);
                    }
                }
            } else {
                // ハンドラを持たない親に当たった場合
                this.clearHover();
            }
        } else {
            // 何も見ていない場合
            this.clearHover();
        }
    }

    triggerClick(object) {
        // クリック音や視覚フィードバック（一時的にレティクルを光らせる）
        this.flashReticle();

        const handlers = object.userData.gazeHandlers;
        if (handlers && typeof handlers.onClick === 'function') {
            handlers.onClick(object);
        }

        // クリック後は誤連打を防ぐため一時的にタイマーをリセット
        this.resetReticle();
        
        // 即座に再ホバー開始されないようにhover状態も一度クリア
        this.hoveredObject = null;
    }

    flashReticle() {
        this.progressElements.forEach(el => {
            el.style.transition = 'none';
            el.style.stroke = '#ffffff';
            el.style.strokeDashoffset = 0;
            
            setTimeout(() => {
                el.style.transition = 'stroke-dashoffset 0.1s linear, stroke 0.2s';
                el.style.stroke = 'var(--primary)';
                el.style.strokeDashoffset = this.maxDashOffset;
            }, 150);
        });
    }
}
