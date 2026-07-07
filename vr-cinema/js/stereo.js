import * as THREE from 'three';

export class AdjustableStereoEffect {
    constructor(renderer) {
        this.renderer = renderer;
        
        // 瞳孔間距離 (IPD) の初期設定 (64mm = 0.064m)
        this.ipd = 0.064; 
        
        this.stereoCamera = new THREE.StereoCamera();
        this.stereoCamera.aspect = 0.5; // 左右に分けるためアスペクト比は半分

        this.size = new THREE.Vector2();
        renderer.getSize(this.size);
    }

    setIPD(ipdMillimeters) {
        this.ipd = ipdMillimeters / 1000.0; // mm を m に変換
    }

    setSize(width, height) {
        this.size.set(width, height);
        this.renderer.setSize(width, height);
    }

    render(scene, camera) {
        // ステレオカメラのパラメータを更新
        this.stereoCamera.eyeSep = this.ipd; // 左右の目の間隔を同期
        this.stereoCamera.update(camera);

        const width = this.size.x;
        const height = this.size.y;

        // レンダーターゲットなどのバッファをクリア
        this.renderer.clear();

        // 1. 左目の描画 (画面の左半分)
        this.renderer.setScissorTest(true);
        this.renderer.setViewport(0, 0, width / 2, height);
        this.renderer.setScissor(0, 0, width / 2, height);
        this.renderer.render(scene, this.stereoCamera.cameraL);

        // 2. 右目の描画 (画面の右半分)
        this.renderer.setViewport(width / 2, 0, width / 2, height);
        this.renderer.setScissor(width / 2, 0, width / 2, height);
        this.renderer.render(scene, this.stereoCamera.cameraR);

        // シザーステストをオフに戻す
        this.renderer.setScissorTest(false);
        // ビューポートを全体に戻す
        this.renderer.setViewport(0, 0, width, height);
    }

    /**
     * 3Dスクリーンの四隅を、各目のカメラを用いて2D画面座標（ピクセル）に投影する
     * @param {THREE.Mesh} screenMesh スクリーンの3Dメッシュ
     * @param {THREE.Camera} mainCamera メインのカメラ（ステレオでない場合）
     * @param {boolean} isStereo ステレオモードかどうか
     * @returns {Object} 左右それぞれの四隅の2D座標 { left: [p0,p1,p2,p3], right: [p0,p1,p2,p3] }
     */
    projectScreenCorners(screenMesh, mainCamera, isStereo) {
        // 3Dスクリーンのローカル頂点
        const geom = screenMesh.geometry;
        geom.computeBoundingBox();
        const bbox = geom.boundingBox;

        // 16:9スクリーンの4隅（反時計回り）
        const localCorners = [
            new THREE.Vector3(bbox.min.x, bbox.max.y, 0), // 左上
            new THREE.Vector3(bbox.max.x, bbox.max.y, 0), // 右上
            new THREE.Vector3(bbox.max.x, bbox.min.y, 0), // 右下
            new THREE.Vector3(bbox.min.x, bbox.min.y, 0)  // 左下
        ];

        // ワールド座標に変換
        const worldCorners = localCorners.map(corner => {
            return corner.clone().applyMatrix4(screenMesh.matrixWorld);
        });

        const width = this.size.x;
        const height = this.size.y;

        if (!isStereo) {
            // 通常モード時の投影（全画面）
            const corners2D = worldCorners.map(wp => {
                const proj = wp.clone().project(mainCamera);
                // NDC (-1〜1) からスクリーン座標 (px) に変換
                return new THREE.Vector2(
                    (proj.x + 1) * width / 2,
                    (-proj.y + 1) * height / 2
                );
            });
            return { normal: corners2D };
        } else {
            // ステレオモード時は、左右カメラを更新した上で射影する
            this.stereoCamera.eyeSep = this.ipd;
            this.stereoCamera.update(mainCamera);

            // 左目用投影（左半分ビューポート: [0, 0, width/2, height]）
            const leftCorners2D = worldCorners.map(wp => {
                const proj = wp.clone().project(this.stereoCamera.cameraL);
                // 左半分の中でのピクセル座標
                return new THREE.Vector2(
                    (proj.x + 1) * (width / 4),
                    (-proj.y + 1) * (height / 2)
                );
            });

            // 右目用投影（右半分ビューポート: [width/2, 0, width/2, height]）
            const rightCorners2D = worldCorners.map(wp => {
                const proj = wp.clone().project(this.stereoCamera.cameraR);
                // 右半分の中でのピクセル座標（全体の左端からのオフセットではなく、右半分ビューポート内の相対座標）
                return new THREE.Vector2(
                    (proj.x + 1) * (width / 4),
                    (-proj.y + 1) * (height / 2)
                );
            });

            return {
                left: leftCorners2D,
                right: rightCorners2D
            };
        }
    }

    /**
     * 射影変換（Homography）行列を計算し、CSS matrix3d 形式に変換する
     * 元の長方形 (0,0)-(W,H) を 任意の四角形 (x0,y0)-(x3,y3) に変形させるための 4x4 行列を求める
     */
    static getHomographyMatrix3D(w, h, corners) {
        const x0 = corners[0].x, y0 = corners[0].y;
        const x1 = corners[1].x, y1 = corners[1].y;
        const x2 = corners[2].x, y2 = corners[2].y;
        const x3 = corners[3].x, y3 = corners[3].y;

        // 3x3 ホモグラフィ行列の計算 (直接解くための連立方程式)
        // 元の座標系: (0,0), (w,0), (w,h), (0,h)
        const A = [
            [0, 0, 1, 0, 0, 0, 0, 0],
            [w, 0, 1, 0, 0, 0, -w*x1, 0],
            [w, h, 1, 0, 0, 0, -w*x2, -h*x2],
            [0, h, 1, 0, 0, 0, 0, -h*x3],
            [0, 0, 0, 0, 0, 1, 0, 0],
            [0, 0, 0, w, 0, 1, -w*y1, 0],
            [0, 0, 0, w, h, 1, -w*y2, -h*y2],
            [0, 0, 0, 0, h, 1, 0, -h*y3]
        ];

        const B = [x0, x1, x2, x3, y0, y1, y2, y3];
        
        // 簡易ガウス消去法で方程式 A * X = B を解く
        const X = this.solveLinearSystem(A, B);
        if (!X) return '';

        // X = [h00, h01, h02, h10, h11, h12, h20, h21] (h22 = 1.0)
        const h00 = X[0], h01 = X[1], h02 = X[2];
        const h10 = X[3], h11 = X[4], h12 = X[5];
        const h20 = X[6], h21 = X[7], h22 = 1.0;

        // CSS 3D Matrix (column-major order)
        // 3x3行列を4x4行列に拡張してマッピング
        const matrix3d = [
            h00, h10, 0, h20,
            h01, h11, 0, h21,
            0,   0,   1, 0,
            h02, h12, 0, h22
        ];

        return `matrix3d(${matrix3d.join(',')})`;
    }

    // ガウス消去法による簡単な一次方程式の解法
    static solveLinearSystem(A, B) {
        const n = B.length;
        for (let i = 0; i < n; i++) {
            // ピボット選択
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
                    maxRow = k;
                }
            }
            
            // 行の入れ替え
            const tempA = A[i]; A[i] = A[maxRow]; A[maxRow] = tempA;
            const tempB = B[i]; B[i] = B[maxRow]; B[maxRow] = tempB;

            // ゼロ除算の回避
            if (Math.abs(A[i][i]) < 1e-10) {
                return null;
            }

            // 行の正規化と掃き出し
            for (let k = i + 1; k < n; k++) {
                const c = -A[k][i] / A[i][i];
                for (let j = i; j < n; j++) {
                    if (i === j) {
                        A[k][j] = 0;
                    } else {
                        A[k][j] += c * A[i][j];
                    }
                }
                B[k] += c * B[i];
            }
        }

        // 後退代入
        const x = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = B[i] / A[i][i];
            for (let k = i - 1; k >= 0; k--) {
                B[k] -= A[k][i] * x[i];
            }
        }
        return x;
    }
}
