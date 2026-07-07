export class YouTubeSearch {
    constructor() {
        // 利用可能な Piped API インスタンスのリスト（負荷分散・フォールバック用）
        this.instances = [
            'https://pipedapi.kavin.rocks',
            'https://pipedapi.adminforge.de',
            'https://api.piped.yt',
            'https://pipedapi.colt.top',
            'https://pipedapi.lunar.icu'
        ];
        this.currentInstanceIndex = 0;
    }

    // 現在のアクティブなインスタンスのベースURLを取得
    get baseUrl() {
        return this.instances[this.currentInstanceIndex];
    }

    // インスタンスが失敗したときに、次のインスタンスへ切り替える
    rotateInstance() {
        this.currentInstanceIndex = (this.currentInstanceIndex + 1) % this.instances.length;
        console.warn(`[Search] Switching to fallback Invidious/Piped instance: ${this.baseUrl}`);
    }

    /**
     * YouTube動画をキーワードで検索する
     * @param {string} query 検索キーワード
     * @returns {Promise<Array>} 検索結果リスト
     */
    async search(query) {
        let attempts = 0;
        const maxAttempts = this.instances.length;

        while (attempts < maxAttempts) {
            try {
                const encodedQuery = encodeURIComponent(query);
                const url = `${this.baseUrl}/search?q=${encodedQuery}&filter=videos`;

                console.log(`[Search] Querying: ${url}`);
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                if (!data || !data.items) {
                    throw new Error('Invalid response structure');
                }

                // 必要な項目をフィルタ＆整形
                return data.items
                    .filter(item => item.type === 'stream' || item.type === 'video')
                    .map(item => {
                        // URLからビデオIDを抽出 (/watch?v=xxxxxx)
                        let videoId = '';
                        if (item.url) {
                            const urlMatch = item.url.match(/v=([^&]+)/);
                            videoId = urlMatch ? urlMatch[1] : '';
                        }

                        // サムネイルURLの修正 (プロキシ経由など不完全な場合があるため)
                        let thumbnail = item.thumbnail || '';
                        if (thumbnail.startsWith('/')) {
                            // インスタンスの相対パスならベースURLを付与
                            thumbnail = this.baseUrl + thumbnail;
                        }

                        return {
                            id: videoId,
                            title: item.title || '無題の動画',
                            thumbnail: thumbnail,
                            uploader: item.uploaderName || '不明なチャンネル',
                            views: item.views ? this.formatViews(item.views) : '不明な再生回数',
                            uploaded: item.uploadedDate || '',
                            duration: item.duration ? this.formatDuration(item.duration) : ''
                        };
                    })
                    .filter(item => item.id !== ''); // 有効なIDがあるものだけ残す

            } catch (error) {
                console.error(`[Search] Attempt failed with instance ${this.baseUrl}:`, error);
                this.rotateInstance(); // 次のインスタンスへ
                attempts++;
            }
        }

        throw new Error('全ての検索インスタンスでエラーが発生しました。時間を置いて再度お試しください。');
    }

    // 再生回数の見やすいフォーマット (例: 1.2万回, 3.4M views)
    formatViews(views) {
        if (views >= 100000000) {
            return `${(views / 100000000).toFixed(1)}億回再生`;
        } else if (views >= 10000) {
            return `${(views / 10000).toFixed(1)}万回再生`;
        } else {
            return `${views}回再生`;
        }
    }

    // 秒数を「分:秒」にフォーマット
    formatDuration(durationSeconds) {
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = Math.floor(durationSeconds % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}
