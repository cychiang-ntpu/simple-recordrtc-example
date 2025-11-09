/**
 * DeviceManager.js
 * 音訊裝置管理模組 - 處理麥克風和輸出裝置的列舉、選擇、記憶
 * 
 * @module DeviceManager
 * @description 提供完整的音訊裝置管理功能，包含：
 * - 裝置列舉 (enumerateDevices)
 * - 裝置選擇與記憶 (localStorage)
 * - 裝置變更偵測 (devicechange event)
 * - 跨平台相容性處理
 */

/**
 * DeviceManager - 音訊裝置管理器
 * 統一管理麥克風和輸出裝置的列舉、選擇與持久化
 */
export class DeviceManager {
    /**
     * @param {Object} options - 配置選項
     * @param {string} [options.micStorageKey='preferredMicDeviceId'] - 麥克風偏好設定的 localStorage key
     * @param {string} [options.outputStorageKey='preferredOutputDeviceId'] - 輸出裝置偏好設定的 localStorage key
     * @param {boolean} [options.autoLoadPreferences=true] - 是否自動載入上次的偏好設定
     * @param {boolean} [options.autoRequestPermission=true] - 列舉前是否自動請求麥克風權限
     */
    constructor(options = {}) {
        this.options = {
            micStorageKey: 'preferredMicDeviceId',
            outputStorageKey: 'preferredOutputDeviceId',
            autoLoadPreferences: true,
            autoRequestPermission: true,
            ...options
        };
        
        // 裝置清單
        this.microphoneDevices = [];
        this.outputDevices = [];
        
        // 當前選擇的裝置 ID
        this.selectedMicDeviceId = '';
        this.selectedOutputDeviceId = 'default';
        
        // 事件監聽器
        this._eventListeners = {
            'devicechange': [],
            'micchange': [],
            'outputchange': []
        };
        
        // 裝置變更監聽器
        this._deviceChangeListener = null;
        
        // 自動載入偏好設定
        if (this.options.autoLoadPreferences) {
            this.loadPreferences();
        }
    }
    
    /**
     * 從 localStorage 載入上次的裝置偏好設定
     */
    loadPreferences() {
        console.log('[DeviceManager] loadPreferences 被呼叫');
        
        try {
            const savedMicId = localStorage.getItem(this.options.micStorageKey);
            const savedOutputId = localStorage.getItem(this.options.outputStorageKey);
            
            console.log(`[DeviceManager] localStorage 中的值:`);
            console.log(`  - ${this.options.micStorageKey}: "${savedMicId}"`);
            console.log(`  - ${this.options.outputStorageKey}: "${savedOutputId}"`);
            
            if (savedMicId) {
                this.selectedMicDeviceId = savedMicId;
                console.log(`[DeviceManager] 已載入麥克風偏好: ${savedMicId}`);
            } else {
                console.log(`[DeviceManager] 沒有儲存的麥克風偏好`);
            }
            
            if (savedOutputId) {
                this.selectedOutputDeviceId = savedOutputId;
                console.log(`[DeviceManager] 已載入輸出裝置偏好: ${savedOutputId}`);
            } else {
                console.log(`[DeviceManager] 沒有儲存的輸出裝置偏好，使用 default`);
            }
        } catch (error) {
            console.warn('[DeviceManager] Failed to load device preferences:', error);
        }
    }
    
    /**
     * 儲存裝置偏好設定到 localStorage
     * @param {string} type - 'microphone' 或 'output'
     * @param {string} deviceId - 裝置 ID
     */
    savePreference(type, deviceId) {
        try {
            if (type === 'microphone') {
                localStorage.setItem(this.options.micStorageKey, deviceId);
                this.selectedMicDeviceId = deviceId;
            } else if (type === 'output') {
                localStorage.setItem(this.options.outputStorageKey, deviceId);
                this.selectedOutputDeviceId = deviceId;
            }
        } catch (error) {
            console.warn('Failed to save device preference:', error);
        }
    }
    
    /**
     * 檢查瀏覽器是否支援裝置列舉
     * @returns {boolean}
     */
    isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices);
    }
    
    /**
     * 請求麥克風權限（必要時）
     * @returns {Promise<void>}
     */
    async requestMicrophonePermission() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported in this browser');
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // 立即停止所有 track，只是為了獲取權限
            stream.getTracks().forEach(track => track.stop());
        } catch (error) {
            throw new Error(`Failed to request microphone permission: ${error.message}`);
        }
    }
    
    /**
     * 列舉所有麥克風裝置
     * @param {boolean} [requestPermission=true] - 是否先請求權限
     * @returns {Promise<Array>} 麥克風裝置清單
     */
    async enumerateMicrophones(requestPermission = this.options.autoRequestPermission) {
        if (!this.isSupported()) {
            throw new Error('Device enumeration is not supported in this browser');
        }
        
        try {
            // 如果需要，先請求權限
            if (requestPermission) {
                try {
                    await this.requestMicrophonePermission();
                } catch (error) {
                    // 忽略權限錯誤，繼續嘗試列舉（可能已經有權限）
                    console.warn('Permission request failed, continuing anyway:', error);
                }
            }
            
            // 列舉所有裝置
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.microphoneDevices = devices.filter(device => device.kind === 'audioinput');
            
            return this.microphoneDevices;
        } catch (error) {
            throw new Error(`Failed to enumerate microphones: ${error.message}`);
        }
    }
    
    /**
     * 列舉所有輸出裝置
     * @returns {Promise<Array>} 輸出裝置清單
     */
    async enumerateOutputDevices() {
        if (!this.isSupported()) {
            throw new Error('Device enumeration is not supported in this browser');
        }
        
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.outputDevices = devices.filter(device => device.kind === 'audiooutput');
            
            return this.outputDevices;
        } catch (error) {
            throw new Error(`Failed to enumerate output devices: ${error.message}`);
        }
    }
    
    /**
     * 列舉所有裝置（麥克風 + 輸出）
     * @param {boolean} [requestPermission=true] - 是否先請求麥克風權限
     * @returns {Promise<Object>} { microphones, outputs }
     */
    async enumerateAllDevices(requestPermission = this.options.autoRequestPermission) {
        const [microphones, outputs] = await Promise.all([
            this.enumerateMicrophones(requestPermission),
            this.enumerateOutputDevices()
        ]);
        
        return { microphones, outputs };
    }
    
    /**
     * 選擇麥克風裝置
     * @param {string} deviceId - 裝置 ID
     * @param {boolean} [save=true] - 是否儲存偏好設定
     */
    selectMicrophone(deviceId, save = true) {
        console.log(`[DeviceManager] selectMicrophone 被呼叫:`, { deviceId, save });
        console.log(`[DeviceManager] 變更前: selectedMicDeviceId = "${this.selectedMicDeviceId}"`);
        
        this.selectedMicDeviceId = deviceId;
        
        console.log(`[DeviceManager] 變更後: selectedMicDeviceId = "${this.selectedMicDeviceId}"`);
        
        if (save) {
            this.savePreference('microphone', deviceId);
            console.log(`[DeviceManager] 已儲存至 localStorage (${this.options.micStorageKey})`);
        }
        
        // 觸發 micchange 事件
        this._emit('micchange', { deviceId });
    }
    
    /**
     * 選擇輸出裝置
     * @param {string} deviceId - 裝置 ID
     * @param {boolean} [save=true] - 是否儲存偏好設定
     */
    selectOutputDevice(deviceId, save = true) {
        this.selectedOutputDeviceId = deviceId;
        
        if (save) {
            this.savePreference('output', deviceId);
        }
        
        // 觸發 outputchange 事件
        this._emit('outputchange', { deviceId });
    }
    
    /**
     * 取得當前選擇的麥克風裝置 ID
     * @returns {string}
     */
    getSelectedMicrophoneId() {
        return this.selectedMicDeviceId;
    }
    
    /**
     * 取得當前選擇的輸出裝置 ID
     * @returns {string}
     */
    getSelectedOutputDeviceId() {
        return this.selectedOutputDeviceId;
    }
    
    /**
     * 取得當前選擇的麥克風裝置資訊
     * @returns {MediaDeviceInfo|null}
     */
    getSelectedMicrophone() {
        return this.microphoneDevices.find(device => device.deviceId === this.selectedMicDeviceId) || null;
    }
    
    /**
     * 取得當前選擇的輸出裝置資訊
     * @returns {MediaDeviceInfo|null}
     */
    getSelectedOutputDevice() {
        return this.outputDevices.find(device => device.deviceId === this.selectedOutputDeviceId) || null;
    }
    
    /**
     * 建立適用於 getUserMedia 的約束條件
     * @param {Object} [additionalConstraints={}] - 額外的音訊約束
     * @returns {Object} MediaStreamConstraints
     */
    getMicrophoneConstraints(additionalConstraints = {}) {
        console.log(`[DeviceManager] getMicrophoneConstraints 被呼叫`);
        console.log(`[DeviceManager] 當前 selectedMicDeviceId = "${this.selectedMicDeviceId}"`);
        
        const constraints = {
            audio: {
                ...additionalConstraints
            },
            video: false
        };
        
        // 如果有選擇特定裝置，加入 deviceId 約束
        if (this.selectedMicDeviceId) {
            constraints.audio.deviceId = { exact: this.selectedMicDeviceId };
            console.log(`[DeviceManager] 已加入 deviceId 約束: ${this.selectedMicDeviceId}`);
        } else {
            console.log(`[DeviceManager] 沒有選擇特定裝置，使用系統預設`);
        }
        
        return constraints;
    }
    
    /**
     * 為 Audio 元素設定輸出裝置
     * @param {HTMLAudioElement} audioElement - Audio 元素
     * @param {string} [deviceId] - 裝置 ID（不提供則使用當前選擇的裝置）
     * @returns {Promise<void>}
     */
    async setAudioOutputDevice(audioElement, deviceId) {
        const targetDeviceId = deviceId || this.selectedOutputDeviceId;
        
        // 檢查瀏覽器是否支援 setSinkId
        if (typeof audioElement.setSinkId !== 'function') {
            console.warn('setSinkId is not supported in this browser');
            return;
        }
        
        try {
            await audioElement.setSinkId(targetDeviceId);
        } catch (error) {
            throw new Error(`Failed to set audio output device: ${error.message}`);
        }
    }
    
    /**
     * 檢查指定裝置是否仍然存在
     * @param {string} deviceId - 裝置 ID
     * @param {string} type - 'microphone' 或 'output'
     * @returns {boolean}
     */
    isDeviceAvailable(deviceId, type) {
        const devices = type === 'microphone' ? this.microphoneDevices : this.outputDevices;
        return devices.some(device => device.deviceId === deviceId);
    }
    
    /**
     * 啟動裝置變更監聽
     * 當裝置插拔時自動重新列舉
     */
    startDeviceChangeMonitoring() {
        if (!navigator.mediaDevices || this._deviceChangeListener) {
            return; // 不支援或已經在監聽
        }
        
        this._deviceChangeListener = async () => {
            try {
                // 重新列舉裝置
                await this.enumerateAllDevices(false); // 不需要重新請求權限
                
                // 觸發 devicechange 事件
                this._emit('devicechange', {
                    microphones: this.microphoneDevices,
                    outputs: this.outputDevices
                });
            } catch (error) {
                console.error('Device change enumeration failed:', error);
            }
        };
        
        navigator.mediaDevices.addEventListener('devicechange', this._deviceChangeListener);
    }
    
    /**
     * 停止裝置變更監聽
     */
    stopDeviceChangeMonitoring() {
        if (this._deviceChangeListener && navigator.mediaDevices) {
            navigator.mediaDevices.removeEventListener('devicechange', this._deviceChangeListener);
            this._deviceChangeListener = null;
        }
    }
    
    /**
     * 註冊事件監聽器
     * @param {string} event - 事件名稱 ('devicechange', 'micchange', 'outputchange')
     * @param {function} callback - 回調函數
     */
    on(event, callback) {
        if (!this._eventListeners[event]) {
            console.warn(`Unknown event: ${event}`);
            return;
        }
        
        this._eventListeners[event].push(callback);
    }
    
    /**
     * 移除事件監聽器
     * @param {string} event - 事件名稱
     * @param {function} callback - 回調函數
     */
    off(event, callback) {
        if (!this._eventListeners[event]) {
            return;
        }
        
        const index = this._eventListeners[event].indexOf(callback);
        if (index > -1) {
            this._eventListeners[event].splice(index, 1);
        }
    }
    
    /**
     * 觸發事件
     * @private
     */
    _emit(event, data) {
        if (!this._eventListeners[event]) {
            return;
        }
        
        this._eventListeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in ${event} event handler:`, error);
            }
        });
    }
    
    /**
     * 銷毀 DeviceManager，清理資源
     */
    destroy() {
        this.stopDeviceChangeMonitoring();
        this._eventListeners = {
            'devicechange': [],
            'micchange': [],
            'outputchange': []
        };
        this.microphoneDevices = [];
        this.outputDevices = [];
    }
}

export default DeviceManager;
