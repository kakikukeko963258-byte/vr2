import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export class CinemaScene {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050508);
        this.scene.fog = new THREE.FogExp2(0x050508, 0.015);

        this.meshes = {};
        this.lights = {};
        this.materials = {};

        // 設定の初期値
        this.screenSettings = {
            width: 8.0,
            height: 4.5, // 16:9
            distance: 12.0,
            yOffset: 3.5  // 画面の高さ中心
        };

        this.initMaterials();
        this.buildEnvironment();
        this.buildLights();
        this.buildStars();
        this.buildScreen();
        this.buildSeats();
    }

    initMaterials() {
        // 壁用の布風マテリアル
        this.materials.wall = new THREE.MeshStandardMaterial({
            color: 0x1f1515,
            roughness: 0.8,
            metalness: 0.1
        });

        // 床用の絨毯
        this.materials.carpet = new THREE.MeshStandardMaterial({
            color: 0x120808,
            roughness: 0.9,
            metalness: 0.05
        });

        // スクリーンフレーム（黒木）
        this.materials.frame = new THREE.MeshStandardMaterial({
            color: 0x050505,
            roughness: 0.9,
            metalness: 0.1
        });

        // ゴールド装飾
        this.materials.gold = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.3,
            metalness: 0.8
        });

        // カーテン布地
        this.materials.curtain = new THREE.MeshStandardMaterial({
            color: 0x5a0b0b,
            roughness: 0.7,
            metalness: 0.1
        });

        // 座席（布部）
        this.materials.seatFabric = new THREE.MeshStandardMaterial({
            color: 0x6e1212,
            roughness: 0.85,
            metalness: 0.05
        });

        // 座席（フレーム/金属）
        this.materials.seatFrame = new THREE.MeshStandardMaterial({
            color: 0x151518,
            roughness: 0.5,
            metalness: 0.6
        });
    }

    buildEnvironment() {
        const theaterWidth = 26;
        const theaterLength = 32;
        const theaterHeight = 10;

        // --- 1. スロープ床 ---
        // 映画館のように奥（後列）に行くほど床が高くなるようにする
        const floorGeometry = new THREE.PlaneGeometry(theaterWidth, theaterLength, 1, 10);
        // Planeは通常XY平面に作られるので、回転させてXZにするが、ここでは頂点を直接編集
        floorGeometry.rotateX(-Math.PI / 2);
        
        const pos = floorGeometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getY(i); // XZ平面上なので、Y座標がZ（奥行き）に対応
            // zが手前(スクリーン側、負)から奥(後方、正)に向かうにつれて高さを上げる
            // スクリーンは z = -16、後席は z = 16 あたり
            const normalizedZ = (z + theaterLength / 2) / theaterLength; // 0 (スクリーン) から 1 (最後列)
            if (normalizedZ > 0.3) {
                // スクリーン前のスペース（最初の30%）は平ら、それ以降は緩やかに上昇（最大3m高）
                const slopeFactor = (normalizedZ - 0.3) / 0.7;
                pos.setY(i, Math.pow(slopeFactor, 1.5) * 3.0); // 高さを設定
            } else {
                pos.setY(i, 0);
            }
        }
        floorGeometry.computeVertexNormals();
        
        const floor = new THREE.Mesh(floorGeometry, this.materials.carpet);
        floor.position.set(0, 0, 0);
        this.scene.add(floor);
        this.meshes.floor = floor;

        // --- 2. 壁と天井 ---
        // 左壁
        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(theaterLength, theaterHeight), this.materials.wall);
        leftWall.position.set(-theaterWidth / 2, theaterHeight / 2, 0);
        leftWall.rotation.y = Math.PI / 2;
        this.scene.add(leftWall);
        
        // 右壁
        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(theaterLength, theaterHeight), this.materials.wall);
        rightWall.position.set(theaterWidth / 2, theaterHeight / 2, 0);
        rightWall.rotation.y = -Math.PI / 2;
        this.scene.add(rightWall);

        // 後壁
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(theaterWidth, theaterHeight), this.materials.wall);
        backWall.position.set(0, theaterHeight / 2, theaterLength / 2);
        backWall.rotation.y = Math.PI;
        this.scene.add(backWall);

        // 前壁（スクリーンのある壁、一部黒くして反射を抑える）
        const frontWall = new THREE.Mesh(
            new THREE.PlaneGeometry(theaterWidth, theaterHeight),
            new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.95 })
        );
        frontWall.position.set(0, theaterHeight / 2, -theaterLength / 2);
        this.scene.add(frontWall);

        // 天井
        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(theaterWidth, theaterLength),
            new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.9 })
        );
        ceiling.position.set(0, theaterHeight, 0);
        ceiling.rotation.x = Math.PI / 2;
        this.scene.add(ceiling);
        this.meshes.ceiling = ceiling;

        // 天井の格子（コファー天井の梁）
        this.buildCeilingBeams(theaterWidth, theaterLength, theaterHeight);
    }

    buildCeilingBeams(w, l, h) {
        const beamGeo = new THREE.BoxGeometry(0.3, 0.4, l);
        const beamMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 0.8 });
        
        // 横方向の梁を数本配置
        const beamCount = 6;
        for (let i = 0; i < beamCount; i++) {
            const x = -w/2 + (w / (beamCount - 1)) * i;
            if (Math.abs(x) < 0.1) continue; // 中央は避ける
            const beam = new THREE.Mesh(beamGeo, beamMat);
            beam.position.set(x, h - 0.2, 0);
            this.scene.add(beam);
        }
    }

    buildLights() {
        // 1. 環境光（非常に暗く）
        this.lights.ambient = new THREE.AmbientLight(0x0a0606, 0.5);
        this.scene.add(this.lights.ambient);

        // 2. スクリーングロー（スクリーン裏からの薄暗い青赤の光、臨場感用）
        this.lights.screenGlowL = new THREE.PointLight(0x1a2e40, 0, 15);
        this.lights.screenGlowL.position.set(-4, this.screenSettings.yOffset, -this.screenSettings.distance + 0.5);
        this.scene.add(this.lights.screenGlowL);

        this.lights.screenGlowR = new THREE.PointLight(0x1a2e40, 0, 15);
        this.lights.screenGlowR.position.set(4, this.screenSettings.yOffset, -this.screenSettings.distance + 0.5);
        this.scene.add(this.lights.screenGlowR);

        // 3. 通路のステップライト（足元をほんのり照らす）
        const lightCount = 6;
        for (let i = 0; i < lightCount; i++) {
            const z = -12 + (28 / (lightCount - 1)) * i;
            // スロープ床の高さを概算
            const normalizedZ = (z + 16) / 32;
            const y = normalizedZ > 0.3 ? Math.pow((normalizedZ - 0.3)/0.7, 1.5) * 3.0 : 0;

            // 左通路ライト
            const pLightL = new THREE.PointLight(0xd46a37, 0.4, 3);
            pLightL.position.set(-11, y + 0.1, z);
            this.scene.add(pLightL);

            // 右通路ライト
            const pLightR = new THREE.PointLight(0xd46a37, 0.4, 3);
            pLightR.position.set(11, y + 0.1, z);
            this.scene.add(pLightR);
        }

        // 4. プロジェクター光線（円錐状の透明メッシュ＋スポットライト）
        // スポットライトはスクリーン側を照らす
        this.lights.projector = new THREE.SpotLight(0xffffff, 0, 40, Math.PI / 12, 0.5, 1);
        this.lights.projector.position.set(0, 8.5, 14); // プロジェクタールーム付近
        this.scene.add(this.lights.projector);

        // プロジェクタービーム（円錐コーン）
        const beamGeometry = new THREE.ConeGeometry(5, 30, 32, 1, true);
        beamGeometry.rotateX(-Math.PI / 2);
        beamGeometry.translate(0, 0, -15); // 先端を原点にする
        
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: 0xddf0ff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        this.meshes.projectorBeam = new THREE.Mesh(beamGeometry, beamMaterial);
        this.meshes.projectorBeam.position.set(0, 8.5, 14);
        this.meshes.projectorBeam.lookAt(0, this.screenSettings.yOffset, -this.screenSettings.distance);
        this.scene.add(this.meshes.projectorBeam);
    }

    buildStars() {
        // 天井にまたたく星（映画館の豪華な演出）
        const starCount = 600;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);

        const colorPalette = [
            new THREE.Color(0xffffff), // 白
            new THREE.Color(0xfff4e8), // 暖色白
            new THREE.Color(0xdceeff), // 青白
            new THREE.Color(0xffd2a1)  // オレンジ
        ];

        for (let i = 0; i < starCount; i++) {
            // 天井いっぱいに配置
            const x = (Math.random() - 0.5) * 24;
            const z = (Math.random() - 0.5) * 30;
            const y = 9.9; // 天井のわずかに下

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            sizes[i] = Math.random() * 0.08 + 0.02;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.15,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.meshes.stars = new THREE.Points(geometry, material);
        this.scene.add(this.meshes.stars);
    }

    buildScreen() {
        // 通常のWebGLと背面HTML/iframeのレイヤーを重ね合わせるためのコア構造。
        // WebGL側でスクリーンプレーンを「透明にくり抜く」ことで、その背面にあるHTML要素を透過させる。
        const w = this.screenSettings.width;
        const h = this.screenSettings.height;
        const dist = this.screenSettings.distance;
        const yOff = this.screenSettings.yOffset;

        // 1. スクリーン本体（透明くり抜き用）
        const screenGeometry = new THREE.PlaneGeometry(w, h);
        
        // 特別なマテリアル：ColorWriteをfalseにすることで、このメッシュが描画されるピクセルは
        // Canvasの背景透過（アルファ0）になり、背面にあるHTML要素（YouTube iframe）が見えるようになる。
        const holeMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            colorWrite: false, // WebGLのカラーバッファへの書き込みをスキップ（＝透明になる）
            depthWrite: true,  // デプスバッファには書き込む（＝座席などの手前オブジェクトが正しく重なる）
            transparent: true
        });

        this.meshes.screenHole = new THREE.Mesh(screenGeometry, holeMaterial);
        this.meshes.screenHole.position.set(0, yOff, -dist);
        this.meshes.screenHole.name = "ScreenHole";
        this.scene.add(this.meshes.screenHole);

        // 2. スクリーンの枠（フレーム）
        const frameWidth = 0.2;
        const frameGeometry = new THREE.BoxGeometry(w + frameWidth * 2, h + frameWidth * 2, 0.1);
        this.meshes.screenFrame = new THREE.Mesh(frameGeometry, this.materials.frame);
        this.meshes.screenFrame.position.set(0, yOff, -dist - 0.06);
        this.scene.add(this.meshes.screenFrame);

        // 3. カーテン（スクリーンの左右に装飾用の重厚な赤いカーテン）
        this.buildCurtains(w, h, dist, yOff);
    }

    buildCurtains(w, h, dist, yOff) {
        // カーテンレール
        const rodGeo = new THREE.CylinderGeometry(0.06, 0.06, w + 3.0);
        rodGeo.rotateZ(Math.PI / 2);
        const rod = new THREE.Mesh(rodGeo, this.materials.gold);
        rod.position.set(0, yOff + h/2 + 0.2, -dist - 0.1);
        this.scene.add(rod);

        // 左カーテン
        const curtainW = 2.0;
        const curtainGeo = new THREE.PlaneGeometry(curtainW, h + 0.8);
        
        const curtainL = new THREE.Mesh(curtainGeo, this.materials.curtain);
        curtainL.position.set(-w/2 - curtainW/2 + 0.3, yOff - 0.2, -dist - 0.08);
        // 少し斜めにして立体感を出す
        curtainL.rotation.y = Math.PI / 12;
        this.scene.add(curtainL);
        this.meshes.curtainL = curtainL;

        // 右カーテン
        const curtainR = new THREE.Mesh(curtainGeo, this.materials.curtain);
        curtainR.position.set(w/2 + curtainW/2 - 0.3, yOff - 0.2, -dist - 0.08);
        curtainR.rotation.y = -Math.PI / 12;
        this.scene.add(curtainR);
        this.meshes.curtainR = curtainR;
    }

    buildSeats() {
        // パフォーマンス向上のため、InstancedMesh を使用して 140 個の座席をわずか2回の描画コールで処理する。
        // 1. 布地部分（座面、背もたれ）
        // 2. 金属フレーム部分（アーム、脚）

        // 座席パーツの簡易的な形状を作成
        const backGeo = new THREE.BoxGeometry(0.7, 0.8, 0.15);
        backGeo.translate(0, 0.4, 0); // 基準点を底面中心にする
        
        const padGeo = new THREE.BoxGeometry(0.7, 0.15, 0.6);
        padGeo.translate(0, 0.075, 0.25);
        
        // 布地ジオメトリのマージ
        const fabricGeo = BufferGeometryUtils.mergeGeometries([backGeo, padGeo], false);

        // 金属フレームパーツ
        const armGeoL = new THREE.BoxGeometry(0.08, 0.55, 0.5);
        armGeoL.translate(-0.39, 0.275, 0.25);

        const armGeoR = new THREE.BoxGeometry(0.08, 0.55, 0.5);
        armGeoR.translate(0.39, 0.275, 0.25);

        const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.4);
        legGeo.translate(0, 0.2, 0);
        
        const legL1 = legGeo.clone().translate(-0.35, 0, 0.1);
        const legL2 = legGeo.clone().translate(-0.35, 0, 0.4);
        const legR1 = legGeo.clone().translate(0.35, 0, 0.1);
        const legR2 = legGeo.clone().translate(0.35, 0, 0.4);

        // フレームジオメトリのマージ
        const frameGeo = BufferGeometryUtils.mergeGeometries([armGeoL, armGeoR, legL1, legL2, legR1, legR2], false);

        // 配置データ作成
        const rows = 7;
        const seatsPerRow = 18;
        const seatSpacingX = 1.1;
        const rowSpacingZ = 2.4;
        const totalSeats = rows * seatsPerRow;

        // インスタンスメッシュ作成
        const instancedFabric = new THREE.InstancedMesh(fabricGeo, this.materials.seatFabric, totalSeats);
        const instancedFrame = new THREE.InstancedMesh(frameGeo, this.materials.seatFrame, totalSeats);

        let index = 0;
        const dummy = new THREE.Object3D();

        for (let r = 0; r < rows; r++) {
            const z = 4.0 + r * rowSpacingZ; // 手前は z = 4.0 から
            // スロープ床の高さ計算
            const normalizedZ = (z + 16) / 32;
            const y = normalizedZ > 0.3 ? Math.pow((normalizedZ - 0.3)/0.7, 1.5) * 3.0 : 0;

            for (let s = 0; s < seatsPerRow; s++) {
                // 中央の通路（アイル）を作る
                let x = (s - (seatsPerRow - 1) / 2) * seatSpacingX;
                
                // 3ブロック構成にする（左・中央・右ブロックに分けるため、通路分隙間を開ける）
                if (s >= 6 && s < 12) {
                    // 中央ブロック
                } else if (s < 6) {
                    x -= 0.6; // 左通路
                } else {
                    x += 0.6; // 右通路
                }

                dummy.position.set(x, y, z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1.0, 1.0, 1.0);
                dummy.updateMatrix();

                instancedFabric.setMatrixAt(index, dummy.matrix);
                instancedFrame.setMatrixAt(index, dummy.matrix);
                index++;
            }
        }

        instancedFabric.instanceMatrix.needsUpdate = true;
        instancedFrame.instanceMatrix.needsUpdate = true;

        this.scene.add(instancedFabric);
        this.scene.add(instancedFrame);

        this.meshes.seatsFabric = instancedFabric;
        this.meshes.seatsFrame = instancedFrame;
    }

    // スライダー操作により画面サイズや距離が変更されたときに呼び出される
    updateScreenGeometry(width, height, distance) {
        this.screenSettings.width = width;
        this.screenSettings.height = height;
        this.screenSettings.distance = distance;

        const yOff = this.screenSettings.yOffset;

        // 1. スクリーン透明穴の更新
        if (this.meshes.screenHole) {
            this.meshes.screenHole.geometry.dispose();
            this.meshes.screenHole.geometry = new THREE.PlaneGeometry(width, height);
            this.meshes.screenHole.position.set(0, yOff, -distance);
        }

        // 2. スクリーン枠の更新
        if (this.meshes.screenFrame) {
            this.meshes.screenFrame.geometry.dispose();
            const frameWidth = 0.2;
            this.meshes.screenFrame.geometry = new THREE.BoxGeometry(width + frameWidth * 2, height + frameWidth * 2, 0.1);
            this.meshes.screenFrame.position.set(0, yOff, -distance - 0.06);
        }

        // 3. スクリーングローライト位置の更新
        if (this.lights.screenGlowL && this.lights.screenGlowR) {
            this.lights.screenGlowL.position.set(-width / 2, yOff, -distance + 0.5);
            this.lights.screenGlowR.position.set(width / 2, yOff, -distance + 0.5);
        }

        // 4. プロジェクターの向き更新
        if (this.lights.projector) {
            this.lights.projector.target = this.meshes.screenHole;
        }
        if (this.meshes.projectorBeam) {
            this.meshes.projectorBeam.lookAt(0, yOff, -distance);
        }

        // 5. カーテン位置の更新
        const rod = this.scene.children.find(child => child.geometry && child.geometry.type === 'CylinderGeometry' && child.material === this.materials.gold);
        if (rod) {
            rod.geometry.dispose();
            const newRodGeo = new THREE.CylinderGeometry(0.06, 0.06, width + 3.0);
            newRodGeo.rotateZ(Math.PI / 2);
            rod.geometry = newRodGeo;
            rod.position.set(0, yOff + height/2 + 0.2, -distance - 0.1);
        }

        const curtainW = 2.0;
        if (this.meshes.curtainL) {
            this.meshes.curtainL.geometry.dispose();
            this.meshes.curtainL.geometry = new THREE.PlaneGeometry(curtainW, height + 0.8);
            this.meshes.curtainL.position.set(-width/2 - curtainW/2 + 0.3, yOff - 0.2, -distance - 0.08);
        }
        if (this.meshes.curtainR) {
            this.meshes.curtainR.geometry.dispose();
            this.meshes.curtainR.geometry = new THREE.PlaneGeometry(curtainW, height + 0.8);
            this.meshes.curtainR.position.set(width/2 + curtainW/2 - 0.3, yOff - 0.2, -distance - 0.08);
        }
    }

    // 再生状態に合わせて部屋の明るさを動的に制御する
    updateLightsForPlayState(isPlaying, manualAmbientValue = null) {
        let targetIntensity = 0.02; // デフォルト再生中（暗）
        let targetProjector = 0.0;
        let targetGlow = 0.0;

        if (!isPlaying) {
            // 一時停止/停止中（明）
            targetIntensity = manualAmbientValue !== null ? manualAmbientValue : 0.15;
            targetProjector = 0.0;
            targetGlow = 0.05;
        } else {
            // 再生中
            targetIntensity = 0.005;
            targetProjector = 1.5;
            targetGlow = 1.0;
        }

        // アニメーション用の微細なアップデートをするために、直接値を変更（イージングは外部で実行）
        this.lights.ambient.intensity = targetIntensity;
        this.lights.projector.intensity = targetProjector;
        this.lights.screenGlowL.intensity = targetGlow;
        this.lights.screenGlowR.intensity = targetGlow;
        
        if (this.meshes.projectorBeam) {
            this.meshes.projectorBeam.material.opacity = isPlaying ? 0.15 : 0.0;
        }
    }

    // 星空やアニメーション要素の更新
    animate(time) {
        // 天井の星のまたたき
        if (this.meshes.stars) {
            const opacityAttribute = this.meshes.stars.material;
            // 簡易的に全体の不透明度を時間経過で揺らす
            opacityAttribute.opacity = 0.5 + Math.sin(time * 0.002) * 0.3;
        }
    }

    // メモリ解放処理（再入時のメモリリークを防ぐ）
    dispose() {
        this.scene.traverse((object) => {
            if (object.isMesh || object.isPoints || object.isLine) {
                if (object.geometry) object.geometry.dispose();
                
                if (Array.isArray(object.material)) {
                    object.material.forEach((mat) => mat.dispose());
                } else if (object.material) {
                    object.material.dispose();
                }
            }
        });

        Object.values(this.materials).forEach(mat => mat.dispose());
        this.meshes = {};
        this.lights = {};
        this.materials = {};
    }
}
