/**
 * StorageAdapter - 儲存適配器基類
 * 定義統一的儲存介面，支援多種儲存後端
 */

export class StorageAdapter {
  /**
   * 儲存音訊檔案
   * @param {Blob} blob - 音訊 Blob 物件
   * @param {string} filename - 檔案名稱
   * @param {Object} metadata - 元數據（可選）
   * @returns {Promise<string>} 檔案 ID 或 URL
   */
  async save(blob, filename, metadata = {}) {
    throw new Error('save() must be implemented by subclass');
  }
  
  /**
   * 載入音訊檔案
   * @param {string} id - 檔案 ID 或名稱
   * @returns {Promise<Blob>} 音訊 Blob 物件
   */
  async load(id) {
    throw new Error('load() must be implemented by subclass');
  }
  
  /**
   * 刪除音訊檔案
   * @param {string} id - 檔案 ID 或名稱
   * @returns {Promise<boolean>} 是否成功刪除
   */
  async delete(id) {
    throw new Error('delete() must be implemented by subclass');
  }
  
  /**
   * 列出所有檔案
   * @returns {Promise<Array>} 檔案列表
   */
  async list() {
    throw new Error('list() must be implemented by subclass');
  }
  
  /**
   * 檢查檔案是否存在
   * @param {string} id - 檔案 ID 或名稱
   * @returns {Promise<boolean>}
   */
  async exists(id) {
    try {
      await this.load(id);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 清空所有檔案（謹慎使用）
   * @returns {Promise<number>} 刪除的檔案數量
   */
  async clear() {
    const files = await this.list();
    let count = 0;
    
    for (const file of files) {
      try {
        await this.delete(file.id || file.filename);
        count++;
      } catch (error) {
        console.error('Failed to delete file:', file, error);
      }
    }
    
    return count;
  }
}

export default StorageAdapter;
