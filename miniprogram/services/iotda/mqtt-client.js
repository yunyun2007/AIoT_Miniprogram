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
  _parseSensorData(data) {
    // 根据ESP32定义的属性名解析
    // IoTDA shadow返回格式: { device_id, shadow: [{ service_id, reported: { properties: {...} } }] }
    let properties = data;

    // 处理shadow格式
    if (data.shadow && data.shadow[0] && data.shadow[0].reported) {
      properties = data.shadow[0].reported.properties || data.shadow[0].reported;
    }
    // 处理嵌套的properties对象
    else if (data.properties) {
      properties = data.properties;
    }
    // 处理data字段
    else if (data.data) {
      properties = data.data;
    }

    // 确保数据是有效对象
    if (!properties || typeof properties !== 'object') return null;

    return {
      latitude: properties.latitude || properties.lat || null,
      longitude: properties.longitude || properties.lon || null,
      speed: properties.speed || 0,
      accelerationX: properties.accelerationX || properties.accX || 0,
      accelerationY: properties.accelerationY || properties.accY || 0,
      accelerationZ: properties.accelerationZ || properties.accZ || 0,
      roll: properties.roll || 0,
      pitch: properties.pitch || 0,
      yaw: properties.yaw || 0,
      timestamp: properties.timestamp || Date.now()
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
