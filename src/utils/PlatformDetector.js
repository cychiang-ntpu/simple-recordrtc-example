/**
 * PlatformDetector - 平台偵測工具
 * 自動偵測當前運行環境（Browser/Electron/Capacitor）
 */

export class PlatformDetector {
  /**
   * 偵測當前平台
   * @returns {string} 'browser' | 'electron' | 'capacitor'
   */
  static detect() {
    // 檢查是否為 Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      return 'electron';
    }
    
    // 檢查是否為 Electron（另一種方式）
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
      return 'electron';
    }
    
    // 檢查是否為 Capacitor
    if (typeof window !== 'undefined' && window.Capacitor) {
      return 'capacitor';
    }
    
    // 預設為瀏覽器
    return 'browser';
  }
  
  /**
   * 檢查是否為 Electron 環境
   * @returns {boolean}
   */
  static isElectron() {
    return this.detect() === 'electron';
  }
  
  /**
   * 檢查是否為 Capacitor 環境
   * @returns {boolean}
   */
  static isCapacitor() {
    return this.detect() === 'capacitor';
  }
  
  /**
   * 檢查是否為瀏覽器環境
   * @returns {boolean}
   */
  static isBrowser() {
    return this.detect() === 'browser';
  }
  
  /**
   * 檢查是否為移動裝置
   * @returns {boolean}
   */
  static isMobile() {
    if (typeof window === 'undefined' || !window.navigator) {
      return false;
    }
    
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      window.navigator.userAgent
    );
  }
  
  /**
   * 檢查是否支援 AudioWorklet
   * @returns {boolean}
   */
  static supportsAudioWorklet() {
    if (typeof window === 'undefined' || !window.AudioContext) {
      return false;
    }
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    return 'audioWorklet' in AudioContextClass.prototype;
  }
  
  /**
   * 檢查是否支援 OffscreenCanvas
   * @returns {boolean}
   */
  static supportsOffscreenCanvas() {
    return typeof OffscreenCanvas !== 'undefined';
  }
  
  /**
   * 取得平台資訊
   * @returns {Object}
   */
  static getInfo() {
    return {
      platform: this.detect(),
      isElectron: this.isElectron(),
      isCapacitor: this.isCapacitor(),
      isBrowser: this.isBrowser(),
      isMobile: this.isMobile(),
      supportsAudioWorklet: this.supportsAudioWorklet(),
      supportsOffscreenCanvas: this.supportsOffscreenCanvas(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    };
  }
}

export default PlatformDetector;
