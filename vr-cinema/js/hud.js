export class HUDManager {
    constructor(sceneManager, controlsManager, youtubeManager, onVRToggle, onExit) {
        this.sceneManager = sceneManager;
        this.controlsManager = controlsManager;
        this.youtubeManager = youtubeManager;
        this.onVRToggle = onVRToggle;
        this.onExit = onExit;

        // 設定の初期値
        this.settings = {
            ipd: 64,
            size: 8.0,
            dist: 12.0,
            ambient: 0.1
        };

        this.initElements();
        this.loadSettings();
        this.bindEvents();
    }

    initElements() {
        this.panel = document.getElementById('hud-panel');
        this.toggleBtn = document.getElementById('hud-toggle-btn');
        
        // スライダー
        this.sliderIpd = document.getElementById('slider-ipd');
        this.sliderSize = document.getElementById('slider-size');
        this.sliderDist = document.getElementById('slider-dist');
        this.sliderAmbient = document.getElementById('slider-ambient');

        // 表示用ラベル
        this.valIpd = document.getElementById('val-ipd');
        this.valSize = document.getElementById('val-size');
        this.valDist = document.getElementById('val-dist');
        this.valAmbient = document.getElementById('val-ambient');

        // ボタン
        this.btnRecenter = document.getElementById('btn-recenter');
        this.btnVRToggle = document.getElementById('btn-vr-toggle');
        this.btnExit = document.getElementById('btn-exit');
    }

    loadSettings() {
        const saved = localStorage.getItem('vr-cinema-settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.settings = { ...this.settings, ...parsed };
            } catch (e) {
                console.error('Failed to parse saved settings:', e);
            }
        }

        // スライダー初期値の適用
        this.sliderIpd.value = this.settings.ipd;
        this.sliderSize.value = this.settings.size;
        this.sliderDist.value = this.settings.dist;
        this.sliderAmbient.value = this.settings.ambient;

        this.updateLabels();
    }

    saveSettings() {
        localStorage.setItem('vr-cinema-settings', JSON.stringify(this.settings));
    }

    updateLabels() {
        this.valIpd.textContent = this.settings.ipd.toFixed(1);
        this.valSize.textContent = this.settings.size.toFixed(1);
        this.valDist.textContent = this.settings.dist.toFixed(1);
        this.valAmbient.textContent = this.settings.ambient.toFixed(2);
    }

    // 初回起動時の設定適用
    applyInitialSettings(stereoEffect) {
        stereoEffect.setIPD(this.settings.ipd);
        this.sceneManager.updateScreenGeometry(
            this.settings.size,
            this.settings.size * (9 / 16),
            this.settings.dist
        );
        this.youtubeManager.setBaseVolume(this.youtubeManager.baseVolume);
        
        // 明るさの適用
        this.sceneManager.updateLightsForPlayState(false, this.settings.ambient);
    }

    bindEvents() {
        // パネル開閉トグル
        this.toggleBtn.addEventListener('click', () => {
            this.panel.classList.toggle('collapsed');
        });

        // IPD 変更
        this.sliderIpd.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.settings.ipd = val;
            this.updateLabels();
            this.saveSettings();
            
            // ステレオレンダラーに即時反映
            if (this.onIPDChange) this.onIPDChange(val);
        });

        // スクリーンサイズ変更
        this.sliderSize.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.settings.size = val;
            this.updateLabels();
            this.saveSettings();
            
            this.sceneManager.updateScreenGeometry(val, val * (9/16), this.settings.dist);
        });

        // スクリーン距離変更
        this.sliderDist.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.settings.dist = val;
            this.updateLabels();
            this.saveSettings();
            
            this.sceneManager.updateScreenGeometry(this.settings.size, this.settings.size * (9/16), val);
        });

        // 明るさ変更
        this.sliderAmbient.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.settings.ambient = val;
            this.updateLabels();
            this.saveSettings();
            
            const isPlaying = this.youtubeManager.states.normal === YT.PlayerState.PLAYING || 
                              this.youtubeManager.states.left === YT.PlayerState.PLAYING;
            this.sceneManager.updateLightsForPlayState(isPlaying, val);
        });

        // ボタン群
        this.btnRecenter.addEventListener('click', () => {
            this.controlsManager.recenter();
            this.showToast('視点をリセットしました');
        });

        this.btnVRToggle.addEventListener('click', () => {
            if (this.onVRToggle) this.onVRToggle();
        });

        this.btnExit.addEventListener('click', () => {
            if (this.onExit) this.onExit();
        });
    }

    // 視覚的なフィードバック用のトースト
    showToast(message) {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.background = 'rgba(214, 175, 55, 0.9)';
        toast.style.color = '#000';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '20px';
        toast.style.fontWeight = 'bold';
        toast.style.fontSize = '0.9rem';
        toast.style.zIndex = '3000';
        toast.style.pointerEvents = 'none';
        toast.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.transition = 'opacity 0.5s';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 1500);
    }
}
