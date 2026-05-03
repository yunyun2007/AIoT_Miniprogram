/**
 * 华为云IoTDA云函数客户端
 * 通过微信云函数中转获取IoTDA设备数据
 */

const CLOUD_FUNCTION_NAME = 'quickstartFunctions';

class IoTDACLoudClient {
  constructor() {
    this.isConnected = false;
    this.pollingTimer = null;
    this.pollingInterval = 3000; // 轮询间隔3秒

    // 传感器数据回调
    this.onSensorData = null;
    // 连接状态回调
    this.onConnectionChange = null;

    // 最后一次设备数据
    this.lastDeviceData = null;
  }

  /**
   * 初始化
   * @param {Object} options - { deviceId, deviceSecret, projectId }
   */
  init(options) {
    this.deviceId = options.deviceId;
    this.deviceSecret = options.deviceSecret;
    this.projectId = options.projectId;
  }

  /**
   * 连接并开始轮询获取数据
   */
  connect() {
    if (this.pollingTimer) {
      console.log('[IoTDA] Already connecting');
      return;
    }

    const config = wx.getStorageSync('iotdaConfig');
    if (!config || !config.deviceId) {
      console.error('[IoTDA] No device configured');
      this._notifyConnectionChange(false, '未配置设备');
      return;
    }

    this.deviceId = config.deviceId;
    this.deviceSecret = config.deviceSecret;
    this.projectId = config.projectId;
    this.iamUsername = config.iamUsername;
    this.iamPassword = config.iamPassword;

    console.log('[IoTDA] Connecting via cloud function...');

    // 先配置云函数的设备参数
    this._configureDevice().then(() => {
      // 开始轮询
      this._startPolling();
      this._notifyConnectionChange(true);
    }).catch(err => {
      console.error('[IoTDA] Configure failed:', err);
      this._notifyConnectionChange(false, err.message);
    });
  }

  /**
   * 配置云函数的设备参数
   */
  _configureDevice() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: CLOUD_FUNCTION_NAME,
        data: {
          action: 'setConfig',
          deviceId: this.deviceId,
          deviceSecret: this.deviceSecret,
          projectId: this.projectId,
          iamUsername: this.iamUsername,
          iamPassword: this.iamPassword
        }
      }).then(res => {
        if (res.result && res.result.success) {
          resolve(res.result);
        } else {
          reject(new Error(res.result?.error || '配置失败'));
        }
      }).catch(err => {
        reject(err);
      });
    });
  }

  /**
   * 获取设备数据
   */
  _fetchDeviceData() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: CLOUD_FUNCTION_NAME,
        data: {
          action: 'getDeviceData'
        }
      }).then(res => {
        console.log('[IoTDA] 云函数返回:', JSON.stringify(res.result));
        if (res.result && res.result.success) {
          resolve(res.result.data);
        } else {
          reject(new Error(res.result?.error || '获取数据失败'));
        }
      }).catch(err => {
        console.error('[IoTDA] 获取数据失败:', err);
        reject(err);
      });
    });
  }

  /**
   * 开始轮询
   */
  _startPolling() {
    this.isConnected = true;
    this._poll();

    this.pollingTimer = setInterval(() => {
      this._poll();
    }, this.pollingInterval);
  }

  /**
   * 轮询获取数据
   */
  _poll() {
    if (!this.isConnected) return;

    this._fetchDeviceData()
      .then(data => {
        this._processDeviceData(data);
      })
      .catch(err => {
        console.log('[IoTDA] Poll error:', err.message);
        // 轮询错误不中断连接，等待下一次轮询
      });
  }

  /**
   * 处理设备数据
   */
  _processDeviceData(data) {
    console.log('[IoTDA] 原始数据:', JSON.stringify(data));

    if (!data) return;

    // IoTDA返回格式可能是 { data: { properties: {...} } }
    let properties = data;

    if (data.data) {
      properties = data.data;
    }

    if (properties && typeof properties === 'object') {
      // 解析传感器数据
      const sensorData = this._parseSensorData(properties);
      console.log('[IoTDA] 解析后传感器数据:', sensorData);
      if (sensorData && this.onSensorData) {
        this.onSensorData(sensorData);
      }
    }

    this.lastDeviceData = data;
  }

  /**
   * 解析传感器数据
   */
  _parseSensorData(properties) {
    // 根据ESP32定义的属性名解析
    // properties可能是嵌套的，需要根据实际返回格式调整
    let data = properties;

    // 如果有嵌套的properties对象
    if (properties.properties) {
      data = properties.properties;
    }

    // 如果有data字段
    if (properties.data) {
      data = properties.data;
    }

    // 确保数据是有效对象
    if (!data || typeof data !== 'object') return null;

    return {
      latitude: data.latitude || data.lat || null,
      longitude: data.longitude || data.lon || null,
      speed: data.speed || 0,
      accelerationX: data.accelerationX || data.ax || 0,
      accelerationY: data.accelerationY || data.ay || 0,
      accelerationZ: data.accelerationZ || data.az || 0,
      roll: data.roll || 0,
      pitch: data.pitch || 0,
      yaw: data.yaw || 0,
      timestamp: data.timestamp || Date.now()
    };
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.isConnected = false;
    this._notifyConnectionChange(false, '主动断开');
  }

  /**
   * 通知连接状态变化
   */
  _notifyConnectionChange(connected, reason = '') {
    if (this.onConnectionChange) {
      this.onConnectionChange(connected, reason);
    }
  }

  /**
   * 设置传感器数据回调
   */
  setOnSensorData(callback) {
    this.onSensorData = callback;
  }

  /**
   * 设置连接状态回调
   */
  setOnConnectionChange(callback) {
    this.onConnectionChange = callback;
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return this.isConnected;
  }

  /**
   * 设置轮询间隔
   */
  setPollingInterval(interval) {
    this.pollingInterval = interval;
    // 如果正在连接，需要重启轮询
    if (this.isConnected && this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this._startPolling();
    }
  }
}

// 单例模式
let instance = null;

function getIoTDACLoudClient() {
  if (!instance) {
    instance = new IoTDACLoudClient();
  }
  return instance;
}

module.exports = {
  IoTDACLoudClient,
  getIoTDACLoudClient
};
