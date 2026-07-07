import * as THREE from 'three';
import { YouTubeSearch } from './search.js';

export class VRBrowser {
    constructor(scene, camera, gazeSystem, youtubeManager) {
        this.scene = scene;
        this.camera = camera;
        this.gazeSystem = gazeSystem;
        this.youtubeManager = youtubeManager;

        this.searchService = new YouTubeSearch();

        // Canvasのサイズ設定
        this.canvasWidth = 1024;
        this.canvasHeight = 1024;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.canvasWidth;
        this.canvas.height = this.canvasHeight;
        this.ctx = this.canvas.getContext('2d');

        this.searchQuery = '';
        this.searchResults = [];
        this.searchStatus = 'キーワードを入力してください'; // 'idle', 'searching', 'error'
        
        // ページネーション
        this.currentPage = 0;
        this.resultsPerPage = 4;

        this.visible = false;
        
        // ホバー中の座標 (Canvasピクセル単位、描画フィードバック用)
        this.hoverX = -1;
        this.hoverY = -1;

        // キーボード配列の初期化
        this.initKeyboardLayout();
        this.drawBrowser(); // 初期描画

        // 3Dメッシュの作成
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        
        const geometry = new THREE.PlaneGeometry(4.0, 4.0); // 4m x 4m のブラウザ
        const material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.name = "VRBrowserPanel";
        
        // カメラの正面 3.5m 離れた、少し斜め下に見上げる位置に配置
        this.mesh.position.set(0, 1.2, -3.2); 
        this.mesh.rotation.x = -Math.PI / 12; // 少し上向きに傾ける

        this.setupGazeHandlers();
    }

    setVisible(visible) {
        this.visible = visible;
        if (visible) {
            this.scene.add(this.mesh);
            this.gazeSystem.registerObject(this.mesh, this.gazeHandlers);
            this.drawBrowser();
        } else {
            this.scene.remove(this.mesh);
            this.gazeSystem.unregisterObject(this.mesh);
        }
    }

    setupGazeHandlers() {
        this.gazeHandlers = {
            onOver: () => {
                // ホバー開始
            },
            onOut: () => {
                this.hoverX = -1;
                this.hoverY = -1;
                this.drawBrowser();
            },
            onClick: () => {
                // ドウェルクリック発生時、視線の位置を逆投影してクリックアクションを実行
                const uv = this.getGazeUV();
                if (uv) {
                    const cx = uv.x * this.canvasWidth;
                    const cy = (1.0 - uv.y) * this.canvasHeight;
                    this.handleCanvasClick(cx, cy);
                }
            }
        };
    }

    // カメラの現在の視線（画面中央）がブラウザのメッシュと交差するUV座標を取得
    getGazeUV() {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = raycaster.intersectObject(this.mesh);
        
        if (intersects.length > 0) {
            return intersects[0].uv;
        }
        return null;
    }

    // 毎フレーム、ホバー位置の更新を描画に反映（視覚的なホバー効果のため）
    update() {
        if (!this.visible) return;

        const uv = this.getGazeUV();
        if (uv) {
            const cx = uv.x * this.canvasWidth;
            const cy = (1.0 - uv.y) * this.canvasHeight;

            // ホバー位置が変更された場合のみ再描画してテクスチャを更新
            if (Math.abs(cx - this.hoverX) > 5 || Math.abs(cy - this.hoverY) > 5) {
                this.hoverX = cx;
                this.hoverY = cy;
                this.drawBrowser();
            }
        } else if (this.hoverX !== -1) {
            this.hoverX = -1;
            this.hoverY = -1;
            this.drawBrowser();
        }
    }

    // Canvas上のUI定義
    initKeyboardLayout() {
        this.keys = [];
        const rows = [
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"],
            ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "BS"],
            ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Space", "Clear"],
            ["Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "確定"]
        ];

        const startY = 660;
        const keyHeight = 70;
        const spacing = 10;
        const totalWidth = 980;
        const keyWidth = (totalWidth - (11 * spacing)) / 11; // 11列

        rows.forEach((row, rowIndex) => {
            const y = startY + rowIndex * (keyHeight + spacing);
            let currentX = 22;

            row.forEach((char) => {
                let w = keyWidth;
                
                // 特殊キーの幅調整
                if (char === "Space") w = keyWidth * 2 + spacing;
                if (char === "確定") w = keyWidth * 2 + spacing;
                if (char === "Clear" || char === "BS") w = keyWidth * 1.5;

                this.keys.push({
                    char: char,
                    x: currentX,
                    y: y,
                    w: w,
                    h: keyHeight
                });

                currentX += w + spacing;
            });
        });

        // 検索ボタン (Y=40〜120)
        this.searchBtnRect = { x: 820, y: 40, w: 180, h: 80 };
        // 検索結果スクロールボタン
        this.prevBtnRect = { x: 820, y: 160, w: 180, h: 60 };
        this.nextBtnRect = { x: 820, y: 230, w: 180, h: 60 };
    }

    drawBrowser() {
        const ctx = this.ctx;
        
        // 1. 背景のクリア（シアターに馴染むダークゴールドの境界線）
        ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
        ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, this.canvasWidth - 6, this.canvasHeight - 6);

        // 2. 検索入力欄の描画
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(40, 40, 750, 80);
        ctx.strokeStyle = 'rgba(214, 175, 55, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(40, 40, 750, 80);

        // 入力文字の描画
        ctx.fillStyle = '#ffffff';
        ctx.font = '36px "Outfit", "Noto Sans JP", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        let displayText = this.searchQuery;
        if (displayText === '') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            displayText = '検索ワード...';
        }
        ctx.fillText(displayText, 60, 80);

        // 3. 検索ボタン描画
        const isSearchBtnHover = this.isHovered(this.searchBtnRect);
        ctx.fillStyle = isSearchBtnHover ? '#e0be53' : '#d4af37';
        ctx.fillRect(this.searchBtnRect.x, this.searchBtnRect.y, this.searchBtnRect.w, this.searchBtnRect.h);
        
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 32px "Noto Sans JP"';
        ctx.textAlign = 'center';
        ctx.fillText('検索 🔍', this.searchBtnRect.x + this.searchBtnRect.w / 2, this.searchBtnRect.y + this.searchBtnRect.h / 2);

        // 4. 検索結果リスト (Y = 160 〜 630)
        this.drawSearchResults();

        // 5. 仮想キーボード描画 (Y = 640 〜 1000)
        this.drawKeyboard();

        if (this.texture) {
            this.texture.needsUpdate = true;
        }
    }

    drawSearchResults() {
        const ctx = this.ctx;
        const startY = 160;
        const cardHeight = 100;
        const spacing = 15;

        // 状態表示
        if (this.searchStatus === 'searching') {
            ctx.fillStyle = 'rgba(214, 175, 55, 0.8)';
            ctx.font = 'bold 36px "Noto Sans JP"';
            ctx.textAlign = 'center';
            ctx.fillText('検索中...', 400, 350);
            return;
        } else if (this.searchStatus === 'error') {
            ctx.fillStyle = '#ff6666';
            ctx.font = '28px "Noto Sans JP"';
            ctx.textAlign = 'center';
            ctx.fillText('検索に失敗しました。再試行してください。', 400, 350);
            return;
        } else if (this.searchResults.length === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '28px "Noto Sans JP"';
            ctx.textAlign = 'center';
            ctx.fillText('動画を検索して、大画面シアターで再生できます。', 400, 350);
            return;
        }

        // 結果カードの描画 (1ページあたり4件)
        const startIndex = this.currentPage * this.resultsPerPage;
        const pageItems = this.searchResults.slice(startIndex, startIndex + this.resultsPerPage);

        this.resultCardsRects = []; // クリック判定用

        pageItems.forEach((item, index) => {
            const y = startY + index * (cardHeight + spacing);
            const rect = { x: 40, y: y, w: 750, h: cardHeight };
            this.resultCardsRects.push({ rect, item });

            const isCardHover = this.isHovered(rect);
            ctx.fillStyle = isCardHover ? 'rgba(214, 175, 55, 0.15)' : 'rgba(255, 255, 255, 0.04)';
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
            
            ctx.strokeStyle = isCardHover ? '#d4af37' : 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 2;
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

            // ダミーのサムネイル枠 (CORSエラー対策で画像は描画せず、アイコンを描く)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(rect.x + 10, rect.y + 10, 140, 80);
            ctx.fillStyle = '#ff0000';
            ctx.font = '40px "Noto Sans JP"';
            ctx.textAlign = 'center';
            ctx.fillText('▶', rect.x + 80, rect.y + 50);

            // テキスト情報
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px "Noto Sans JP"';
            ctx.textAlign = 'left';
            
            // タイトルの1行丸め
            let title = item.title;
            if (ctx.measureText(title).width > 550) {
                // 収まるようにカット
                while (ctx.measureText(title + '...').width > 550) {
                    title = title.slice(0, -1);
                }
                title += '...';
            }
            ctx.fillText(title, rect.x + 170, rect.y + 35);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '20px "Noto Sans JP"';
            ctx.fillText(item.uploader, rect.x + 170, rect.y + 70);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '18px "Noto Sans JP"';
            ctx.textAlign = 'right';
            ctx.fillText(item.duration, rect.x + rect.w - 15, rect.y + 70);
        });

        // ページネーションボタン描画 (複数ページある場合)
        if (this.searchResults.length > this.resultsPerPage) {
            // 前のページボタン
            const isPrevHover = this.isHovered(this.prevBtnRect);
            ctx.fillStyle = isPrevHover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(this.prevBtnRect.x, this.prevBtnRect.y, this.prevBtnRect.w, this.prevBtnRect.h);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.strokeRect(this.prevBtnRect.x, this.prevBtnRect.y, this.prevBtnRect.w, this.prevBtnRect.h);
            ctx.fillStyle = '#ffffff';
            ctx.font = '22px "Noto Sans JP"';
            ctx.textAlign = 'center';
            ctx.fillText('前のページ ⬆️', this.prevBtnRect.x + this.prevBtnRect.w/2, this.prevBtnRect.y + this.prevBtnRect.h/2);

            // 次のページボタン
            const isNextHover = this.isHovered(this.nextBtnRect);
            ctx.fillStyle = isNextHover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(this.nextBtnRect.x, this.nextBtnRect.y, this.nextBtnRect.w, this.nextBtnRect.h);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.strokeRect(this.nextBtnRect.x, this.nextBtnRect.y, this.nextBtnRect.w, this.nextBtnRect.h);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('次のページ ⬇️', this.nextBtnRect.x + this.nextBtnRect.w/2, this.nextBtnRect.y + this.nextBtnRect.h/2);
        }
    }

    drawKeyboard() {
        const ctx = this.ctx;

        this.keys.forEach((key) => {
            const isKeyHover = this.isHovered(key);
            
            // キー背景色決定 (確定やスペース、クリアは色を変える)
            if (isKeyHover) {
                ctx.fillStyle = '#d4af37';
            } else if (key.char === "確定") {
                ctx.fillStyle = 'rgba(139, 0, 0, 0.6)'; // 赤
            } else if (key.char === "Space" || key.char === "BS" || key.char === "Clear") {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
            }

            ctx.fillRect(key.x, key.y, key.w, key.h);
            
            ctx.strokeStyle = isKeyHover ? '#ffffff' : 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.strokeRect(key.x, key.y, key.w, key.h);

            // キー文字描画
            ctx.fillStyle = (isKeyHover && key.char !== "確定") ? '#000000' : '#ffffff';
            ctx.font = '24px "Outfit", "Noto Sans JP", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(key.char, key.x + key.w / 2, key.y + key.h / 2);
        });
    }

    // 視線が対象の矩形内にあるかチェック
    isHovered(rect) {
        return (
            this.hoverX >= rect.x &&
            this.hoverX <= rect.x + rect.w &&
            this.hoverY >= rect.y &&
            this.hoverY <= rect.y + rect.h
        );
    }

    // クリックイベントのディスパッチ
    handleCanvasClick(cx, cy) {
        // 1. キーボードキーのクリック判定
        for (const key of this.keys) {
            if (cx >= key.x && cx <= key.x + key.w && cy >= key.y && cy <= key.y + key.h) {
                this.handleKeyPress(key.char);
                return;
            }
        }

        // 2. 検索ボタンのクリック判定
        if (cx >= this.searchBtnRect.x && cx <= this.searchBtnRect.x + this.searchBtnRect.w &&
            cy >= this.searchBtnRect.y && cy <= this.searchBtnRect.y + this.searchBtnRect.h) {
            this.performSearch();
            return;
        }

        // 3. ページネーションスクロール
        if (this.searchResults.length > this.resultsPerPage) {
            if (cx >= this.prevBtnRect.x && cx <= this.prevBtnRect.x + this.prevBtnRect.w &&
                cy >= this.prevBtnRect.y && cy <= this.prevBtnRect.y + this.prevBtnRect.h) {
                if (this.currentPage > 0) {
                    this.currentPage--;
                    this.drawBrowser();
                }
                return;
            }

            if (cx >= this.nextBtnRect.x && cx <= this.nextBtnRect.x + this.nextBtnRect.w &&
                cy >= this.nextBtnRect.y && cy <= this.nextBtnRect.y + this.nextBtnRect.h) {
                const maxPage = Math.floor((this.searchResults.length - 1) / this.resultsPerPage);
                if (this.currentPage < maxPage) {
                    this.currentPage++;
                    this.drawBrowser();
                }
                return;
            }
        }

        // 4. 検索結果カードのクリック判定
        if (this.resultCardsRects) {
            for (const card of this.resultCardsRects) {
                const rect = card.rect;
                if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
                    // 動画を選択！シアターで再生開始する
                    this.youtubeManager.loadVideo(card.item.id);
                    this.setVisible(false); // ブラウザを閉じる
                    return;
                }
            }
        }
    }

    handleKeyPress(char) {
        if (char === "BS") {
            this.searchQuery = this.searchQuery.slice(0, -1);
        } else if (char === "Clear") {
            this.searchQuery = '';
        } else if (char === "Space") {
            this.searchQuery += ' ';
        } else if (char === "確定") {
            this.performSearch();
        } else {
            // 文字列追加
            this.searchQuery += char.toLowerCase();
        }
        this.drawBrowser();
    }

    async performSearch() {
        if (this.searchQuery.trim() === '') return;

        this.searchStatus = 'searching';
        this.currentPage = 0;
        this.drawBrowser();

        try {
            const results = await this.searchService.search(this.searchQuery);
            this.searchResults = results;
            this.searchStatus = 'idle';
        } catch (e) {
            console.error('Browser Search error:', e);
            this.searchStatus = 'error';
        }
        
        this.drawBrowser();
    }
}
